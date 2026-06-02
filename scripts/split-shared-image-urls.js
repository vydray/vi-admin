/**
 * 既存の pending 投稿のうち、複数件が同じ image_url を共有してる場合に
 * 各投稿ごとに Storage 上で別 path にコピーして image_url を独立させる。
 *
 * これにより cron で 1件が成功 → Storage 削除 されても他 pending が死なない。
 */
const path = require('path')
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
const BUCKET_URL = `${SUPABASE_URL}/storage/v1/object/public/twitter-images/`

async function main() {
  // pending 投稿で image_url がある全件取得
  const { data: rows, error } = await supabase
    .from('scheduled_posts')
    .select('id, store_id, image_url')
    .eq('status', 'pending')
    .not('image_url', 'is', null)
    .order('id')

  if (error) {
    console.error('SELECT失敗:', error)
    process.exit(1)
  }

  // image_url 文字列ごとに使ってる投稿 id をグループ化
  const byUrl = new Map() // image_url(JSON文字列) => post[]
  for (const r of rows) {
    const arr = byUrl.get(r.image_url) || []
    arr.push(r)
    byUrl.set(r.image_url, arr)
  }

  let totalSplit = 0
  for (const [imageUrlJson, posts] of byUrl.entries()) {
    if (posts.length <= 1) continue // 共有されてない

    let urls
    try {
      urls = JSON.parse(imageUrlJson)
    } catch {
      urls = [imageUrlJson]
    }

    console.log(`\n共有グループ: ${posts.length}件 (IDs: ${posts.map(p => p.id).join(', ')})`)
    console.log(`  元URL: ${urls.join(', ')}`)

    // 各 post に新しい URL を割り当てる。先頭 post は既存 URL を維持。
    for (let i = 1; i < posts.length; i++) {
      const post = posts[i]
      const newUrls = []
      let copyFailed = false
      for (const src of urls) {
        if (!src.startsWith(BUCKET_URL)) {
          newUrls.push(src)
          continue
        }
        const srcPath = src.replace(BUCKET_URL, '')
        const ext = srcPath.includes('.') ? srcPath.split('.').pop() : 'jpg'
        const hash = crypto.randomBytes(8).toString('hex')
        const newPath = `${post.store_id}/twitter/${Date.now()}-${hash}.${ext}`

        const { error: copyErr } = await supabase.storage
          .from('twitter-images')
          .copy(srcPath, newPath)
        if (copyErr) {
          console.error(`  ✗ id=${post.id} copy失敗 (UPDATEスキップ): ${srcPath}`, copyErr.message)
          copyFailed = true
          break
        }
        const { data: pub } = supabase.storage.from('twitter-images').getPublicUrl(newPath)
        newUrls.push(pub.publicUrl)
      }

      // 1枚でも copy 失敗 or 結果が空なら UPDATE しない (image_url を破壊しない)
      if (copyFailed || newUrls.length === 0) continue

      const newImageUrlJson = JSON.stringify(newUrls)
      const { error: updErr } = await supabase
        .from('scheduled_posts')
        .update({ image_url: newImageUrlJson })
        .eq('id', post.id)
      if (updErr) {
        console.error(`  ✗ id=${post.id} UPDATE失敗:`, updErr.message)
        continue
      }
      console.log(`  ✓ id=${post.id} → ${newUrls.join(', ')}`)
      totalSplit++
    }
  }

  console.log(`\n完了: ${totalSplit} 件の image_url を独立させた`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
