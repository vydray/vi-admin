'use client'

import { useState, useEffect } from 'react'

/**
 * モバイル端末かどうかを判定するhook
 * User-Agentで端末種別を判定し、画面幅も考慮
 * - iPhone/Android端末 = モバイルデバイス
 * - 画面幅1024px未満 = モバイル表示
 */
export function useIsMobile(): { isMobile: boolean; isLoading: boolean } {
  const [isMobile, setIsMobile] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkIsMobile = () => {
      // User-Agentでモバイル端末かどうかを判定
      const userAgent = navigator.userAgent
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(userAgent)

      // モバイル端末の場合は画面幅に関係なくモバイル表示
      // （横向きでも縦向きでもモバイル用UIを表示）
      setIsMobile(isMobileDevice)
      setIsLoading(false)
    }

    checkIsMobile()

    // リサイズ時に再判定（必要に応じて）
    window.addEventListener('resize', checkIsMobile)
    return () => window.removeEventListener('resize', checkIsMobile)
  }, [])

  return { isMobile, isLoading }
}
