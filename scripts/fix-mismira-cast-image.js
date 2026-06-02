/**
 * みすみら「キャスト大募集中」投稿の画像差し替え
 *
 * 元の画像 URL がストレージから消えていたため、
 * ローカルの ~/Downloads/みすみらキャスト募集.jpeg を再アップロードし、
 * 該当する pending 投稿の image_url を更新する。
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local に必要')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const LOCAL_FILE = path.join(os.homedir(), 'Downloads', 'みすみらキャスト募集.jpeg')
const STORE_ID = 2
const BUCKET = 'twitter-images'
const STORAGE_PATH = `${STORE_ID}/twitter/${Date.now()}-mismira-cast-recruit.jpeg`

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error(`ファイルが見つかりません: ${LOCAL_FILE}`)
    process.exit(1)
  }

  const buf = fs.readFileSync(LOCAL_FILE)
  console.log(`ファイル読込: ${LOCAL_FILE} (${(buf.length / 1024).toFixed(1)} KB)`)

  // Storage upload
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(STORAGE_PATH, buf, {
      contentType: 'image/jpeg',
      upsert: false,
    })
  if (upErr) {
    console.error('Upload失敗:', upErr)
    process.exit(1)
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(STORAGE_PATH)
  const newUrl = pub.publicUrl
  console.log(`Upload OK: ${newUrl}`)

  // 対象: store_id=2, content にキャスト大募集中 + 相笠萌 を含む pending 投稿
  const { data: rows, error: selErr } = await supabase
    .from('scheduled_posts')
    .select('id, scheduled_at, status, image_url')
    .eq('store_id', STORE_ID)
    .ilike('content', '%キャスト大募集中%')
    .ilike('content', '%相笠萌%')
    .eq('status', 'pending')
    .order('scheduled_at')

  if (selErr) {
    console.error('SELECT失敗:', selErr)
    process.exit(1)
  }
  console.log(`対象 pending 投稿: ${rows.length} 件`)

  if (rows.length === 0) {
    console.log('更新対象なし、終了')
    return
  }

  const newImageUrlJson = JSON.stringify([newUrl])
  const ids = rows.map(r => r.id)

  const { error: updErr } = await supabase
    .from('scheduled_posts')
    .update({ image_url: newImageUrlJson })
    .in('id', ids)

  if (updErr) {
    console.error('UPDATE失敗:', updErr)
    process.exit(1)
  }
  console.log(`UPDATE OK: ${ids.length} 件 (IDs: ${ids.join(', ')})`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
