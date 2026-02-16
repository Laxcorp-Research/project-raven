/**
 * Simple logger with levels for the main process.
 * In production, only warn/error are shown. In development, all levels are shown.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const isDev = process.env.NODE_ENV !== 'production'
const minLevel: LogLevel = isDev ? 'debug' : 'warn'

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel]
}

function formatTag(tag: string): string {
  return `[${tag}]`
}

export function createLogger(tag: string) {
  const prefix = formatTag(tag)

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) console.log(prefix, ...args)
    },
    info: (...args: unknown[]) => {
      if (shouldLog('info')) console.log(prefix, ...args)
    },
    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) console.warn(prefix, ...args)
    },
    error: (...args: unknown[]) => {
      if (shouldLog('error')) console.error(prefix, ...args)
    },
  }
}
