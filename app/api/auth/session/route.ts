import { NextResponse } from 'next/server'
import { validateAdminSession } from '@/lib/adminSession'

export async function GET() {
  try {
    const session = await validateAdminSession()

    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    // 画面表示用の user オブジェクト。フロント(AuthContext)が参照するキー形に合わせる
    // (id / username / role / store_id(snake) / isAllStore / permissions)。
    // セッションの有効性・期限・パスワード変更/失効・最新permissionsは
    // validateAdminSession が DB を真実源として判定済み。
    const user = {
      id: session.id,
      username: session.username,
      role: session.role,
      store_id: session.storeId,
      isAllStore: session.isAllStore,
      permissions: session.permissions,
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('セッションチェックエラー:', error)
    return NextResponse.json({ user: null }, { status: 401 })
  }
}
