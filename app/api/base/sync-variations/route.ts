import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import { fetchItems, addItemVariation, deleteItemVariation, refreshAccessToken } from '@/lib/baseApi'

/**
 * BASE商品にバリエーションを同期
 * - POS表示ONのキャスト: BASEにバリエーションを追加
 * - POS表示OFFのキャスト: BASEからバリエーションを削除
 * POST /api/base/sync-variations
 * body: { store_id, base_product_id }
 */
export async function POST(request: NextRequest) {
  try {
    const { store_id, base_product_id } = await request.json()

    if (!store_id || !base_product_id) {
      return NextResponse.json(
        { error: 'store_id and base_product_id are required' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseServerClient()

    // base_settingsを取得
    const { data: settings, error: settingsError } = await supabase
      .from('base_settings')
      .select('*')
      .eq('store_id', store_id)
      .single()

    if (settingsError || !settings) {
      return NextResponse.json(
        { error: 'BASE settings not found' },
        { status: 400 }
      )
    }

    if (!settings.access_token) {
      return NextResponse.json(
        { error: 'Not authenticated with BASE' },
        { status: 401 }
      )
    }

    // トークンの有効期限をチェック
    let accessToken = settings.access_token
    if (settings.token_expires_at) {
      const expiresAt = new Date(settings.token_expires_at)
      if (expiresAt < new Date()) {
        // トークンを更新
        if (!settings.refresh_token || !settings.client_id || !settings.client_secret) {
          return NextResponse.json(
            { error: 'Cannot refresh token - missing credentials' },
            { status: 401 }
          )
        }

        try {
          const newTokens = await refreshAccessToken(
            settings.client_id,
            settings.client_secret,
            settings.refresh_token
          )

          accessToken = newTokens.access_token
          const newExpiresAt = new Date(Date.now() + newTokens.expires_in * 1000)

          // 新しいトークンを保存
          await supabase
            .from('base_settings')
            .update({
              access_token: newTokens.access_token,
              refresh_token: newTokens.refresh_token,
              token_expires_at: newExpiresAt.toISOString(),
            })
            .eq('store_id', store_id)
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError)
          return NextResponse.json(
            { error: 'Token expired and refresh failed' },
            { status: 401 }
          )
        }
      }
    }

    // ローカルのBASE商品を取得
    const { data: baseProduct, error: productError } = await supabase
      .from('base_products')
      .select('*')
      .eq('id', base_product_id)
      .eq('store_id', store_id)
      .single()

    if (productError || !baseProduct) {
      return NextResponse.json(
        { error: 'BASE product not found' },
        { status: 404 }
      )
    }

    // 全てのバリエーションを取得（cast情報も含む）
    const { data: allVariations, error: variationsError } = await supabase
      .from('base_variations')
      .select(`
        *,
        cast:casts!base_variations_cast_id_fkey(id, name, show_in_pos, is_active)
      `)
      .eq('base_product_id', base_product_id)
      .eq('is_active', true)

    if (variationsError) {
      return NextResponse.json(
        { error: 'Failed to get variations' },
        { status: 500 }
      )
    }

    // BASE APIから商品一覧を取得して、商品名でマッチング
    const itemsResponse = await fetchItems(accessToken)
    const baseItem = itemsResponse.items?.find(
      item => item.title === baseProduct.base_product_name
    )

    if (!baseItem) {
      return NextResponse.json(
        { error: `BASE商品 "${baseProduct.base_product_name}" が見つかりません。BASEで先に商品を作成してください。` },
        { status: 404 }
      )
    }

    // 既存のBASEバリエーションをマップ（名前 -> variation_id）
    const baseVariationsMap = new Map<string, number>()
    for (const v of baseItem.variations || []) {
      baseVariationsMap.set(v.variation, v.variation_id)
    }

    let addedCount = 0
    let deletedCount = 0
    let errorCount = 0
    const errors: string[] = []

    for (const variation of allVariations || []) {
      const cast = variation.cast as { id: number; name: string; show_in_pos: boolean; is_active: boolean } | null
      const shouldBeInBase = cast?.show_in_pos && cast?.is_active
      const existsInBase = baseVariationsMap.has(variation.variation_name)

      if (shouldBeInBase && !existsInBase) {
        // POS表示ON & BASEに存在しない → 追加
        try {
          await addItemVariation(
            accessToken,
            baseItem.item_id,
            variation.variation_name
          )

          // 同期済みとしてマーク
          await supabase
            .from('base_variations')
            .update({ is_synced: true })
            .eq('id', variation.id)

          addedCount++
        } catch (err) {
          console.error(`Failed to add variation ${variation.variation_name}:`, err)
          errors.push(`追加失敗: ${variation.variation_name}`)
          errorCount++
        }
      } else if (shouldBeInBase && existsInBase && !variation.is_synced) {
        // POS表示ON & BASEに既に存在 & 未同期 → 同期済みとしてマーク
        await supabase
          .from('base_variations')
          .update({ is_synced: true })
          .eq('id', variation.id)
        addedCount++
      } else if (!shouldBeInBase && existsInBase) {
        // POS表示OFF & BASEに存在する → 削除
        try {
          const variationId = baseVariationsMap.get(variation.variation_name)!
          await deleteItemVariation(
            accessToken,
            baseItem.item_id,
            variationId
          )

          // ローカルでも非アクティブに
          await supabase
            .from('base_variations')
            .update({ is_active: false, is_synced: false })
            .eq('id', variation.id)

          deletedCount++
        } catch (err) {
          console.error(`Failed to delete variation ${variation.variation_name}:`, err)
          errors.push(`削除失敗: ${variation.variation_name}`)
          errorCount++
        }
      } else if (!shouldBeInBase && !existsInBase) {
        // POS表示OFF & BASEに存在しない → ローカルのみ非アクティブに
        await supabase
          .from('base_variations')
          .update({ is_active: false })
          .eq('id', variation.id)
        deletedCount++
      }
    }

    return NextResponse.json({
      success: true,
      added: addedCount,
      deleted: deletedCount,
      errors: errorCount,
      errorDetails: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error('BASE sync-variations error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
