import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import sharp from 'sharp'
import { withCronLock } from '@/lib/cronLock'
import { getTwitterAppCreds } from '@/lib/twitterOAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 型定義
interface TwitterSettings {
  store_id: number
  access_token: string | null
  refresh_token: string | null
}

// Cron認証（Vercel Cron Jobs用）
function validateCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // CRON_SECRETが未設定の場合は全てブロック
  if (!cronSecret) {
    console.error('[Cron Auth] CRON_SECRET is not configured')
    return false
  }

  return authHeader === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Cron Job重複実行防止（ロック取得）
  const result = await withCronLock('twitter-posts', async () => {
    return await executeTwitterPosts()
  }, 600) // 10分タイムアウト

  if (result === null) {
    return NextResponse.json({
      message: 'Job is already running, skipped'
    })
  }

  return result
}

async function executeTwitterPosts() {
  try {
    const now = new Date()

    // 投稿時間が過ぎているpending投稿を取得
    const { data: pendingPosts, error: fetchError } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(10) // 一度に処理する最大数

    if (fetchError) {
      console.error('Fetch pending posts error:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch posts' }, { status: 500 })
    }

    if (!pendingPosts || pendingPosts.length === 0) {
      return NextResponse.json({ message: 'No pending posts', processed: 0 })
    }

    // 対象投稿のstore_idに紐づくTwitter設定を一括取得
    const storeIds = Array.from(new Set(pendingPosts.map(p => p.store_id)))
    const { data: settingsList, error: settingsError } = await supabase
      .from('store_twitter_settings')
      .select('store_id, access_token, refresh_token')
      .in('store_id', storeIds)

    if (settingsError) {
      console.error('Fetch twitter settings error:', settingsError)
      return NextResponse.json({ error: 'Failed to fetch twitter settings' }, { status: 500 })
    }

    const settingsByStore = new Map<number, TwitterSettings>()
    for (const s of (settingsList || []) as TwitterSettings[]) {
      settingsByStore.set(s.store_id, s)
    }

    // アプリ共通の Consumer Key/Secret
    const appCreds = getTwitterAppCreds()
    if (!appCreds) {
      console.error('TWITTER_API_KEY / TWITTER_API_SECRET not configured')
      return NextResponse.json({ error: 'Twitter app credentials not configured' }, { status: 500 })
    }

    let successCount = 0
    let failCount = 0

    for (const post of pendingPosts) {
      const settings = settingsByStore.get(post.store_id)

      if (!settings?.access_token || !settings.refresh_token) {
        // 認証情報がない場合はスキップ
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'failed',
            error_message: 'Twitter認証情報がありません',
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id)
        failCount++
        continue
      }

      // TODO: Twitter OAuth 2.0トークンの有効期限チェック実装
      // store_twitter_settingsテーブルにtoken_expires_atカラムを追加し、
      // 有効期限切れの場合はrefresh_tokenで自動更新する機能が必要
      // 現状: トークン期限切れの場合、API呼び出し時に401エラーで検知される

      // 画像URLをパース（JSON配列または単一URL）
      let imageUrls: string[] = []
      if (post.image_url) {
        try {
          imageUrls = JSON.parse(post.image_url)
        } catch {
          // 旧形式（単一URL）の場合
          imageUrls = [post.image_url]
        }
      }

      // 画像をTwitterにアップロード
      const mediaIds: string[] = []
      const failedImageUploads: Array<{ url: string; reason: string }> = []
      for (const imageUrl of imageUrls) {
        const { mediaId, errorDetail } = await uploadMediaToTwitter(
          imageUrl,
          appCreds.api_key,
          appCreds.api_secret,
          settings.access_token,
          settings.refresh_token
        )
        if (mediaId) {
          mediaIds.push(mediaId)
        } else {
          failedImageUploads.push({ url: imageUrl, reason: errorDetail || 'unknown' })
        }
      }

      // 画像が指定されていたのに 1枚でも upload に失敗した場合は post 自体を失敗扱いに
      // (text-only で勝手にツイートして観測不能になる事故を防止)
      const imageUploadFailed = imageUrls.length > 0 && failedImageUploads.length > 0
      if (imageUploadFailed) {
        const reasonsCsv = failedImageUploads
          .map(f => `${f.url.split('/').pop()} → ${f.reason}`)
          .join(' | ')
        const errorMessage = `画像アップロード失敗 (${failedImageUploads.length}/${imageUrls.length}枚): ${reasonsCsv}`
        console.error(`[Twitter Post Cron] post ${post.id} skip: ${errorMessage}`)
        await supabase
          .from('scheduled_posts')
          .update({
            status: 'failed',
            posted_at: null,
            twitter_post_id: null,
            error_message: errorMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', post.id)
        failCount++
        // 画像upload失敗時は Storage 削除しない (次回再試行のために残す)
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      // ツイートを投稿（画像付き）
      const result = await postTweet(
        post.content,
        appCreds.api_key,
        appCreds.api_secret,
        settings.access_token,
        settings.refresh_token,
        mediaIds.length > 0 ? mediaIds : undefined
      )

      // 結果を保存
      // 認証エラー（401）の場合はトークン期限切れの可能性を示唆
      let errorMessage = result.error || null
      if (!result.success && errorMessage) {
        if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
          errorMessage += ' (トークン期限切れの可能性があります。Twitter設定で再認証してください)'
        }
      }

      await supabase
        .from('scheduled_posts')
        .update({
          status: result.success ? 'posted' : 'failed',
          posted_at: result.success ? new Date().toISOString() : null,
          twitter_post_id: result.tweetId || null,
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', post.id)

      if (result.success) {
        successCount++
        // 投稿成功後、Storageから画像を削除（容量節約）
        // ただし、同じ URL を他の pending/failed 投稿が参照してたら削除しない
        if (imageUrls.length > 0) {
          await deleteImagesFromStorageIfUnreferenced(imageUrls, post.id)
        }
      } else {
        failCount++
        // 認証エラーの場合はhealth_statusも更新
        if (errorMessage && (errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.toLowerCase().includes('unauthorized'))) {
          console.error(`[Twitter Post Cron] Authentication error for post ${post.id} (store ${post.store_id}): Token may be expired`)
          await supabase
            .from('store_twitter_settings')
            .update({
              health_status: 'broken',
              last_health_check_at: new Date().toISOString(),
              health_error_message: errorMessage,
            })
            .eq('store_id', post.store_id)
        }
      }

      // レート制限対策で少し待つ
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return NextResponse.json({
      message: 'Cron job completed',
      processed: pendingPosts.length,
      success: successCount,
      failed: failCount,
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Supabase Storageから画像を削除（同じ URL を他の pending/failed 投稿が参照してたら残す）
async function deleteImagesFromStorageIfUnreferenced(imageUrls: string[], currentPostId: number) {
  const bucketUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/twitter-images/`

  for (const url of imageUrls) {
    // 他に同じ image_url を参照してる pending/failed 投稿があるか確認
    // image_url は JSON配列文字列なので部分一致で検索
    const { data: refs, error: refErr } = await supabase
      .from('scheduled_posts')
      .select('id, status')
      .neq('id', currentPostId)
      .in('status', ['pending', 'failed'])
      .like('image_url', `%${url}%`)
      .limit(1)

    if (refErr) {
      console.error('Failed to check image references:', refErr)
      // 参照チェックに失敗したら安全側に倒して削除しない
      continue
    }
    if (refs && refs.length > 0) {
      console.log(`[Storage Cleanup] skip ${url} — referenced by post ${refs[0].id} (${refs[0].status})`)
      continue
    }

    // URLからパスを抽出して削除
    if (url.startsWith(bucketUrl)) {
      const path = url.replace(bucketUrl, '')
      try {
        const { error } = await supabase.storage
          .from('twitter-images')
          .remove([path])

        if (error) {
          console.error('Failed to delete image:', path, error)
        }
      } catch (err) {
        console.error('Delete image error:', err)
      }
    }
  }
}

// OAuth 1.0a署名生成
function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')

  const signatureBaseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams)
  ].join('&')

  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`

  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(signatureBaseString)
    .digest('base64')

  return signature
}

// OAuth 1.0a Authorizationヘッダー生成
function generateOAuthHeader(params: Record<string, string>): string {
  const headerParams = Object.keys(params)
    .filter(key => key.startsWith('oauth_'))
    .sort()
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(params[key])}"`)
    .join(', ')

  return `OAuth ${headerParams}`
}

// 画像をTwitterにアップロードしてmedia_idを取得
// transient な失敗は 1回リトライ。失敗時は errorDetail を返して error_message に保存できるようにする。
async function uploadMediaToTwitter(
  imageUrl: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string
): Promise<{ mediaId: string | null; errorDetail?: string }> {
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json'

  // 1) 画像をダウンロード (最大2回 trial、500ms backoff)
  let imageBuffer: ArrayBuffer | null = null
  let imageFetchError = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const imageResponse = await fetch(imageUrl)
      if (!imageResponse.ok) {
        imageFetchError = `HTTP ${imageResponse.status}`
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 500))
          continue
        }
        return { mediaId: null, errorDetail: `image fetch ${imageFetchError}` }
      }
      imageBuffer = await imageResponse.arrayBuffer()
      break
    } catch (e) {
      imageFetchError = e instanceof Error ? e.message : 'unknown'
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }
      return { mediaId: null, errorDetail: `image fetch exception: ${imageFetchError}` }
    }
  }
  if (!imageBuffer) {
    return { mediaId: null, errorDetail: `image fetch ${imageFetchError}` }
  }

  // webp は Twitter が tweet 添付で拒否する("You are not permitted to perform this action")。
  // アップロード入口(upload-image API)で PNG 変換済みだが、既存の webp 保存分や取りこぼし対策として
  // ここでも format を判定し webp なら PNG に変換する。
  let imgBuf: Buffer = Buffer.from(new Uint8Array(imageBuffer))
  try {
    const meta = await sharp(imgBuf).metadata()
    if (meta.format === 'webp') {
      imgBuf = await sharp(imgBuf).png().toBuffer()
    }
  } catch (e) {
    // 変換失敗時は元データのまま続行（jpeg/png はそのまま通る）
    console.warn('[twitter-posts] webp変換チェック失敗:', e instanceof Error ? e.message : e)
  }

  const base64Image = imgBuf.toString('base64')

  // 2) Twitter v1.1 media upload (最大2回 trial、1s backoff、OAuthは毎回再生成)
  let lastErrorDetail = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: apiKey,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: accessToken,
      oauth_version: '1.0',
    }
    // RFC 5849 §3.4.1.3.1: Content-Type=application/x-www-form-urlencoded の場合、
    // body の form parameter も signature base string に含める必要がある。
    // ここでは media_data(base64) も含めて署名計算する。
    // Authorization ヘッダには oauth_* のみ載せる (generateOAuthHeader が startsWith('oauth_') でフィルタ)
    oauthParams.oauth_signature = generateOAuthSignature(
      'POST',
      uploadUrl,
      { ...oauthParams, media_data: base64Image },
      apiSecret,
      accessTokenSecret
    )

    const formData = new URLSearchParams()
    formData.append('media_data', base64Image)

    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': generateOAuthHeader(oauthParams),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      })

      if (response.ok) {
        const data = await response.json()
        const mediaId = data.media_id_string || null
        if (mediaId) return { mediaId }
        lastErrorDetail = `no media_id_string in response: ${JSON.stringify(data).slice(0, 200)}`
      } else {
        const errorText = await response.text()
        lastErrorDetail = `HTTP ${response.status}: ${errorText.slice(0, 300)}`
        // 4xx は retry しない (権限/署名/duplicate 等、retry しても同じ)
        if (response.status >= 400 && response.status < 500) {
          return { mediaId: null, errorDetail: `media upload ${lastErrorDetail}` }
        }
      }
    } catch (e) {
      lastErrorDetail = `exception: ${e instanceof Error ? e.message : 'unknown'}`
    }

    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  return { mediaId: null, errorDetail: `media upload ${lastErrorDetail}` }
}

// ツイートを投稿（画像対応）
async function postTweet(
  text: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string,
  mediaIds?: string[]
): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const tweetUrl = 'https://api.twitter.com/2/tweets'

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }

  oauthParams.oauth_signature = generateOAuthSignature(
    'POST',
    tweetUrl,
    oauthParams,
    apiSecret,
    accessTokenSecret
  )

  // リクエストボディを構築
  const tweetBody: { text: string; media?: { media_ids: string[] } } = { text }
  if (mediaIds && mediaIds.length > 0) {
    tweetBody.media = { media_ids: mediaIds }
  }

  try {
    const response = await fetch(tweetUrl, {
      method: 'POST',
      headers: {
        'Authorization': generateOAuthHeader(oauthParams),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Tweet error:', data)
      return {
        success: false,
        error: data.detail || data.title || 'ツイートの投稿に失敗しました',
      }
    }

    return {
      success: true,
      tweetId: data.data?.id,
    }
  } catch (error) {
    console.error('Post tweet error:', error)
    return {
      success: false,
      error: 'Failed to post tweet',
    }
  }
}
