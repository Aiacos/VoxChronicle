/**
 * ErrorNotificationHelper Unit Tests
 *
 * Tests for the ErrorNotificationHelper utility class.
 * Covers basic notifications, deduplication within cooldown,
 * API error handling, all severity levels, and localized messages.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock constants and Logger before importing ErrorNotificationHelper
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

import {
  ErrorNotificationHelper,
  NOTIFICATION_TYPE
} from '../../scripts/utils/ErrorNotificationHelper.mjs';
import { Logger } from '../../scripts/utils/Logger.mjs';

describe('ErrorNotificationHelper', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset cooldowns with a very short cooldown for testing
    ErrorNotificationHelper._resetCooldowns(0);

    // Set up Foundry-like globals
    globalThis.ui = {
      notifications: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn()
      }
    };

    globalThis.game = {
      i18n: {
        localize: vi.fn((key) => key),
        format: vi.fn((key, data) => `${key}: ${JSON.stringify(data)}`)
      }
    };
  });

  afterEach(() => {
    delete globalThis.ui;
    delete globalThis.game;
    ErrorNotificationHelper._resetCooldowns();
  });

  // ─── NOTIFICATION_TYPE constant ──────────────────────────────────

  describe('NOTIFICATION_TYPE', () => {
    it('should define ERROR as "error"', () => {
      expect(NOTIFICATION_TYPE.ERROR).toBe('error');
    });

    it('should define WARNING as "warn"', () => {
      expect(NOTIFICATION_TYPE.WARNING).toBe('warn');
    });

    it('should define INFO as "info"', () => {
      expect(NOTIFICATION_TYPE.INFO).toBe('info');
    });
  });

  // ─── notify() ────────────────────────────────────────────────────

  describe('notify()', () => {
    it('should show an error notification by default', () => {
      ErrorNotificationHelper.notify('Something went wrong');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        'Something went wrong',
        { permanent: undefined }
      );
    });

    it('should show a warning notification when type is warn', () => {
      ErrorNotificationHelper.notify('Watch out', { type: NOTIFICATION_TYPE.WARNING });

      expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith(
        'Watch out',
        { permanent: undefined }
      );
    });

    it('should show an info notification when type is info', () => {
      ErrorNotificationHelper.notify('FYI', { type: NOTIFICATION_TYPE.INFO });

      expect(globalThis.ui.notifications.info).toHaveBeenCalledWith(
        'FYI',
        { permanent: undefined }
      );
    });

    it('should extract message from Error objects', () => {
      const err = new Error('Error object message');
      ErrorNotificationHelper.notify(err);

      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        'Error object message',
        { permanent: undefined }
      );
    });

    it('should convert non-string/non-Error values to string', () => {
      ErrorNotificationHelper.notify(42);

      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        '42',
        { permanent: undefined }
      );
    });

    it('should pass permanent option to the notification', () => {
      ErrorNotificationHelper.notify('Permanent msg', {
        type: NOTIFICATION_TYPE.ERROR,
        permanent: true
      });

      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        'Permanent msg',
        { permanent: true }
      );
    });

    it('should log errors to Logger.error with context', () => {
      const err = new Error('test');
      ErrorNotificationHelper.notify(err, {
        type: NOTIFICATION_TYPE.ERROR,
        context: 'AudioCapture'
      });

      expect(Logger.error).toHaveBeenCalledWith(
        '[AudioCapture] test',
        err
      );
    });

    it('should log warnings to Logger.warn', () => {
      ErrorNotificationHelper.notify('warning msg', {
        type: NOTIFICATION_TYPE.WARNING,
        context: 'Settings'
      });

      expect(Logger.warn).toHaveBeenCalledWith('[Settings] warning msg');
    });

    it('should log info to Logger.info', () => {
      ErrorNotificationHelper.notify('info msg', {
        type: NOTIFICATION_TYPE.INFO
      });

      expect(Logger.info).toHaveBeenCalledWith('info msg');
    });

    it('should not throw when ui is undefined', () => {
      delete globalThis.ui;

      expect(() => {
        ErrorNotificationHelper.notify('no ui');
      }).not.toThrow();
    });

    it('should not throw when ui.notifications is undefined', () => {
      globalThis.ui = {};

      expect(() => {
        ErrorNotificationHelper.notify('no notifications');
      }).not.toThrow();
    });

    it('should not throw when notification method is not a function', () => {
      globalThis.ui = {
        notifications: {
          error: 'not-a-function'
        }
      };

      expect(() => {
        ErrorNotificationHelper.notify('bad method');
      }).not.toThrow();
    });

    it('should include context prefix in log but not in ui notification', () => {
      ErrorNotificationHelper.notify('msg', {
        type: NOTIFICATION_TYPE.ERROR,
        context: 'Ctx'
      });

      // Logger gets the context prefix
      expect(Logger.error).toHaveBeenCalledWith(
        '[Ctx] msg',
        'msg'
      );

      // UI notification only gets the raw message
      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        'msg',
        { permanent: undefined }
      );
    });
  });

  // ─── Deduplication ───────────────────────────────────────────────

  describe('deduplication', () => {
    it('should suppress duplicate notifications within cooldown period', () => {
      // Set a long cooldown
      ErrorNotificationHelper._resetCooldowns(60000);

      ErrorNotificationHelper.notify('same message');
      ErrorNotificationHelper.notify('same message');
      ErrorNotificationHelper.notify('same message');

      // Only the first call should go through
      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(1);
    });

    it('should allow different messages even within cooldown', () => {
      ErrorNotificationHelper._resetCooldowns(60000);

      ErrorNotificationHelper.notify('message A');
      ErrorNotificationHelper.notify('message B');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(2);
    });

    it('should treat same message with different types as different notifications', () => {
      ErrorNotificationHelper._resetCooldowns(60000);

      ErrorNotificationHelper.notify('same text', { type: NOTIFICATION_TYPE.ERROR });
      ErrorNotificationHelper.notify('same text', { type: NOTIFICATION_TYPE.WARNING });

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(1);
      expect(globalThis.ui.notifications.warn).toHaveBeenCalledTimes(1);
    });

    it('should allow same message after cooldown expires', async () => {
      // Use a very short cooldown (1ms)
      ErrorNotificationHelper._resetCooldowns(1);

      ErrorNotificationHelper.notify('repeated msg');

      // Wait for the cooldown to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      ErrorNotificationHelper.notify('repeated msg');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(2);
    });

    it('should suppress Logger calls for duplicate notifications', () => {
      ErrorNotificationHelper._resetCooldowns(60000);

      ErrorNotificationHelper.notify('dup msg');
      ErrorNotificationHelper.notify('dup msg');

      expect(Logger.error).toHaveBeenCalledTimes(1);
    });
  });

  // ─── error() ─────────────────────────────────────────────────────

  describe('error()', () => {
    it('should call notify with ERROR type', () => {
      ErrorNotificationHelper.error('err msg');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        'err msg',
        { permanent: undefined }
      );
    });

    it('should pass context to notify', () => {
      ErrorNotificationHelper.error('err msg', 'AudioCapture');

      expect(Logger.error).toHaveBeenCalledWith(
        '[AudioCapture] err msg',
        'err msg'
      );
    });

    it('should handle Error objects', () => {
      const err = new Error('real error');
      ErrorNotificationHelper.error(err, 'Service');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledWith(
        'real error',
        { permanent: undefined }
      );
    });
  });

  // ─── warn() ──────────────────────────────────────────────────────

  describe('warn()', () => {
    it('should call notify with WARNING type', () => {
      ErrorNotificationHelper.warn('warning msg');

      expect(globalThis.ui.notifications.warn).toHaveBeenCalledWith(
        'warning msg',
        { permanent: undefined }
      );
    });

    it('should pass context to notify', () => {
      ErrorNotificationHelper.warn('warning msg', 'Parser');

      expect(Logger.warn).toHaveBeenCalledWith('[Parser] warning msg');
    });
  });

  // ─── info() ──────────────────────────────────────────────────────

  describe('info()', () => {
    it('should call notify with INFO type', () => {
      ErrorNotificationHelper.info('info msg');

      expect(globalThis.ui.notifications.info).toHaveBeenCalledWith(
        'info msg',
        { permanent: undefined }
      );
    });

    it('should not include context (info has no context parameter)', () => {
      ErrorNotificationHelper.info('info only');

      expect(Logger.info).toHaveBeenCalledWith('info only');
    });
  });

  // ─── handleApiError() ────────────────────────────────────────────

  describe('handleApiError()', () => {
    it('should handle network errors as error notifications', () => {
      const networkError = new Error('Network failure');
      networkError.isNetworkError = true;

      ErrorNotificationHelper.handleApiError(networkError, 'transcription');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(1);
    });

    it('should handle rate limit errors as warning notifications', () => {
      const rateError = new Error('rate limit exceeded');

      ErrorNotificationHelper.handleApiError(rateError, 'transcription');

      expect(globalThis.ui.notifications.warn).toHaveBeenCalledTimes(1);
    });

    it('should handle Italian rate limit keyword "limite"', () => {
      const rateError = new Error('limite di richieste superato');

      ErrorNotificationHelper.handleApiError(rateError, 'transcription');

      expect(globalThis.ui.notifications.warn).toHaveBeenCalledTimes(1);
    });

    it('should handle generic API errors as error notifications', () => {
      const apiError = new Error('Invalid API key');

      ErrorNotificationHelper.handleApiError(apiError, 'image generation');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(1);
    });

    it('should include operation context in logged message', () => {
      const apiError = new Error('server error');

      ErrorNotificationHelper.handleApiError(apiError, 'image generation');

      expect(Logger.error).toHaveBeenCalledWith(
        expect.stringContaining('[image generation]'),
        expect.anything()
      );
    });

    it('should use localized message when game.i18n is available', () => {
      const networkError = new Error('Network failure');
      networkError.isNetworkError = true;

      ErrorNotificationHelper.handleApiError(networkError, 'transcription');

      // game.i18n.format should have been called for localization
      expect(globalThis.game.i18n.format).toHaveBeenCalledWith(
        'vox-chronicle.Errors.NetworkError',
        { operation: 'transcription' }
      );
    });

    it('should use localized message for rate limit errors', () => {
      const rateError = new Error('rate limit exceeded');

      ErrorNotificationHelper.handleApiError(rateError, 'transcription');

      expect(globalThis.game.i18n.format).toHaveBeenCalledWith(
        'vox-chronicle.Errors.RateLimited',
        { operation: 'transcription' }
      );
    });

    it('should use localized message for generic API errors', () => {
      const apiError = new Error('Something failed');

      ErrorNotificationHelper.handleApiError(apiError, 'analysis');

      expect(globalThis.game.i18n.format).toHaveBeenCalledWith(
        'vox-chronicle.Errors.ApiError',
        { operation: 'analysis', error: 'Something failed' }
      );
    });

    it('should fall back to raw message when game is undefined', () => {
      delete globalThis.game;

      const apiError = new Error('raw error');

      expect(() => {
        ErrorNotificationHelper.handleApiError(apiError, 'test');
      }).not.toThrow();

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(1);
    });

    it('should fall back to raw message when i18n.format throws', () => {
      globalThis.game.i18n.format = vi.fn(() => {
        throw new Error('Missing key');
      });

      const apiError = new Error('fallback error');

      expect(() => {
        ErrorNotificationHelper.handleApiError(apiError, 'test');
      }).not.toThrow();

      // Should still show the notification with the raw error
      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(1);
    });

    it('should prioritize network error check over rate limit check', () => {
      const error = new Error('rate limit on network');
      error.isNetworkError = true;

      ErrorNotificationHelper.handleApiError(error, 'test');

      // Should be treated as network error (error), not rate limit (warn)
      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(1);
      expect(globalThis.ui.notifications.warn).not.toHaveBeenCalled();
    });
  });

  // ─── _resetCooldowns() ──────────────────────────────────────────

  describe('_resetCooldowns()', () => {
    it('should clear all recorded notification timestamps', () => {
      ErrorNotificationHelper._resetCooldowns(60000);
      ErrorNotificationHelper.notify('msg');

      // Reset
      ErrorNotificationHelper._resetCooldowns(60000);

      // Same message should now be allowed
      ErrorNotificationHelper.notify('msg');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(2);
    });

    it('should reset cooldown to default when called without argument', () => {
      ErrorNotificationHelper._resetCooldowns(1);
      ErrorNotificationHelper._resetCooldowns();

      // Cooldown should be back to default (5000ms)
      // We verify indirectly: two rapid calls should be deduped
      ErrorNotificationHelper.notify('dedup test');
      ErrorNotificationHelper.notify('dedup test');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(1);
    });

    it('should accept a custom cooldown period', () => {
      ErrorNotificationHelper._resetCooldowns(0);

      // With 0ms cooldown, duplicates should not be suppressed
      ErrorNotificationHelper.notify('rapid');
      ErrorNotificationHelper.notify('rapid');

      expect(globalThis.ui.notifications.error).toHaveBeenCalledTimes(2);
    });
  });

  // ─── _localizeApiError() ─────────────────────────────────────────

  describe('_localizeApiError() (private)', () => {
    it('should return null when game is not defined', () => {
      delete globalThis.game;

      const result = ErrorNotificationHelper._localizeApiError(
        new Error('test'),
        'op'
      );

      expect(result).toBeNull();
    });

    it('should return null when game.i18n is null', () => {
      globalThis.game = { i18n: null };

      const result = ErrorNotificationHelper._localizeApiError(
        new Error('test'),
        'op'
      );

      expect(result).toBeNull();
    });

    it('should return localized network error message', () => {
      const err = new Error('network');
      err.isNetworkError = true;

      const result = ErrorNotificationHelper._localizeApiError(err, 'transcription');

      expect(globalThis.game.i18n.format).toHaveBeenCalledWith(
        'vox-chronicle.Errors.NetworkError',
        { operation: 'transcription' }
      );
      expect(result).not.toBeNull();
    });

    it('should return localized rate limit message', () => {
      const err = new Error('rate limit');

      const result = ErrorNotificationHelper._localizeApiError(err, 'images');

      expect(globalThis.game.i18n.format).toHaveBeenCalledWith(
        'vox-chronicle.Errors.RateLimited',
        { operation: 'images' }
      );
      expect(result).not.toBeNull();
    });

    it('should return localized generic API error message', () => {
      const err = new Error('unknown');

      const result = ErrorNotificationHelper._localizeApiError(err, 'analysis');

      expect(globalThis.game.i18n.format).toHaveBeenCalledWith(
        'vox-chronicle.Errors.ApiError',
        { operation: 'analysis', error: 'unknown' }
      );
      expect(result).not.toBeNull();
    });

    it('should return null when i18n.format throws', () => {
      globalThis.game.i18n.format = vi.fn(() => {
        throw new Error('key not found');
      });

      const result = ErrorNotificationHelper._localizeApiError(
        new Error('test'),
        'op'
      );

      expect(result).toBeNull();
    });
  });
});
