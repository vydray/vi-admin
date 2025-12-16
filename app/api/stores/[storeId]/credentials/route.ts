import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'

// 認証チェック
async function checkSuperAdmin() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return false

  try {
    const session = JSON.parse(sessionCookie.value)
    return session.role === 'super_admin'
  } catch {
    return false
  }
}

// GET: 店舗のユーザー情報を取得
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const isSuperAdmin = await checkSuperAdmin()
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { storeId } = await params
    const supabase = getSupabaseServerClient()

    // POSユーザーを取得（passwordカラムを使用）
    const { data: posUsers, error: posError } = await supabase
      .from('users')
      .select('id, username, password, role')
      .eq('store_id', parseInt(storeId))
      .order('id')

    if (posError) {
      console.error('Error fetching POS users:', posError)
    }

    // vi-adminユーザーを取得（パスワードハッシュは返さない）
    const { data: adminUsers, error: adminError } = await supabase
      .from('admin_users')
      .select('id, username, role, is_active, permissions')
      .eq('store_id', parseInt(storeId))
      .order('id')

    if (adminError) {
      console.error('Error fetching admin users:', adminError)
    }

    return NextResponse.json({
      posUsers: posUsers || [],
      adminUsers: adminUsers || []
    })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT: ユーザー情報を更新
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const isSuperAdmin = await checkSuperAdmin()
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { storeId } = await params
    const body = await request.json()
    const { type, userId, username, password } = body

    const supabase = getSupabaseServerClient()

    if (type === 'pos') {
      // POSユーザー更新（パスワードは平文）
      const updateData: { username?: string; password?: string } = {}

      if (username) {
        updateData.username = username.trim()
      }
      if (password) {
        updateData.password = password // 平文のまま保存
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: '更新する項目がありません' }, { status: 400 })
      }

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .eq('store_id', storeId)

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'ユーザー名が既に使用されています' }, { status: 400 })
        }
        throw error
      }

      return NextResponse.json({ success: true, message: 'POSユーザーを更新しました' })

    } else if (type === 'admin') {
      // vi-adminユーザー更新（パスワードはbcryptハッシュ化）
      const updateData: { username?: string; password_hash?: string; updated_at?: string } = {}

      if (username) {
        updateData.username = username.trim()
      }
      if (password) {
        // bcryptでハッシュ化
        const saltRounds = 10
        updateData.password_hash = await bcrypt.hash(password, saltRounds)
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ error: '更新する項目がありません' }, { status: 400 })
      }

      updateData.updated_at = new Date().toISOString()

      const { error } = await supabase
        .from('admin_users')
        .update(updateData)
        .eq('id', userId)
        .eq('store_id', storeId)

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'ユーザー名が既に使用されています' }, { status: 400 })
        }
        throw error
      }

      return NextResponse.json({ success: true, message: 'vi-adminユーザーを更新しました' })

    } else {
      return NextResponse.json({ error: '無効なtypeです' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: 新規ユーザー作成
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storeId: string }> }
) {
  try {
    const isSuperAdmin = await checkSuperAdmin()
    if (!isSuperAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { storeId } = await params
    const body = await request.json()
    const { type, username, password, role } = body

    if (!username || !password) {
      return NextResponse.json({ error: 'ユーザー名とパスワードは必須です' }, { status: 400 })
    }

    const supabase = getSupabaseServerClient()

    if (type === 'pos') {
      // POSユーザー作成（パスワードは平文）
      const { error } = await supabase
        .from('users')
        .insert({
          store_id: parseInt(storeId),
          username: username.trim(),
          password: password, // 平文
          role: role || 'admin'
        })

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'ユーザー名が既に使用されています' }, { status: 400 })
        }
        throw error
      }

      return NextResponse.json({ success: true, message: 'POSユーザーを作成しました' })

    } else if (type === 'admin') {
      // vi-adminユーザー作成（パスワードはbcryptハッシュ化）
      const saltRounds = 10
      const passwordHash = await bcrypt.hash(password, saltRounds)

      const { error } = await supabase
        .from('admin_users')
        .insert({
          store_id: parseInt(storeId),
          username: username.trim(),
          password_hash: passwordHash,
          role: role || 'store_admin',
          is_active: true
        })

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'ユーザー名が既に使用されています' }, { status: 400 })
        }
        throw error
      }

      return NextResponse.json({ success: true, message: 'vi-adminユーザーを作成しました' })

    } else {
      return NextResponse.json({ error: '無効なtypeです' }, { status: 400 })
    }
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
