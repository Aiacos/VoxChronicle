/**
 * ErrorNotificationHelper - Consistent user-facing error notifications
 *
 * Provides a standardized way to show error notifications to users
 * with proper HTML sanitization and i18n support.
 *
 * @class ErrorNotificationHelper
 * @module vox-chronicle
 */

import { escapeHtml } from './HtmlUtils.mjs';

/**
 * Maximum length for error messages displayed to users
 * @constant {number}
 */
const MAX_ERROR_LENGTH = 500;

class ErrorNotificationHelper {
  /**
   * Show a sanitized error notification to the user
   *
   * @param {string} category - Error category (e.g., 'transcription', 'kanka', 'image')
   * @param {Error|string|*} error - The error object, string, or any value
   * @param {Object} [options={}] - Options
   * @param {string} [options.context] - Additional context description
   * @param {boolean} [options.warn=false] - Use warning instead of error notification
   */
  static notify(category, error, options = {}) {
    const rawMessage = error?.message ?? String(error ?? 'Unknown error');
    const safeMessage = escapeHtml(
      rawMessage.substring(0, MAX_ERROR_LENGTH)
    );

    const i18nKey = `VOXCHRONICLE.Errors.${category.charAt(0).toUpperCase() + category.slice(1)}`;
    const message = globalThis.game?.i18n?.format(i18nKey, { error: safeMessage })
      || `VoxChronicle: ${safeMessage}`;

    const notifyFn = options.warn
      ? globalThis.ui?.notifications?.warn
      : globalThis.ui?.notifications?.error;

    notifyFn?.call(globalThis.ui?.notifications, message);
  }
}

export { ErrorNotificationHelper, MAX_ERROR_LENGTH };
