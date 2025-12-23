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
  const oauthToken = searchParams.get('oauth_token')
  const oauthVerifier = searchParams.get('oauth_verifier')
  const denied = searchParams.get('denied')

  // ユーザーがキャンセルした場合
  if (denied) {
    return NextResponse.redirect(new URL('/twitter-settings?error=user_denied', request.url))
  }

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(new URL('/twitter-settings?error=missing_params', request.url))
  }

  try {
    // 一時保存したToken Secretを取得（refresh_tokenフィールドに保存していた）
    const { data: allSettings, error: fetchError } = await supabase
      .from('store_twitter_settings')
      .select('*')

    if (fetchError) {
      console.error('Fetch settings error:', fetchError)
      return NextResponse.redirect(new URL('/twitter-settings?error=fetch_failed', request.url))
    }

    // Token Secretからstore_idを見つける
    let settings = null
    let storedData = null

    for (const s of allSettings || []) {
      if (s.refresh_token) {
        try {
          const parsed = JSON.parse(s.refresh_token)
          if (parsed.oauth_token_secret && parsed.expires > Date.now()) {
            settings = s
            storedData = parsed
            break
          }
        } catch {
          // JSONパース失敗は無視
        }
      }
    }

    if (!settings || !storedData) {
      return NextResponse.redirect(new URL('/twitter-settings?error=session_expired', request.url))
    }

    const accessTokenUrl = 'https://api.twitter.com/oauth/access_token'

    // OAuth パラメータ
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: settings.api_key,
      oauth_nonce: crypto.randomBytes(16).toString('hex'),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: oauthToken,
      oauth_verifier: oauthVerifier,
      oauth_version: '1.0',
    }

    // 署名を生成
    oauthParams.oauth_signature = generateOAuthSignature(
      'POST',
      accessTokenUrl,
      oauthParams,
      settings.api_secret,
      storedData.oauth_token_secret
    )

    // Access Token取得
    const response = await fetch(accessTokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': generateOAuthHeader(oauthParams),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('Access token error:', text)
      return NextResponse.redirect(new URL('/twitter-settings?error=access_token_failed', request.url))
    }

    const responseText = await response.text()
    const params = new URLSearchParams(responseText)
    const accessToken = params.get('oauth_token')
    const accessTokenSecret = params.get('oauth_token_secret')
    const userId = params.get('user_id')
    const screenName = params.get('screen_name')

    if (!accessToken || !accessTokenSecret) {
      return NextResponse.redirect(new URL('/twitter-settings?error=invalid_access_token', request.url))
    }

    // 設定を更新
    const { error: updateError } = await supabase
      .from('store_twitter_settings')
      .update({
        access_token: accessToken,
        refresh_token: accessTokenSecret, // OAuth 1.0aではaccess_token_secretをここに保存
        twitter_user_id: userId,
        twitter_username: screenName,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('store_id', settings.store_id)

    if (updateError) {
      console.error('Update settings error:', updateError)
      return NextResponse.redirect(new URL('/twitter-settings?error=save_failed', request.url))
    }

    return NextResponse.redirect(new URL('/twitter-settings?success=connected', request.url))
  } catch (error) {
    console.error('OAuth callback error:', error)
    return NextResponse.redirect(new URL('/twitter-settings?error=callback_failed', request.url))
  }
}
