/**
 * RLSをバイパスするサーバーサイドAPIを呼び出すクライアント
 * vi-adminは管理パネルなので、全店舗のデータにアクセスする必要がある
 */

interface Filter {
  column: string
  op: 'eq' | 'gte' | 'lte' | 'in'
  value: unknown
}

interface Query {
  select?: string
  filters?: Filter[]
  order?: {
    column: string
    ascending?: boolean
    nullsFirst?: boolean
  }
  limit?: number
}

interface DbRequest {
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  table: string
  query?: Query
  data?: unknown
}

async function dbRequest<T>(request: DbRequest): Promise<{ data: T | null; error: string | null }> {
  try {
    const response = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    const result = await response.json()

    if (!response.ok) {
      return { data: null, error: result.error || 'Request failed' }
    }

    return { data: result.data, error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Supabase互換のクエリビルダー
 * 既存のコードを最小限の変更で移行できるように設計
 */
export function db(table: string) {
  const state: {
    selectColumns: string
    filters: Filter[]
    orderConfig?: { column: string; ascending?: boolean; nullsFirst?: boolean }
    limitCount?: number
  } = {
    selectColumns: '*',
    filters: [],
  }

  const builder = {
    select(columns: string = '*') {
      state.selectColumns = columns
      return builder
    },

    eq(column: string, value: unknown) {
      state.filters.push({ column, op: 'eq', value })
      return builder
    },

    gte(column: string, value: unknown) {
      state.filters.push({ column, op: 'gte', value })
      return builder
    },

    lte(column: string, value: unknown) {
      state.filters.push({ column, op: 'lte', value })
      return builder
    },

    in(column: string, values: unknown[]) {
      state.filters.push({ column, op: 'in', value: values })
      return builder
    },

    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) {
      state.orderConfig = { column, ...options }
      return builder
    },

    limit(count: number) {
      state.limitCount = count
      return builder
    },

    async then<T>(resolve: (value: { data: T | null; error: { message: string } | null }) => void) {
      const result = await dbRequest<T>({
        action: 'select',
        table,
        query: {
          select: state.selectColumns,
          filters: state.filters.length > 0 ? state.filters : undefined,
          order: state.orderConfig,
          limit: state.limitCount,
        },
      })

      resolve({
        data: result.data,
        error: result.error ? { message: result.error } : null,
      })
    },
  }

  return builder
}

/**
 * INSERT操作
 */
export async function dbInsert<T>(table: string, data: unknown): Promise<{ data: T | null; error: { message: string } | null }> {
  const result = await dbRequest<T>({
    action: 'insert',
    table,
    data,
  })

  return {
    data: result.data,
    error: result.error ? { message: result.error } : null,
  }
}

/**
 * UPDATE操作
 */
export async function dbUpdate<T>(
  table: string,
  data: unknown,
  filters: Filter[]
): Promise<{ data: T | null; error: { message: string } | null }> {
  const result = await dbRequest<T>({
    action: 'update',
    table,
    data,
    query: { filters },
  })

  return {
    data: result.data,
    error: result.error ? { message: result.error } : null,
  }
}

/**
 * DELETE操作
 */
export async function dbDelete(
  table: string,
  filters: Filter[]
): Promise<{ data: null; error: { message: string } | null }> {
  const result = await dbRequest<null>({
    action: 'delete',
    table,
    query: { filters },
  })

  return {
    data: null,
    error: result.error ? { message: result.error } : null,
  }
}

/**
 * UPSERT操作
 */
export async function dbUpsert<T>(table: string, data: unknown): Promise<{ data: T | null; error: { message: string } | null }> {
  const result = await dbRequest<T>({
    action: 'upsert',
    table,
    data,
  })

  return {
    data: result.data,
    error: result.error ? { message: result.error } : null,
  }
}
