import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
async function uploadMediaToTwitter(
  imageUrl: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string
): Promise<string | null> {
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json'

  try {
    // 画像をダウンロード
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      console.error('Failed to fetch image:', imageUrl)
      return null
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString('base64')

    // OAuth署名のためのパラメータ（media_dataは署名に含めない）
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
      uploadUrl,
      oauthParams,
      apiSecret,
      accessTokenSecret
    )

    // FormDataでアップロード
    const formData = new URLSearchParams()
    formData.append('media_data', base64Image)

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': generateOAuthHeader(oauthParams),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Media upload error:', errorText)
      return null
    }

    const data = await response.json()
    return data.media_id_string || null
  } catch (error) {
    console.error('Upload media error:', error)
    return null
  }
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
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// 手動投稿用エンドポイント
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { postId } = body

    if (!postId) {
      return NextResponse.json({ error: 'Post ID is required' }, { status: 400 })
    }

    // 投稿を取得
    const { data: post, error: postError } = await supabase
      .from('scheduled_posts')
      .select('*')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // 設定を取得
    const { data: settings, error: settingsError } = await supabase
      .from('store_twitter_settings')
      .select('*')
      .eq('store_id', post.store_id)
      .single()

    if (settingsError || !settings?.access_token) {
      return NextResponse.json({ error: 'Twitter not connected' }, { status: 400 })
    }

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
    for (const imageUrl of imageUrls) {
      const mediaId = await uploadMediaToTwitter(
        imageUrl,
        settings.api_key,
        settings.api_secret,
        settings.access_token,
        settings.refresh_token
      )
      if (mediaId) {
        mediaIds.push(mediaId)
      }
    }

    // ツイートを投稿（画像付き）
    const result = await postTweet(
      post.content,
      settings.api_key,
      settings.api_secret,
      settings.access_token,
      settings.refresh_token, // OAuth 1.0aではaccess_token_secret
      mediaIds.length > 0 ? mediaIds : undefined
    )

    // 結果を保存
    await supabase
      .from('scheduled_posts')
      .update({
        status: result.success ? 'posted' : 'failed',
        posted_at: result.success ? new Date().toISOString() : null,
        twitter_post_id: result.tweetId || null,
        error_message: result.error || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)

    if (result.success) {
      return NextResponse.json({ success: true, tweetId: result.tweetId })
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }
  } catch (error) {
    console.error('Post API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
