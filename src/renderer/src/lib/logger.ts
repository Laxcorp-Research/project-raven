/**
 * Renderer-side logger utility.
 *
 * In development builds every call forwards to the matching console method.
 * In production builds log / debug / info / warn are silenced and only errors
 * are emitted, preventing information leakage through DevTools.
 */

const isDev = import.meta.env.DEV

type LogFn = (...args: unknown[]) => void

const noop: LogFn = () => {}

function createLogger(tag: string) {
  const prefix = `[${tag}]`
  return {
    debug: isDev ? (...args: unknown[]) => console.debug(prefix, ...args) : noop,
    log: isDev ? (...args: unknown[]) => console.log(prefix, ...args) : noop,
    info: isDev ? (...args: unknown[]) => console.info(prefix, ...args) : noop,
    warn: isDev ? (...args: unknown[]) => console.warn(prefix, ...args) : noop,
    error: (...args: unknown[]) => console.error(prefix, ...args),
  }
}

export { createLogger }
export type Logger = ReturnType<typeof createLogger>
