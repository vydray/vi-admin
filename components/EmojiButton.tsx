'use client'

import { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'

// emoji-picker-react は SSR 非対応のため dynamic import (ssr:false)
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false })

interface EmojiButtonProps {
  onSelect: (emoji: string) => void
}

/**
 * 絵文字ピッカーボタン。
 * Windows でも OS の絵文字入力に頼らず絵文字を選んで挿入できるようにする共通部品。
 * クリックでポップオーバー表示、絵文字を選ぶと onSelect(emoji) を呼ぶ（連続選択可、外クリックで閉じる）。
 */
export default function EmojiButton({ onSelect }: EmojiButtonProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '6px 12px',
          backgroundColor: open ? '#eff6ff' : '#fff',
          border: '1px solid #d1d5db',
          borderRadius: '6px',
          fontSize: '14px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}
        title="絵文字を挿入"
      >
        😀 絵文字
      </button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 2000, top: 'calc(100% + 4px)', left: 0 }}>
          <EmojiPicker
            onEmojiClick={(emojiData) => onSelect(emojiData.emoji)}
            width={320}
            height={400}
            searchPlaceholder="絵文字を検索"
            previewConfig={{ showPreview: false }}
            lazyLoadEmojis
          />
        </div>
      )}
    </div>
  )
}
