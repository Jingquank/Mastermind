import { useEffect, useState } from 'react'
import { parseRoute, type Route } from './route-parse'

// Hand-rolled routing (no router dep). The pure pathname→Route parsing lives in
// `route-parse.ts` (DOM-free); this module adds the browser-bound navigation.
export { parseRoute, type Route }

/** SPA navigation: push a path and notify listeners (popstate covers back/forward). */
export function navigate(to: string): void {
  if (to === window.location.pathname) return
  window.history.pushState(null, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname))
  useEffect(() => {
    const onPop = (): void => setRoute(parseRoute(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return route
}
