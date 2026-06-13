import type { SVGProps } from 'react'

/**
 * The app's entire icon set: tiny stroke glyphs on currentColor, replacing
 * the emoji/text glyphs flagged in review (💬 ⚙ ⚠ ✓ ◆ ⇄). 1.5px strokes,
 * geometry aligned to the 4px-ceiling shape language.
 */

function base(props: SVGProps<SVGSVGElement>, size = 14): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...props,
  }
}

export function GearIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1.8v2M8 12.2v2M14.2 8h-2M3.8 8h-2M12.4 3.6l-1.4 1.4M5 11l-1.4 1.4M12.4 12.4 11 11M5 5 3.6 3.6" />
    </svg>
  )
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 3.5h11v7h-6l-3 2.7v-2.7h-2z" />
    </svg>
  )
}

export function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.2 14.6 13H1.4z" />
      <path d="M8 6.4v3" />
      <circle cx="8" cy="11.4" r="0.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="m3 8.6 3.2 3.2L13 4.6" />
    </svg>
  )
}

export function DiamondIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props, 9)} viewBox="0 0 16 16">
      <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SwapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props, 13)}>
      <path d="M2.5 5.5h9.5m0 0L9.5 3m2.5 2.5L9.5 8M13.5 10.5H4m0 0L6.5 8M4 10.5 6.5 13" />
    </svg>
  )
}

export function PendingDot(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props, 8)}>
      <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" opacity={0.55} />
    </svg>
  )
}

/** A right-pointing chevron; CSS rotates it 90° when its row is expanded. */
export function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props, 12)}>
      <path d="m6 4 4 4-4 4" />
    </svg>
  )
}

export function FolderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props, 13)}>
      <path d="M2 4.5h4l1.2 1.4H14v6.1H2z" />
    </svg>
  )
}

export function FileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props, 13)}>
      <path d="M4 2.2h5l3 3v8.6H4z" />
      <path d="M9 2.2v3h3" />
    </svg>
  )
}
