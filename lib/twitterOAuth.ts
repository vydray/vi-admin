import crypto from 'crypto'

export interface TwitterCredentials {
  api_key: string
  api_secret: string
  access_token: string
  refresh_token: string // OAuth1.0a の token_secret 相当
}

export function generateOAuthSignature(
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

  return crypto
    .createHmac('sha1', signingKey)
    .update(signatureBaseString)
    .digest('base64')
}

export function generateOAuthHeader(params: Record<string, string>): string {
  return 'OAuth ' + Object.keys(params)
    .filter(key => key.startsWith('oauth_'))
    .sort()
    .map(key => `${encodeURIComponent(key)}="${encodeURIComponent(params[key])}"`)
    .join(', ')
}

function buildOAuthParams(apiKey: string, accessToken: string): Record<string, string> {
  return {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  }
}

export async function verifyTwitterCredentials(
  creds: TwitterCredentials
): Promise<{ ok: true; username: string; userId: string } | { ok: false; status: number; error: string }> {
  const url = 'https://api.twitter.com/2/users/me'
  const oauthParams = buildOAuthParams(creds.api_key, creds.access_token)
  oauthParams.oauth_signature = generateOAuthSignature('GET', url, oauthParams, creds.api_secret, creds.refresh_token)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: generateOAuthHeader(oauthParams) },
    })
    const body = await response.text()
    if (!response.ok) {
      return { ok: false, status: response.status, error: body.slice(0, 500) }
    }
    const json = JSON.parse(body) as { data?: { id: string; username: string } }
    if (!json.data) {
      return { ok: false, status: response.status, error: 'No data in response' }
    }
    return { ok: true, username: json.data.username, userId: json.data.id }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function postTweet(
  creds: TwitterCredentials,
  text: string,
  mediaIds?: string[]
): Promise<{ success: boolean; tweetId?: string; error?: string; status?: number }> {
  const url = 'https://api.twitter.com/2/tweets'
  const oauthParams = buildOAuthParams(creds.api_key, creds.access_token)
  oauthParams.oauth_signature = generateOAuthSignature('POST', url, oauthParams, creds.api_secret, creds.refresh_token)

  const tweetBody: { text: string; media?: { media_ids: string[] } } = { text }
  if (mediaIds && mediaIds.length > 0) {
    tweetBody.media = { media_ids: mediaIds }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: generateOAuthHeader(oauthParams),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetBody),
    })
    const data = await response.json()
    if (!response.ok) {
      return {
        success: false,
        status: response.status,
        error: data.detail || data.title || 'ツイートの投稿に失敗しました',
      }
    }
    return { success: true, tweetId: data.data?.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function uploadMediaToTwitter(
  creds: TwitterCredentials,
  imageUrl: string
): Promise<string | null> {
  const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json'
  try {
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) return null
    const imageBuffer = await imageResponse.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString('base64')

    const oauthParams = buildOAuthParams(creds.api_key, creds.access_token)
    oauthParams.oauth_signature = generateOAuthSignature('POST', uploadUrl, oauthParams, creds.api_secret, creds.refresh_token)

    const formData = new URLSearchParams()
    formData.append('media_data', base64Image)

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: generateOAuthHeader(oauthParams),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.media_id_string || null
  } catch {
    return null
  }
}
