/**
 * BASE API クライアント
 * https://docs.thebase.in/api/
 */

const BASE_API_URL = 'https://api.thebase.in'

export interface BaseOAuthTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope: string
}

export interface BaseOrder {
  unique_key: string
  order_item_id: number
  ordered: string // ISO datetime
  order_discount: number
  item_id: number
  item_title: string
  variation_id: number | null
  variation: string | null
  variation_option: string | null
  price: number
  amount: number
  total: number
  status: string
  payment: string
  delivery: string
  c_name: string
  c_address: string
  remark: string
}

export interface BaseOrdersResponse {
  orders: BaseOrder[]
}

export interface BaseItem {
  item_id: number
  title: string
  detail: string
  price: number
  stock: number
  visible: number
  list_order: number
  identifier: string
  img1_origin: string | null
  img2_origin: string | null
  img3_origin: string | null
  img4_origin: string | null
  img5_origin: string | null
  modified: string
  variations: BaseVariation[]
}

export interface BaseVariation {
  variation_id: number
  variation: string
  variation_stock: number
  variation_identifier: string
}

/**
 * 認可URLを生成
 */
export function getAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read_users read_items read_orders',
    state,
  })
  return `${BASE_API_URL}/1/oauth/authorize?${params.toString()}`
}

/**
 * 認可コードをアクセストークンに交換
 */
export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<BaseOAuthTokens> {
  const response = await fetch(`${BASE_API_URL}/1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  return response.json()
}

/**
 * リフレッシュトークンでアクセストークンを更新
 */
export async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<BaseOAuthTokens> {
  const response = await fetch(`${BASE_API_URL}/1/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token refresh failed: ${error}`)
  }

  return response.json()
}

/**
 * 注文一覧を取得
 */
export async function fetchOrders(
  accessToken: string,
  options?: {
    start_ordered?: string // YYYY-MM-DD
    end_ordered?: string   // YYYY-MM-DD
    limit?: number
    offset?: number
  }
): Promise<BaseOrdersResponse> {
  const params = new URLSearchParams()
  if (options?.start_ordered) params.set('start_ordered', options.start_ordered)
  if (options?.end_ordered) params.set('end_ordered', options.end_ordered)
  if (options?.limit) params.set('limit', options.limit.toString())
  if (options?.offset) params.set('offset', options.offset.toString())

  const url = `${BASE_API_URL}/1/orders?${params.toString()}`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Fetch orders failed: ${error}`)
  }

  return response.json()
}

/**
 * 商品一覧を取得
 */
export async function fetchItems(
  accessToken: string
): Promise<{ items: BaseItem[] }> {
  const response = await fetch(`${BASE_API_URL}/1/items`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Fetch items failed: ${error}`)
  }

  return response.json()
}
