/**
 * Graceful shutdown must not write to the winston logger after ending it.
 *
 * It did: 'Graceful shutdown completed' was logged after flushLogsAndMetrics()
 * ended the logger. Winston emitted 'error' (write after end), nobody listened,
 * so it threw; the uncaughtException handler then logged to the same ended
 * logger from inside Node's fatal-exception handler, and Node exited 7 on every
 * clean SIGTERM (systemd: `status=7/NOTRUNNING`).
 */

const Logger = require('../../../src/infrastructure/logger');
const GracefulShutdownHandler = require('../../../src/infrastructure/graceful-shutdown');

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('GracefulShutdownHandler — logging after the logger is ended', () => {
  let logger;
  let winstonLogger;
  let winstonErrors;
  let exitSpy;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    logger = new Logger({ server: { nodeEnv: 'test' } });
    winstonLogger = logger.getLogger();
    winstonLogger.transports.forEach((t) => { t.silent = true; });
    // A listener stops the 'error' event throwing, so the test can count it.
    winstonErrors = [];
    winstonLogger.on('error', (err) => winstonErrors.push(err));
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('premise: writing to an ended winston logger emits an error', async () => {
    await new Promise((resolve) => {
      winstonLogger.on('finish', resolve);
      winstonLogger.end();
    });
    logger.info('late line');
    await flush();
    expect(winstonErrors.length).toBeGreaterThan(0);
  });

  it('a SIGTERM shutdown ends the logger last and exits 0 without a write-after-end', async () => {
    const handler = new GracefulShutdownHandler(logger, {});

    await expect(handler.shutdown('SIGTERM')).resolves.toBeUndefined();
    await flush();

    expect(handler.logsEnded).toBe(true);
    expect(winstonErrors).toEqual([]);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('logs arriving after the end (late signal, uncaught exception) go to the console', async () => {
    const handler = new GracefulShutdownHandler(logger, {});
    await handler.shutdown('SIGTERM');

    // A second signal after the flush, then what the uncaughtException handler logs.
    await handler.shutdown('SIGINT');
    expect(() => handler.log('error', 'Uncaught exception', { error: 'boom' })).not.toThrow();
    await flush();

    expect(winstonErrors).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Shutdown already in progress'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Uncaught exception'));
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('an uncaught-exception shutdown still exits 1', async () => {
    const handler = new GracefulShutdownHandler(logger, {});
    await handler.shutdown('uncaughtException', 1);
    await flush();

    expect(winstonErrors).toEqual([]);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
