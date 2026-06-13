import type { ReactNode } from 'react'
import { Tooltip } from 'radix-ui'

/**
 * A small Radix tooltip for icon-only controls. Wrap one focusable child; the
 * label is also kept as the child's aria-label by the caller (a tooltip is not
 * an accessible name). Requires a <Tooltip.Provider> ancestor (in App).
 */
export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
