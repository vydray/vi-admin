/**
 * みすみら「内勤スタッフ募集」投稿の画像差し替え
 *
 * Storage から画像が消えていた 57件 (image_url='[]' or 単一URLで実ファイルなし) に対し
 * ~/Downloads/みすみら内勤募集.jpeg を再アップロードして紐付ける。
 *
 * 紐付け方針: 各 pending 投稿ごとに別 path に copy して image_url を独立させる。
 * (新 cron 仕様で共有 URL でも安全だが、念のため独立化)
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が .env.local に必要')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

const LOCAL_FILE = path.join(os.homedir(), 'Downloads', 'みすみら内勤募集.jpeg')
const STORE_ID = 2
const BUCKET = 'twitter-images'

async function uploadOnce() {
  const buf = fs.readFileSync(LOCAL_FILE)
  const hash = crypto.randomBytes(8).toString('hex')
  const storagePath = `${STORE_ID}/twitter/${Date.now()}-${hash}-mismira-naikin.jpeg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return { url: pub.publicUrl, path: storagePath }
}

async function copyToNewPath(srcPath) {
  const hash = crypto.randomBytes(8).toString('hex')
  const newPath = `${STORE_ID}/twitter/${Date.now()}-${hash}-mismira-naikin.jpeg`
  const { error } = await supabase.storage.from(BUCKET).copy(srcPath, newPath)
  if (error) throw error
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
  return pub.publicUrl
}

async function main() {
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error(`ファイルが見つかりません: ${LOCAL_FILE}`)
    process.exit(1)
  }

  const buf = fs.readFileSync(LOCAL_FILE)
  console.log(`ファイル: ${LOCAL_FILE} (${(buf.length / 1024).toFixed(1)} KB)`)

  // 対象: store_id=2, content に「内勤スタッフ募集」, status=pending
  const { data: rows, error: selErr } = await supabase
    .from('scheduled_posts')
    .select('id, scheduled_at, image_url')
    .eq('store_id', STORE_ID)
    .ilike('content', '%内勤スタッフ募集%')
    .eq('status', 'pending')
    .order('scheduled_at')

  if (selErr) {
    console.error('SELECT失敗:', selErr)
    process.exit(1)
  }
  console.log(`対象 pending: ${rows.length} 件`)

  if (rows.length === 0) {
    console.log('対象なし、終了')
    return
  }

  // 最初の1枚をアップロード、以降は copy で別 path に独立化
  const first = await uploadOnce()
  console.log(`Upload OK (元): ${first.url}`)

  for (let i = 0; i < rows.length; i++) {
    const post = rows[i]
    let assignedUrl
    if (i === 0) {
      assignedUrl = first.url
    } else {
      try {
        assignedUrl = await copyToNewPath(first.path)
      } catch (e) {
        console.error(`  ✗ id=${post.id} copy失敗:`, e.message)
        continue
      }
    }
    const { error: updErr } = await supabase
      .from('scheduled_posts')
      .update({ image_url: JSON.stringify([assignedUrl]) })
      .eq('id', post.id)
    if (updErr) {
      console.error(`  ✗ id=${post.id} UPDATE失敗:`, updErr.message)
      continue
    }
    console.log(`  ✓ id=${post.id} (${post.scheduled_at}) → ${assignedUrl}`)
  }

  console.log('\n完了')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
