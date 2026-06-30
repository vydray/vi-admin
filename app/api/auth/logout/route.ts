import { NextResponse } from 'next/server'
import { revokeAdminSession } from '@/lib/adminSession'

export async function POST() {
  try {
    // 現在のセッションtokenをDBでrevoke＋cookie削除
    await revokeAdminSession()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('ログアウトエラー:', error)
    return NextResponse.json(
      { error: 'ログアウトに失敗しました' },
      { status: 500 }
    )
  }
}
