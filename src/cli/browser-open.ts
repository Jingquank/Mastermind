/**
 * Pure `open` argv construction for the browser launcher — extracted so the
 * override/trim/system-default logic can be unit-tested (openBrowser itself is
 * darwin-gated and spawns a process).
 */

/**
 * Build the macOS `open` argv for a URL.
 * - a non-empty `--in` override or configured browser → `['-a', <app>, url]`
 * - otherwise (empty/whitespace) → `[url]` (the system default browser)
 * The override wins over the configured default; an explicit empty override means "system default".
 */
export function browserOpenArgs(url: string, override: string | undefined, configBrowser: string): string[] {
  const app = (override ?? configBrowser).trim()
  return app ? ['-a', app, url] : [url]
}
