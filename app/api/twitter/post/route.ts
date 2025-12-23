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

// ツイートを投稿
async function postTweet(
  text: string,
  apiKey: string,
  apiSecret: string,
  accessToken: string,
  accessTokenSecret: string
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

  try {
    const response = await fetch(tweetUrl, {
      method: 'POST',
      headers: {
        'Authorization': generateOAuthHeader(oauthParams),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
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

    // ツイートを投稿
    const result = await postTweet(
      post.content,
      settings.api_key,
      settings.api_secret,
      settings.access_token,
      settings.refresh_token // OAuth 1.0aではaccess_token_secret
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
