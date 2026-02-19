import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ErrorNotificationHelper,
  NOTIFICATION_TYPE
} from '../../scripts/utils/ErrorNotificationHelper.mjs';
import { Logger, LogLevel } from '../../scripts/utils/Logger.mjs';

describe('ErrorNotificationHelper', () => {
  beforeEach(() => {
    ErrorNotificationHelper._resetCooldowns();

    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  // ── NOTIFICATION_TYPE constant ─────────────────────────────────────────

  describe('NOTIFICATION_TYPE', () => {
    it('should define ERROR, WARNING, and INFO', () => {
      expect(NOTIFICATION_TYPE.ERROR).toBe('error');
      expect(NOTIFICATION_TYPE.WARNING).toBe('warn');
      expect(NOTIFICATION_TYPE.INFO).toBe('info');
    });
  });

  // ── notify ─────────────────────────────────────────────────────────────

  describe('notify()', () => {
    it('should show error notification via ui.notifications', () => {
      ErrorNotificationHelper.notify('Something failed');
      expect(ui.notifications.error).toHaveBeenCalledWith(
        'Something failed',
        expect.any(Object)
      );
    });

    it('should show warning notification', () => {
      ErrorNotificationHelper.notify('caution', { type: NOTIFICATION_TYPE.WARNING });
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        'caution',
        expect.any(Object)
      );
    });

    it('should show info notification', () => {
      ErrorNotificationHelper.notify('fyi', { type: NOTIFICATION_TYPE.INFO });
      expect(ui.notifications.info).toHaveBeenCalledWith(
        'fyi',
        expect.any(Object)
      );
    });

    it('should default to error type', () => {
      ErrorNotificationHelper.notify('msg');
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should extract message from Error instances', () => {
      ErrorNotificationHelper.notify(new Error('oops'));
      expect(ui.notifications.error).toHaveBeenCalledWith(
        'oops',
        expect.any(Object)
      );
    });

    it('should convert non-string, non-Error to string', () => {
      ErrorNotificationHelper.notify(42);
      expect(ui.notifications.error).toHaveBeenCalledWith(
        '42',
        expect.any(Object)
      );
    });

    it('should pass permanent option to ui.notifications', () => {
      ErrorNotificationHelper.notify('msg', { permanent: true });
      expect(ui.notifications.error).toHaveBeenCalledWith(
        'msg',
        { permanent: true }
      );
    });

    it('should log error-type messages to console.error via Logger', () => {
      ErrorNotificationHelper.notify('fail', { type: NOTIFICATION_TYPE.ERROR });
      expect(console.error).toHaveBeenCalled();
    });

    it('should log warning-type messages to console.warn via Logger', () => {
      ErrorNotificationHelper.notify('caution', { type: NOTIFICATION_TYPE.WARNING });
      expect(console.warn).toHaveBeenCalled();
    });

    it('should log info-type messages via Logger.info when log level permits', () => {
      // Logger's default level is LOG (2); INFO level is 1, so Logger.info
      // is suppressed at default level. Lower the log level to allow it.
      Logger.setLogLevel(LogLevel.DEBUG);
      ErrorNotificationHelper.notify('info msg', { type: NOTIFICATION_TYPE.INFO });
      expect(console.info).toHaveBeenCalled();
    });

    it('should include context prefix in log message', () => {
      ErrorNotificationHelper.notify('msg', {
        type: NOTIFICATION_TYPE.ERROR,
        context: 'transcription'
      });
      const callArgs = console.error.mock.calls[0];
      const fullMessage = callArgs.join(' ');
      expect(fullMessage).toContain('[transcription]');
    });

    it('should not include context prefix when context is not provided', () => {
      ErrorNotificationHelper.notify('test message');
      const callArgs = console.error.mock.calls[0];
      const fullMessage = callArgs.join(' ');
      // Should not contain a context bracket like [someContext]
      // Note: the [ERROR] tag from Logger is expected, so check specifically
      // that no context bracket is present before the message
      const messageArg = callArgs[1]; // The formatted message string
      expect(messageArg).toBe('test message');
    });

    it('should work when ui.notifications is unavailable', () => {
      const savedUi = globalThis.ui;
      globalThis.ui = undefined;
      expect(() => ErrorNotificationHelper.notify('msg')).not.toThrow();
      globalThis.ui = savedUi;
    });

    it('should work when ui.notifications method does not exist', () => {
      const savedMethod = ui.notifications.error;
      ui.notifications.error = undefined;
      expect(() => ErrorNotificationHelper.notify('msg')).not.toThrow();
      ui.notifications.error = savedMethod;
    });
  });

  // ── Deduplication ──────────────────────────────────────────────────────

  describe('deduplication', () => {
    it('should suppress duplicate notifications within cooldown period', () => {
      ErrorNotificationHelper.notify('dup msg');
      ErrorNotificationHelper.notify('dup msg');
      ErrorNotificationHelper.notify('dup msg');
      expect(ui.notifications.error).toHaveBeenCalledTimes(1);
    });

    it('should allow same message after cooldown period expires', () => {
      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      ErrorNotificationHelper.notify('once');
      expect(ui.notifications.error).toHaveBeenCalledTimes(1);

      // Advance past the default 5s cooldown
      vi.spyOn(Date, 'now').mockReturnValue(now + 6000);
      ErrorNotificationHelper.notify('once');
      expect(ui.notifications.error).toHaveBeenCalledTimes(2);
    });

    it('should use message + type as dedup key', () => {
      ErrorNotificationHelper.notify('same msg', { type: NOTIFICATION_TYPE.ERROR });
      ErrorNotificationHelper.notify('same msg', { type: NOTIFICATION_TYPE.WARNING });
      // Different types = different dedup keys
      expect(ui.notifications.error).toHaveBeenCalledTimes(1);
      expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
    });

    it('should allow different messages within cooldown', () => {
      ErrorNotificationHelper.notify('msg1');
      ErrorNotificationHelper.notify('msg2');
      expect(ui.notifications.error).toHaveBeenCalledTimes(2);
    });
  });

  // ── error / warn / info convenience methods ────────────────────────────

  describe('error()', () => {
    it('should show an error notification', () => {
      ErrorNotificationHelper.error('boom');
      expect(ui.notifications.error).toHaveBeenCalledWith(
        'boom',
        expect.any(Object)
      );
    });

    it('should pass context option', () => {
      ErrorNotificationHelper.error('fail', 'image generation');
      expect(console.error).toHaveBeenCalled();
      const callArgs = console.error.mock.calls[0];
      const fullMessage = callArgs.join(' ');
      expect(fullMessage).toContain('[image generation]');
    });

    it('should accept Error instance', () => {
      ErrorNotificationHelper.error(new Error('err'));
      expect(ui.notifications.error).toHaveBeenCalledWith(
        'err',
        expect.any(Object)
      );
    });
  });

  describe('warn()', () => {
    it('should show a warning notification', () => {
      ErrorNotificationHelper.warn('be careful');
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        'be careful',
        expect.any(Object)
      );
    });

    it('should pass context option', () => {
      ErrorNotificationHelper.warn('slow', 'network');
      expect(console.warn).toHaveBeenCalled();
      const callArgs = console.warn.mock.calls[0];
      const fullMessage = callArgs.join(' ');
      expect(fullMessage).toContain('[network]');
    });
  });

  describe('info()', () => {
    it('should show an info notification', () => {
      ErrorNotificationHelper.info('done!');
      expect(ui.notifications.info).toHaveBeenCalledWith(
        'done!',
        expect.any(Object)
      );
    });
  });

  // ── handleApiError ─────────────────────────────────────────────────────

  describe('handleApiError()', () => {
    it('should handle network errors', () => {
      const error = new Error('network timeout');
      error.isNetworkError = true;
      ErrorNotificationHelper.handleApiError(error, 'transcription');
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should handle rate limit errors as warnings', () => {
      const error = new Error('rate limit exceeded');
      ErrorNotificationHelper.handleApiError(error, 'image generation');
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should detect Italian "limite" rate limit errors', () => {
      const error = new Error('limite di velocità superato');
      ErrorNotificationHelper.handleApiError(error, 'transcription');
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should handle general errors', () => {
      const error = new Error('unknown failure');
      ErrorNotificationHelper.handleApiError(error, 'extraction');
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should use localized message when game.i18n is available', () => {
      // game.i18n is set up by the global setup
      game.i18n.format.mockReturnValue('Localized error');
      const error = new Error('generic');
      ErrorNotificationHelper.handleApiError(error, 'publish');
      // The localized message should be shown
      expect(ui.notifications.error).toHaveBeenCalledWith(
        'Localized error',
        expect.any(Object)
      );
    });

    it('should use localized message for network errors', () => {
      game.i18n.format.mockReturnValue('Network issue');
      const error = new Error('timeout');
      error.isNetworkError = true;
      ErrorNotificationHelper.handleApiError(error, 'upload');
      expect(ui.notifications.error).toHaveBeenCalledWith(
        'Network issue',
        expect.any(Object)
      );
    });

    it('should use localized message for rate limit errors', () => {
      game.i18n.format.mockReturnValue('Rate limited');
      const error = new Error('rate limit hit');
      ErrorNotificationHelper.handleApiError(error, 'api');
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        'Rate limited',
        expect.any(Object)
      );
    });

    it('should fall back to raw error.message for network errors when i18n is unavailable', () => {
      const savedGame = globalThis.game;
      globalThis.game = undefined;
      const error = new Error('network timeout');
      error.isNetworkError = true;
      ErrorNotificationHelper.handleApiError(error, 'test');
      expect(ui.notifications.error).toHaveBeenCalledWith(
        'network timeout',
        expect.any(Object)
      );
      globalThis.game = savedGame;
    });

    it('should fall back to raw error.message for rate limit errors when i18n is unavailable', () => {
      const savedGame = globalThis.game;
      globalThis.game = undefined;
      const error = new Error('rate limit exceeded');
      ErrorNotificationHelper.handleApiError(error, 'test');
      expect(ui.notifications.warn).toHaveBeenCalledWith(
        'rate limit exceeded',
        expect.any(Object)
      );
      globalThis.game = savedGame;
    });

    it('should fall back to raw error for general errors when i18n is unavailable', () => {
      const savedGame = globalThis.game;
      globalThis.game = undefined;
      const error = new Error('general failure');
      ErrorNotificationHelper.handleApiError(error, 'test');
      expect(ui.notifications.error).toHaveBeenCalled();
      globalThis.game = savedGame;
    });

    it('should include operation as context', () => {
      const error = new Error('fail');
      ErrorNotificationHelper.handleApiError(error, 'transcription');
      const callArgs = console.error.mock.calls[0];
      const fullMessage = callArgs.join(' ');
      expect(fullMessage).toContain('[transcription]');
    });
  });

  // ── _localizeApiError ──────────────────────────────────────────────────

  describe('_localizeApiError()', () => {
    it('should return null when game is undefined', () => {
      const savedGame = globalThis.game;
      globalThis.game = undefined;
      const result = ErrorNotificationHelper._localizeApiError(new Error('test'), 'op');
      expect(result).toBeNull();
      globalThis.game = savedGame;
    });

    it('should return null when game.i18n is null', () => {
      const savedI18n = game.i18n;
      game.i18n = null;
      const result = ErrorNotificationHelper._localizeApiError(new Error('test'), 'op');
      expect(result).toBeNull();
      game.i18n = savedI18n;
    });

    it('should call i18n.format for network errors', () => {
      const error = new Error('network');
      error.isNetworkError = true;
      ErrorNotificationHelper._localizeApiError(error, 'transcription');
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Errors.NetworkError',
        { operation: 'transcription' }
      );
    });

    it('should call i18n.format for rate limit errors', () => {
      const error = new Error('rate limit');
      ErrorNotificationHelper._localizeApiError(error, 'upload');
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Errors.RateLimited',
        { operation: 'upload' }
      );
    });

    it('should call i18n.format for general API errors', () => {
      const error = new Error('something broke');
      ErrorNotificationHelper._localizeApiError(error, 'extract');
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Errors.ApiError',
        { operation: 'extract', error: 'something broke' }
      );
    });

    it('should handle i18n.format throwing an error gracefully', () => {
      game.i18n.format.mockImplementation(() => {
        throw new Error('format key missing');
      });
      const result = ErrorNotificationHelper._localizeApiError(new Error('test'), 'op');
      expect(result).toBeNull();
    });

    it('should use String(error) when error.message is undefined', () => {
      const error = { toString: () => 'stringified error' };
      ErrorNotificationHelper._localizeApiError(error, 'op');
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Errors.ApiError',
        { operation: 'op', error: 'stringified error' }
      );
    });
  });

  // ── _resetCooldowns ────────────────────────────────────────────────────

  describe('_resetCooldowns()', () => {
    it('should clear the dedup map', () => {
      ErrorNotificationHelper.notify('test');
      ErrorNotificationHelper._resetCooldowns();
      ErrorNotificationHelper.notify('test');
      expect(ui.notifications.error).toHaveBeenCalledTimes(2);
    });

    it('should restore default cooldown when called without argument', () => {
      ErrorNotificationHelper._resetCooldowns(100);
      expect(ErrorNotificationHelper._cooldownMs).toBe(100);
      ErrorNotificationHelper._resetCooldowns();
      expect(ErrorNotificationHelper._cooldownMs).toBe(5000);
    });

    it('should set custom cooldown when argument is provided', () => {
      ErrorNotificationHelper._resetCooldowns(1000);
      expect(ErrorNotificationHelper._cooldownMs).toBe(1000);
    });

    it('should affect deduplication with custom cooldown', () => {
      ErrorNotificationHelper._resetCooldowns(50);

      const now = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(now);

      ErrorNotificationHelper.notify('dup');
      expect(ui.notifications.error).toHaveBeenCalledTimes(1);

      // Still within 50ms cooldown
      vi.spyOn(Date, 'now').mockReturnValue(now + 30);
      ErrorNotificationHelper.notify('dup');
      expect(ui.notifications.error).toHaveBeenCalledTimes(1);

      // Past 50ms cooldown
      vi.spyOn(Date, 'now').mockReturnValue(now + 60);
      ErrorNotificationHelper.notify('dup');
      expect(ui.notifications.error).toHaveBeenCalledTimes(2);
    });
  });
});
