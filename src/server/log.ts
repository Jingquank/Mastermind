export function log(...args: unknown[]): void {
  console.error(`[${new Date().toISOString()}]`, ...args)
}
