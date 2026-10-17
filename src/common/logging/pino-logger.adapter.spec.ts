import type { Logger as PinoLogger } from 'pino';
import { PinoLoggerAdapter } from './pino-logger.adapter.js';

function createFakePinoLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  };
}

describe('PinoLoggerAdapter', () => {
  let pinoLogger: ReturnType<typeof createFakePinoLogger>;
  let adapter: PinoLoggerAdapter;

  beforeEach(() => {
    pinoLogger = createFakePinoLogger();
    adapter = new PinoLoggerAdapter(pinoLogger as unknown as PinoLogger);
  });

  it.each([
    ['log', 'info'],
    ['error', 'error'],
    ['warn', 'warn'],
    ['debug', 'debug'],
    ['verbose', 'trace'],
    ['fatal', 'fatal'],
  ] as const)('maps Nest %s to pino %s', (nestLevel, pinoLevel) => {
    adapter[nestLevel]('hello');

    expect(pinoLogger[pinoLevel]).toHaveBeenCalledWith({}, 'hello');
  });

  it('turns the trailing context param into a context field', () => {
    adapter.log('started', 'NestApplication');

    expect(pinoLogger.info).toHaveBeenCalledWith(
      { context: 'NestApplication' },
      'started',
    );
  });

  it('keeps the stack when Nest reports an error with stack and context', () => {
    adapter.error('boom', 'Error: boom\n  at x', 'ExceptionHandler');

    expect(pinoLogger.error).toHaveBeenCalledWith(
      { context: 'ExceptionHandler', stack: 'Error: boom\n  at x' },
      'boom',
    );
  });

  it('passes an Error object as the err field', () => {
    const error = new Error('boom');

    adapter.error(error, 'OrdersService');

    expect(pinoLogger.error).toHaveBeenCalledWith(
      { context: 'OrdersService', err: error },
      'boom',
    );
  });
});
