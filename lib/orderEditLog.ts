import { supabase } from '@/lib/supabase'
import type { OrderEditActionType } from '@/types'

interface LogOrderEditParams {
  storeId: number
  orderId: number
  orderItemId?: number | null
  actionType: OrderEditActionType
  beforeValues: Record<string, unknown> | null
  afterValues: Record<string, unknown> | null
  modifiedBy: string
}

export async function logOrderEdit(params: LogOrderEditParams): Promise<void> {
  try {
    const { error } = await supabase.from('order_edit_logs').insert({
      store_id: params.storeId,
      order_id: params.orderId,
      order_item_id: params.orderItemId ?? null,
      action_type: params.actionType,
      before_values: params.beforeValues,
      after_values: params.afterValues,
      modified_by: params.modifiedBy,
    })
    if (error) {
      console.error('Failed to log order edit:', error)
    }
  } catch (error) {
    console.error('Failed to log order edit:', error)
  }
}
