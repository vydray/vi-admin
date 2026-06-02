/**
 * Memorable (store_id=1) のキャスト募集 / 内勤スタッフ募集 投稿の画像差し替え
 *
 * 102件 pending (image_url='[]') に対し、各カテゴリの画像を再アップロード&紐付け。
 * 各 post ごとに別 path に copy して image_url を独立化。
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

const STORE_ID = 1
const BUCKET = 'twitter-images'

// content matcher → ローカル画像ファイル名
const JOBS = [
  {
    label: 'Memorable キャスト募集',
    contentLike: '%キャスト募集中%歌舞伎町メモラブル%',
    localFile: path.join(os.homedir(), 'Downloads', 'HJfN0jfasAATwaF.jpeg'),
    suffix: 'memorable-cast',
  },
  {
    label: 'Memorable 内勤スタッフ募集',
    contentLike: '%内勤スタッフ募集%月給 28万円%',
    localFile: path.join(os.homedir(), 'Downloads', 'HH9q0HKaUAEUcjt.jpeg'),
    suffix: 'memorable-naikin',
  },
]

async function uploadOnce(localFile, suffix) {
  const buf = fs.readFileSync(localFile)
  const hash = crypto.randomBytes(8).toString('hex')
  const storagePath = `${STORE_ID}/twitter/${Date.now()}-${hash}-${suffix}.jpeg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buf, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return { url: pub.publicUrl, path: storagePath, size: buf.length }
}

async function copyToNewPath(srcPath, suffix) {
  const hash = crypto.randomBytes(8).toString('hex')
  const newPath = `${STORE_ID}/twitter/${Date.now()}-${hash}-${suffix}.jpeg`
  const { error } = await supabase.storage.from(BUCKET).copy(srcPath, newPath)
  if (error) throw error
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
  return pub.publicUrl
}

async function processJob(job) {
  console.log(`\n=== ${job.label} ===`)

  if (!fs.existsSync(job.localFile)) {
    console.error(`  ✗ ファイルなし: ${job.localFile}`)
    return
  }

  const { data: rows, error: selErr } = await supabase
    .from('scheduled_posts')
    .select('id, scheduled_at, image_url')
    .eq('store_id', STORE_ID)
    .ilike('content', job.contentLike)
    .eq('status', 'pending')
    .order('scheduled_at')

  if (selErr) {
    console.error('  ✗ SELECT失敗:', selErr.message)
    return
  }
  console.log(`  対象 pending: ${rows.length} 件`)
  if (rows.length === 0) return

  const first = await uploadOnce(job.localFile, job.suffix)
  console.log(`  Upload OK (${(first.size / 1024).toFixed(1)} KB): ${first.url}`)

  let ok = 0, ng = 0
  for (let i = 0; i < rows.length; i++) {
    const post = rows[i]
    let assignedUrl
    try {
      assignedUrl = i === 0 ? first.url : await copyToNewPath(first.path, job.suffix)
    } catch (e) {
      console.error(`    ✗ id=${post.id} copy失敗:`, e.message)
      ng++
      continue
    }
    const { error: updErr } = await supabase
      .from('scheduled_posts')
      .update({ image_url: JSON.stringify([assignedUrl]) })
      .eq('id', post.id)
    if (updErr) {
      console.error(`    ✗ id=${post.id} UPDATE失敗:`, updErr.message)
      ng++
      continue
    }
    ok++
  }
  console.log(`  完了: 成功 ${ok} / 失敗 ${ng}`)
}

async function main() {
  for (const job of JOBS) {
    await processJob(job)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
