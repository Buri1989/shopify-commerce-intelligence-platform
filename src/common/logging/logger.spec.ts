import { createApplicationLogger } from './logger.js';
import { requestContextStorage } from './request-context.js';

type LogEntry = Record<string, unknown>;

function createCapturingDestination() {
  const entries: LogEntry[] = [];
  const destination = {
    write: (serializedLine: string) => {
      entries.push(JSON.parse(serializedLine) as LogEntry);
    },
  };
  return { entries, destination };
}

describe('createApplicationLogger', () => {
  it('writes one JSON line with a level label, ISO time, msg, and base fields', () => {
    const { entries, destination } = createCapturingDestination();
    const logger = createApplicationLogger(
      { level: 'info', env: 'test' },
      destination,
    );

    logger.info('hello');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'info',
      msg: 'hello',
      service: 'commerce-intelligence',
      env: 'test',
    });
    expect(entries[0].time).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('redacts authorization and cookie headers', () => {
    const { entries, destination } = createCapturingDestination();
    const logger = createApplicationLogger(
      { level: 'info', env: 'test' },
      destination,
    );

    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer secret',
            cookie: 'sid=1',
            accept: '*/*',
          },
        },
      },
      'req',
    );

    expect(entries[0].req).toEqual({
      headers: {
        authorization: '[Redacted]',
        cookie: '[Redacted]',
        accept: '*/*',
      },
    });
  });

  it('adds requestId inside a request context and omits it outside', () => {
    const { entries, destination } = createCapturingDestination();
    const logger = createApplicationLogger(
      { level: 'info', env: 'test' },
      destination,
    );

    logger.info('outside');
    requestContextStorage.run({ requestId: 'req-1' }, () =>
      logger.info('inside'),
    );

    expect(entries[0]).not.toHaveProperty('requestId');
    expect(entries[1]).toMatchObject({ requestId: 'req-1', msg: 'inside' });
  });

  it('drops lines below the configured level', () => {
    const { entries, destination } = createCapturingDestination();
    const logger = createApplicationLogger(
      { level: 'warn', env: 'test' },
      destination,
    );

    logger.info('quiet');
    logger.warn('loud');

    expect(entries.map((entry) => entry.msg)).toEqual(['loud']);
  });
});
