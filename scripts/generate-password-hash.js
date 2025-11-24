#!/usr/bin/env node

/**
 * パスワードハッシュ生成スクリプト
 *
 * 使い方:
 *   node scripts/generate-password-hash.js
 *
 * このスクリプトは、admin_usersテーブルに挿入するための
 * bcryptハッシュ化されたパスワードを生成します。
 */

const readline = require('readline')
const bcrypt = require('bcryptjs')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log('='.repeat(60))
console.log('パスワードハッシュ生成ツール')
console.log('='.repeat(60))
console.log('')

rl.question('パスワードを入力してください: ', async (password) => {
  if (!password || password.length < 8) {
    console.error('\n❌ エラー: パスワードは8文字以上である必要があります')
    rl.close()
    return
  }

  console.log('\nハッシュ化中...')

  try {
    // bcryptでハッシュ化（saltRounds=10）
    const hash = await bcrypt.hash(password, 10)

    console.log('\n✅ ハッシュ化完了！')
    console.log('-'.repeat(60))
    console.log('ハッシュ値:')
    console.log(hash)
    console.log('-'.repeat(60))
    console.log('')
    console.log('以下のSQLをSupabase SQL Editorで実行してください:')
    console.log('')
    console.log('-- super_adminユーザーの作成')
    console.log(`INSERT INTO admin_users (username, password_hash, role, store_id) VALUES`)
    console.log(`('your_username', '${hash}', 'super_admin', NULL);`)
    console.log('')
    console.log('-- または、store_adminユーザーの作成（store_id=1の例）')
    console.log(`INSERT INTO admin_users (username, password_hash, role, store_id) VALUES`)
    console.log(`('your_username', '${hash}', 'store_admin', 1);`)
    console.log('')
    console.log('⚠️  注意: your_username を実際のユーザー名に置き換えてください')
    console.log('')
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message)
  }

  rl.close()
})
