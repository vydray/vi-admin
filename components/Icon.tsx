import React from 'react'

// サイドバー用の角丸ストロークSVGアイコン（M+ Rounded フォントに合わせて round cap/join）。
// stroke="currentColor" なので、親のテキスト色に追従して状態色が乗る。

const STROKE: Record<string, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" /></>,
  coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" /><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
  receipt: <><path d="M5 3.2v17.6l2-1.2 2 1.2 2-1.2 2 1.2 2-1.2 2 1.2V3.2l-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2Z" /><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" /></>,
  'trending-down': <><path d="M3 7.5 10 14l3.5-3.5L21 18" /><path d="M21 13v5h-5" /></>,
  'file-text': <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h5" /></>,
  users: <><path d="M16 21v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V21" /><circle cx="9.5" cy="7.5" r="3.5" /><path d="M21 21v-1.5a4 4 0 0 0-3-3.85M16.5 4.15a3.5 3.5 0 0 1 0 6.7" /></>,
  bottle: <><path d="M10 2.5h4M11 2.5v3.5M13 2.5v3.5" /><path d="M10 6c0 2.2-1.6 3-1.6 6.2V20a2 2 0 0 0 2 2h3.2a2 2 0 0 0 2-2v-7.8C15.6 9 14 8.2 14 6" /><path d="M8.4 14.5h7.2" /></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.6" /><path d="m20 16-4.5-4.5L6 21" /></>,
  template: <><rect x="3" y="3" width="18" height="6.5" rx="1.5" /><rect x="3" y="13" width="9.5" height="8" rx="1.5" /><rect x="16" y="13" width="5" height="8" rx="1.5" /></>,
  sparkles: <><path d="M12 3.2 13.7 8 18.5 9.7 13.7 11.4 12 16.2 10.3 11.4 5.5 9.7 10.3 8Z" /><path d="m18.8 14.2.85 2.1 2.1.85-2.1.85L18.8 21l-.85-2.05-2.1-.85 2.1-.85Z" /></>,
  edit: <><path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /><path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12.5 14.5l-4 1 1-4z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>,
  bag: <><path d="M6 2 3.5 6v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2V6L18 2z" /><path d="M3.5 6h17M16 10a4 4 0 0 1-8 0" /></>,
  folder: <><path d="M4 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4.5l2 3H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2z" /></>,
  tag: <><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8 8a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8z" /><circle cx="7.3" cy="7.3" r="1.1" /></>,
  chart: <><path d="M3 3v17a1 1 0 0 0 1 1h17" /><rect x="7" y="11" width="3" height="6" rx="0.6" /><rect x="12" y="7" width="3" height="10" rx="0.6" /><rect x="17" y="13" width="3" height="4" rx="0.6" /></>,
  sliders: <><path d="M4 21v-6M4 11V3M12 21v-8M12 9V3M20 21v-4M20 13V3M1.5 15h5M9.5 9h5M17.5 17h5" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20M6 15h4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4-4" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
  calculator: <><rect x="4" y="2" width="16" height="20" rx="2.5" /><path d="M8 6h8M8 10.5h.01M12 10.5h.01M16 10.5h.01M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="7.5" cy="7.5" r="2.4" /><circle cx="16.5" cy="16.5" r="2.4" /></>,
  'minus-circle': <><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></>,
  gift: <><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" /><rect x="2.5" y="7.5" width="19" height="4.5" rx="1" /><path d="M12 7.5V21" /><path d="M12 7.5S10.8 3 8 4c-2 .7-1.2 3.5 1 3.5zM12 7.5S13.2 3 16 4c2 .7 1.2 3.5-1 3.5z" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.4 3.8 5.6 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3Z" /></>,
  megaphone: <><path d="m3.5 11 14-4.2v10.4L3.5 13z" /><path d="M3.5 11H3a1.5 1.5 0 0 0 0 3h.5z" /><path d="M7 13.5V18a1 1 0 0 0 1 1h1.5a1 1 0 0 0 1-1v-2.7" /><path d="M17.5 9.5a3 3 0 0 1 0 5" /></>,
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h2.2l2.4 12.4a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 7H6" /></>,
  store: <><path d="M3.5 9 5 4h14l1.5 5" /><path d="M4.5 9.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V9.5" /><path d="M3.5 9h17" /><path d="M9.5 20v-4.5h5V20" /></>,
  shield: <><path d="M12 2.5 4.5 5.5v6c0 4.7 3.3 8 7.5 10.2 4.2-2.2 7.5-5.5 7.5-10.2v-6z" /><path d="m9 12 2 2 4-4" /></>,
  building: <><rect x="4.5" y="2.5" width="15" height="19" rx="1.5" /><path d="M9.5 21.5v-4h5v4" /><path d="M8 6.5h.01M12 6.5h.01M16 6.5h.01M8 10.5h.01M12 10.5h.01M16 10.5h.01M8 14.5h.01M16 14.5h.01" /></>,
  message: <><path d="M21 11.5a8.4 8.4 0 0 1-12.1 7.5L3.5 20.5l1.6-5.3A8.4 8.4 0 1 1 21 11.5Z" /></>,
  send: <><path d="M21.5 2.5 10.5 13.5M21.5 2.5l-7 19-4-8.5-8.5-4z" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9.5" y="9.5" width="5" height="5" rx="0.8" /><path d="M9 2v2.5M15 2v2.5M9 19.5V22M15 19.5V22M2 9h2.5M2 15h2.5M19.5 9H22M19.5 15H22" /></>,
  alert: <><path d="M12 3 2.5 20h19z" /><path d="M12 9.5V14M12 17.2h.01" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
}

// X(旧Twitter)だけ塗りロゴ
const FILL: Record<string, React.ReactNode> = {
  x: <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.01 4.13H5.04z" />,
}

interface IconProps {
  name: string
  size?: number
  className?: string
  strokeWidth?: number
}

export default function Icon({ name, size = 20, className, strokeWidth = 1.8 }: IconProps) {
  if (FILL[name]) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
        {FILL[name]}
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {STROKE[name] ?? STROKE.list}
    </svg>
  )
}
