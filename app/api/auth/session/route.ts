import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('admin_session')

    if (!sessionCookie) {
      return NextResponse.json({ user: null }, { status: 401 })
    }

    const user = JSON.parse(sessionCookie.value)

    return NextResponse.json({ user })
  } catch (error) {
    console.error('セッションチェックエラー:', error)
    return NextResponse.json({ user: null }, { status: 401 })
  }
}
