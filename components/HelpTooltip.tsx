'use client'

import { useState } from 'react'

interface HelpTooltipProps {
  text: string
  width?: number
}

export default function HelpTooltip({ text, width = 250 }: HelpTooltipProps) {
  const [show, setShow] = useState(false)

  return (
    <span style={styles.container}>
      <span
        style={styles.icon}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
      >
        ?
      </span>
      {show && (
        <span style={{ ...styles.tooltip, width: `${width}px` }}>
          {text}
        </span>
      )}
    </span>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '6px',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: '#94a3b8',
    color: 'white',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'help',
    userSelect: 'none',
  },
  tooltip: {
    position: 'absolute',
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#1e293b',
    color: 'white',
    padding: '10px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    lineHeight: '1.5',
    zIndex: 1000,
    whiteSpace: 'pre-wrap',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
}
