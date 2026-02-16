import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test the logger at different NODE_ENV values, so we import dynamically
describe('logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefixes messages with the tag', async () => {
    const { createLogger } = await import('../logger');
    const log = createLogger('TestTag');

    log.warn('hello');
    expect(consoleSpy.warn).toHaveBeenCalledWith('[TestTag]', 'hello');
  });

  it('passes multiple arguments through', async () => {
    const { createLogger } = await import('../logger');
    const log = createLogger('Multi');

    log.error('failed:', { code: 42 });
    expect(consoleSpy.error).toHaveBeenCalledWith('[Multi]', 'failed:', { code: 42 });
  });

  it('always logs warn and error regardless of environment', async () => {
    const { createLogger } = await import('../logger');
    const log = createLogger('Levels');

    log.warn('a warning');
    log.error('an error');

    expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    expect(consoleSpy.error).toHaveBeenCalledTimes(1);
  });
});
