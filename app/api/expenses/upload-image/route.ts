import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// セッション検証関数
async function validateSession(): Promise<{ storeId: number; isAllStore: boolean } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    return {
      storeId: session.storeId,
      isAllStore: session.isAllStore || false
    }
  } catch {
    return null
  }
}

// POST: 領収書画像をアップロード
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const storeId = formData.get('storeId') as string
    const expenseId = formData.get('expenseId') as string

    if (!file || !storeId || !expenseId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // ファイル拡張子を取得
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const timestamp = Date.now()
    const fileName = `${storeId}/${expenseId}/${timestamp}.${fileExt}`

    // ファイルをBufferに変換
    const buffer = Buffer.from(await file.arrayBuffer())

    // Storageにアップロード
    const { error: uploadError } = await supabase.storage
      .from('expense-receipts')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      )
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage
      .from('expense-receipts')
      .getPublicUrl(fileName)

    // expensesテーブルのreceipt_pathを更新
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ receipt_path: urlData.publicUrl })
      .eq('id', parseInt(expenseId))
      .eq('store_id', parseInt(storeId))

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update expense' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      path: fileName,
      url: urlData.publicUrl,
    })
  } catch (error) {
    console.error('Receipt upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE: 領収書画像を削除
export async function DELETE(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { searchParams } = new URL(request.url)
    const storeId = searchParams.get('storeId')
    const expenseId = searchParams.get('expenseId')

    if (!storeId || !expenseId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    // まず現在のreceipt_pathを取得
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('receipt_path')
      .eq('id', parseInt(expenseId))
      .eq('store_id', parseInt(storeId))
      .single()

    if (fetchError || !expense?.receipt_path) {
      return NextResponse.json(
        { error: 'Expense not found or no receipt' },
        { status: 404 }
      )
    }

    // URLからパスを抽出
    const url = new URL(expense.receipt_path)
    const pathMatch = url.pathname.match(/expense-receipts\/(.+)$/)
    if (pathMatch) {
      const filePath = pathMatch[1]
      // Storageからファイルを削除
      await supabase.storage
        .from('expense-receipts')
        .remove([filePath])
    }

    // expensesテーブルのreceipt_pathをnullに
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ receipt_path: null })
      .eq('id', parseInt(expenseId))
      .eq('store_id', parseInt(storeId))

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update expense' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Receipt delete error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
