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
  tokenSecret: string = ''
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const storeId = searchParams.get('storeId')

  if (!storeId) {
    return NextResponse.redirect(new URL('/twitter-settings?error=missing_store_id', request.url))
  }

  try {
    // 店舗のAPI認証情報を取得
    const { data: settings, error } = await supabase
      .from('store_twitter_settings')
      .select('api_key, api_secret')
      .eq('store_id', storeId)
      .single()

    if (error || !settings?.api_key || !settings?.api_secret) {
      return NextResponse.redirect(new URL('/twitter-settings?error=no_credentials', request.url))
    }

    const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/twitter/callback`
    const requestTokenUrl = 'https://api.twitter.com/oauth/request_token'

    // OAuth パラメータ
    const oauthParams: Record<string, string> = {
      oauth_callback: callbackUrl,
      oauth_consumer_key: settings.api_key,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_version: '1.0',
    }

    // 署名を生成
    oauthParams.oauth_signature = generateOAuthSignature(
      'POST',
      requestTokenUrl,
      oauthParams,
      settings.api_secret
    )

    // Request Token取得
    const response = await fetch(requestTokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': generateOAuthHeader(oauthParams),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('Request token error:', text)
      return NextResponse.redirect(new URL('/twitter-settings?error=request_token_failed', request.url))
    }

    const responseText = await response.text()
    const params = new URLSearchParams(responseText)
    const oauthToken = params.get('oauth_token')
    const oauthTokenSecret = params.get('oauth_token_secret')

    if (!oauthToken || !oauthTokenSecret) {
      return NextResponse.redirect(new URL('/twitter-settings?error=invalid_response', request.url))
    }

    // Token Secretを一時保存（セッションストレージ代わりにSupabaseに保存）
    await supabase
      .from('store_twitter_settings')
      .update({
        refresh_token: JSON.stringify({
          oauth_token_secret: oauthTokenSecret,
          store_id: storeId,
          expires: Date.now() + 10 * 60 * 1000 // 10分
        }),
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', storeId)

    // Twitter認証ページにリダイレクト
    const authorizeUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${oauthToken}`
    return NextResponse.redirect(authorizeUrl)
  } catch (error) {
    console.error('OAuth auth error:', error)
    return NextResponse.redirect(new URL('/twitter-settings?error=auth_failed', request.url))
  }
}
