import { create } from 'zustand'
import type { OutlineItem } from '../modes/reading/outline'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem('mm:nav-collapsed') === '1'
  } catch {
    return false
  }
}

/**
 * Cross-component state for the single left navigator. Kept OUT of useDoc
 * (which stays single-document/pure): SessionView publishes the current doc's
 * outline + its article element here, and the Navigator subscribes — that's how
 * the reading-mode-only outline reaches a navigator mounted outside SessionView.
 */
interface NavState {
  outline: OutlineItem[]
  docEl: HTMLElement | null
  /** wide-mode collapse (persisted) */
  collapsed: boolean
  /** narrow-mode off-canvas open (transient) */
  mobileOpen: boolean
  section: 'files' | 'outline'
  publish(outline: OutlineItem[], docEl: HTMLElement | null): void
  setCollapsed(v: boolean): void
  setMobileOpen(v: boolean): void
  setSection(s: 'files' | 'outline'): void
}

export const useNav = create<NavState>((set) => ({
  outline: [],
  docEl: null,
  collapsed: loadCollapsed(),
  mobileOpen: false,
  section: 'files',
  publish: (outline, docEl) => set({ outline, docEl }),
  setCollapsed: (v) => {
    try {
      localStorage.setItem('mm:nav-collapsed', v ? '1' : '0')
    } catch {
      /* best-effort */
    }
    set({ collapsed: v })
  },
  setMobileOpen: (v) => set({ mobileOpen: v }),
  setSection: (s) => set({ section: s }),
}))
