/**
 * BASE API クライアント
 * https://docs.thebase.in/api/
 */

const BASE_API_URL = 'https://api.thebase.in'
const DEFAULT_TIMEOUT = 30000 // 30秒

/**
 * タイムアウト付きfetch
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

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
    scope: 'read_users read_items write_items read_orders',
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
  const response = await fetchWithTimeout(url, {
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

/**
 * 商品詳細を取得
 */
export async function fetchItem(
  accessToken: string,
  itemId: number
): Promise<{ item: BaseItem }> {
  const response = await fetch(`${BASE_API_URL}/1/items/detail/${itemId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Fetch item failed: ${error}`)
  }

  return response.json()
}

/**
 * 商品にバリエーションを追加
 * BASE APIには独立したadd_variationエンドポイントがないため、
 * items/editを使用して既存バリエーション + 新規バリエーションを送信する
 * https://docs.thebase.in/api/items/edit
 */
export async function addItemVariation(
  accessToken: string,
  itemId: number,
  variationName: string,
  stock: number = 100
): Promise<{ item: BaseItem }> {
  // まず現在の商品情報を取得して既存のバリエーションを取得
  const currentItem = await fetchItem(accessToken, itemId)
  const existingVariations = currentItem.item.variations || []

  console.log('[BASE API] Current variations:', existingVariations.map(v => v.variation))

  // items/editで既存バリエーション + 新規バリエーションを設定
  const params = new URLSearchParams()
  params.set('item_id', itemId.toString())

  // 既存のバリエーションを追加
  let index = 0
  for (const v of existingVariations) {
    params.set(`variation_id[${index}]`, v.variation_id.toString())
    params.set(`variation[${index}]`, v.variation)
    params.set(`variation_stock[${index}]`, v.variation_stock.toString())
    index++
  }

  // 新規バリエーションを追加（variation_idは指定しない）
  params.set(`variation[${index}]`, variationName)
  params.set(`variation_stock[${index}]`, stock.toString())

  console.log('[BASE API] Adding variation:', { itemId, variationName, stock, totalVariations: index + 1 })
  console.log('[BASE API] Request params:', params.toString())

  const response = await fetchWithTimeout(`${BASE_API_URL}/1/items/edit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  const responseText = await response.text()
  console.log('[BASE API] Add variation response:', response.status, responseText.substring(0, 500))

  if (!response.ok) {
    throw new Error(`Add variation failed: ${responseText}`)
  }

  try {
    return JSON.parse(responseText)
  } catch {
    throw new Error(`Add variation failed: Invalid JSON response - ${responseText}`)
  }
}

/**
 * 商品のバリエーションを削除
 */
export async function deleteItemVariation(
  accessToken: string,
  itemId: number,
  variationId: number
): Promise<{ item: BaseItem }> {
  const params = new URLSearchParams({
    item_id: itemId.toString(),
    variation_id: variationId.toString(),
  })

  const response = await fetch(`${BASE_API_URL}/1/items/delete_variation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Delete variation failed: ${error}`)
  }

  return response.json()
}
