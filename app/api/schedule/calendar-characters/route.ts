import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

const BUCKET = 'schedule-templates'
const MAX_BYTES = 12 * 1024 * 1024
const MAX_CHARACTERS = 20

interface CharPos {
  id: string
  x: number
  y: number
  w: number
}

interface Session {
  storeId: number
  isAllStore: boolean
  role: string
  permissions: Record<string, boolean>
}

async function validateSession(): Promise<Session | null> {
  const cookieStore = await cookies()
  const sc = cookieStore.get('admin_session')
  if (!sc) return null
  try {
    const s = JSON.parse(sc.value)
    return {
      storeId: s.store_id ?? s.storeId,
      isAllStore: s.isAllStore || false,
      role: s.role || '',
      permissions: s.permissions || {},
    }
  } catch {
    return null
  }
}
function authorize(session: Session, storeId: number): boolean {
  if (!(session.isAllStore || session.storeId === storeId)) return false
  return session.role === 'super_admin' || session.permissions?.schedule === true
}

const posPath = (storeId: number) => `${storeId}/characters.json`
const imgPath = (storeId: number, id: string) => `${storeId}/character-${id}.png`
const safeId = (id: unknown) => (typeof id === 'string' ? id.replace(/[^a-z0-9-]/gi, '') : '')

async function readPositions(storeId: number): Promise<CharPos[]> {
  const { data } = await supabase.storage.from(BUCKET).download(posPath(storeId))
  if (!data) return []
  try {
    const arr = JSON.parse(await data.text())
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
async function writePositions(storeId: number, list: CharPos[]) {
  await supabase.storage.from(BUCKET).upload(
    posPath(storeId),
    Buffer.from(JSON.stringify(list)),
    { contentType: 'application/json', upsert: true },
  )
}
function clampRange(v: unknown, def: number, lo: number, hi: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def
}

/** GET ?storeId= : キャラ一覧（URL＋位置） */
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const storeId = Number(request.nextUrl.searchParams.get('storeId'))
  if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 })
  if (!authorize(session, storeId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const list = await readPositions(storeId)
  const characters = list.map((c) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(imgPath(storeId, c.id))
    return { id: c.id, url: `${data.publicUrl}?v=${c.id}`, x: c.x, y: c.y, w: c.w }
  })
  return NextResponse.json({ characters })
}

/** POST formData{file, storeId} : キャラ画像を追加（既定位置で登録） */
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    const storeId = Number(form.get('storeId'))
    if (!file || !storeId) return NextResponse.json({ error: 'file / storeId が必要です' }, { status: 400 })
    if (!authorize(session, storeId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: '画像が大きすぎます（12MBまで）' }, { status: 400 })
    if (!file.type.startsWith('image/')) return NextResponse.json({ error: '画像ファイルを指定してください' }, { status: 400 })

    const list = await readPositions(storeId)
    if (list.length >= MAX_CHARACTERS) {
      return NextResponse.json({ error: `キャラは最大${MAX_CHARACTERS}体までです` }, { status: 400 })
    }

    const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(imgPath(storeId, id), buffer, { contentType: 'image/png', upsert: true })
    if (upErr) {
      console.error('[calendar-characters] upload error:', upErr)
      return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
    }

    const newChar: CharPos = { id, x: 0.04, y: 0.04, w: 0.18 }
    list.push(newChar)
    await writePositions(storeId, list)

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(imgPath(storeId, id))
    return NextResponse.json({ character: { ...newChar, url: `${data.publicUrl}?v=${id}` } })
  } catch (error) {
    console.error('[calendar-characters] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** PUT {storeId, characters:[{id,x,y,w}]} : 位置を保存 */
export async function PUT(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json()
    const storeId = Number(body.storeId)
    if (!storeId || !Array.isArray(body.characters)) {
      return NextResponse.json({ error: 'storeId / characters が必要です' }, { status: 400 })
    }
    if (!authorize(session, storeId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 既存IDのみ採用（位置のみ更新。画像追加はPOST経由）
    const existing = new Set((await readPositions(storeId)).map((c) => c.id))
    const list: CharPos[] = (body.characters as unknown[])
      .map((c) => {
        const o = c as Record<string, unknown>
        return {
          id: safeId(o.id),
          x: clampRange(o.x, 0, -0.5, 1.5),
          y: clampRange(o.y, 0, -0.5, 1.5),
          w: clampRange(o.w, 0.18, 0.03, 1.2),
        }
      })
      .filter((c) => c.id && existing.has(c.id))
      .slice(0, MAX_CHARACTERS)
    await writePositions(storeId, list)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[calendar-characters] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** DELETE {storeId, id} : キャラ削除 */
export async function DELETE(request: NextRequest) {
  const session = await validateSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json()
    const storeId = Number(body.storeId)
    const id = safeId(body.id)
    if (!storeId || !id) return NextResponse.json({ error: 'storeId / id が必要です' }, { status: 400 })
    if (!authorize(session, storeId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // 位置を先に書き換えてから画像削除（途中失敗でも宙ぶらりんの位置エントリを残さない）
    const list = (await readPositions(storeId)).filter((c) => c.id !== id)
    await writePositions(storeId, list)
    await supabase.storage.from(BUCKET).remove([imgPath(storeId, id)])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[calendar-characters] DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
