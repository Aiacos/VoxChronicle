import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorNotificationHelper } from '../../scripts/utils/ErrorNotificationHelper.mjs';

describe('ErrorNotificationHelper', () => {
  beforeEach(() => {
    globalThis.ui = { notifications: { error: vi.fn(), warn: vi.fn() } };
    globalThis.game = {
      i18n: {
        format: vi.fn((key, data) => `${key}: ${data?.error || ''}`),
        localize: vi.fn((key) => key)
      }
    };
  });

  describe('notify', () => {
    it('should call ui.notifications.error with sanitized message', () => {
      const error = new Error('Something <b>broke</b>');
      ErrorNotificationHelper.notify('transcription', error);
      expect(ui.notifications.error).toHaveBeenCalledTimes(1);
      const msg = ui.notifications.error.mock.calls[0][0];
      expect(msg).not.toContain('<b>');
    });

    it('should use i18n format when available', () => {
      const error = new Error('API timeout');
      ErrorNotificationHelper.notify('transcription', error);
      expect(game.i18n.format).toHaveBeenCalled();
    });

    it('should fall back to Logger when ui.notifications is unavailable', () => {
      delete globalThis.ui;
      const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ErrorNotificationHelper.notify('test', new Error('fail'));
      expect(logSpy).toHaveBeenCalled();
      // Logger.error passes prefix as first arg, message as second
      const allArgs = logSpy.mock.calls[0].join(' ');
      expect(allArgs.toLowerCase()).toContain('vox');
      expect(allArgs).toContain('fail');
      logSpy.mockRestore();
    });

    it('should truncate very long error messages', () => {
      const longMsg = 'x'.repeat(1000);
      const error = new Error(longMsg);
      ErrorNotificationHelper.notify('test', error);
      const msg = ui.notifications.error.mock.calls[0][0];
      expect(msg.length).toBeLessThan(600);
    });

    it('should handle null error object', () => {
      expect(() => {
        ErrorNotificationHelper.notify('test', null);
      }).not.toThrow();
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should handle string error', () => {
      ErrorNotificationHelper.notify('test', 'string error');
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should use warn when options.warn is true', () => {
      ErrorNotificationHelper.notify('test', new Error('warning'), { warn: true });
      expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
      expect(ui.notifications.error).not.toHaveBeenCalled();
    });

    it('should handle missing game.i18n gracefully', () => {
      delete globalThis.game;
      expect(() => {
        ErrorNotificationHelper.notify('test', new Error('fail'));
      }).not.toThrow();
    });

    it('should include category in fallback message when i18n unavailable', () => {
      delete globalThis.game;
      ErrorNotificationHelper.notify('transcription', new Error('API timeout'));
      const msg = ui.notifications.error.mock.calls[0][0];
      expect(msg).toContain('[transcription]');
      expect(msg).toContain('API timeout');
    });
  });
});
