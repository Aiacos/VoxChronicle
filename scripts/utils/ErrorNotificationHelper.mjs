/**
 * ErrorNotificationHelper - Centralized Error Notification Utility for VoxChronicle
 *
 * Provides centralized error notification handling with different severity levels,
 * deduplication with cooldown to prevent notification spam, and API error handling
 * with localized messages.
 *
 * Ported from Narrator Master's error-notification-helper.js.
 *
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from './Logger.mjs';

/**
 * Error notification types for different severity levels
 * @constant {Object}
 */
export const NOTIFICATION_TYPE = {
  ERROR: 'error',
  WARNING: 'warn',
  INFO: 'info'
};

/**
 * Default cooldown period in milliseconds for deduplication.
 * Notifications with the same message will be suppressed within this window.
 * @constant {number}
 */
const DEFAULT_COOLDOWN_MS = 5000;

/**
 * Centralized error notification helper.
 * Handles different error types and shows appropriate user notifications
 * with deduplication to avoid notification spam.
 */
export class ErrorNotificationHelper {
  /**
   * Map of message keys to the timestamp when they were last shown.
   * Used for deduplication within the cooldown period.
   * @type {Map<string, number>}
   * @private
   */
  static _lastNotified = new Map();

  /**
   * Cooldown period in milliseconds. Duplicate messages within this
   * window are suppressed.
   * @type {number}
   * @private
   */
  static _cooldownMs = DEFAULT_COOLDOWN_MS;

  /**
   * Shows a notification to the user with deduplication.
   *
   * If the same message (keyed by type + message text) was already shown
   * within the cooldown period, it is silently suppressed.
   *
   * @param {Error|string} error - The error or message to display
   * @param {Object} [options={}] - Notification options
   * @param {string} [options.type='error'] - Notification type (error, warn, info)
   * @param {boolean} [options.permanent=false] - Whether notification should be permanent
   * @param {string} [options.context] - Additional context about where the error occurred
   */
  static notify(error, options = {}) {
    const type = options.type || NOTIFICATION_TYPE.ERROR;
    const message = error instanceof Error ? error.message : String(error);
    const context = options.context ? `[${options.context}] ` : '';

    // Deduplication: suppress if the same notification was shown recently
    const dedupKey = `${type}::${message}`;
    const now = Date.now();
    const lastTime = ErrorNotificationHelper._lastNotified.get(dedupKey);

    if (lastTime !== undefined && (now - lastTime) < ErrorNotificationHelper._cooldownMs) {
      // Suppress duplicate notification within cooldown
      return;
    }

    // Record this notification timestamp
    ErrorNotificationHelper._lastNotified.set(dedupKey, now);

    // Log to console for debugging
    if (type === NOTIFICATION_TYPE.ERROR) {
      Logger.error(`${context}${message}`, error);
    } else if (type === NOTIFICATION_TYPE.WARNING) {
      Logger.warn(`${context}${message}`);
    } else {
      Logger.info(`${context}${message}`);
    }

    // Show user notification via Foundry's UI
    if (typeof ui !== 'undefined' && ui?.notifications) {
      const notifyMethod = ui.notifications[type];
      if (typeof notifyMethod === 'function') {
        notifyMethod.call(ui.notifications, message, { permanent: options.permanent });
      }
    }
  }

  /**
   * Shows an error notification.
   *
   * @param {Error|string} error - The error to display
   * @param {string} [context] - Additional context
   */
  static error(error, context) {
    ErrorNotificationHelper.notify(error, { type: NOTIFICATION_TYPE.ERROR, context });
  }

  /**
   * Shows a warning notification.
   *
   * @param {string} message - The warning message
   * @param {string} [context] - Additional context
   */
  static warn(message, context) {
    ErrorNotificationHelper.notify(message, { type: NOTIFICATION_TYPE.WARNING, context });
  }

  /**
   * Shows an info notification.
   *
   * @param {string} message - The info message
   */
  static info(message) {
    ErrorNotificationHelper.notify(message, { type: NOTIFICATION_TYPE.INFO });
  }

  /**
   * Handles API-related errors with specific messaging.
   *
   * Attempts to produce localized user-facing messages via Foundry's
   * `game.i18n` when available, falling back to the raw error message.
   *
   * @param {Error} error - The API error
   * @param {string} operation - What operation failed (e.g., 'transcription', 'image generation')
   */
  static handleApiError(error, operation) {
    // Attempt to localize the message
    const localizedMessage = ErrorNotificationHelper._localizeApiError(error, operation);

    // Check if it's a network error
    if (error.isNetworkError) {
      ErrorNotificationHelper.notify(localizedMessage || error.message, {
        type: NOTIFICATION_TYPE.ERROR,
        context: operation
      });
      return;
    }

    // Check for rate limiting
    if (error.message?.includes('rate') || error.message?.includes('limite')) {
      ErrorNotificationHelper.notify(localizedMessage || error.message, {
        type: NOTIFICATION_TYPE.WARNING,
        context: operation
      });
      return;
    }

    // Default error handling
    ErrorNotificationHelper.notify(localizedMessage || error, {
      type: NOTIFICATION_TYPE.ERROR,
      context: operation
    });
  }

  /**
   * Attempt to produce a localized error message for an API error.
   *
   * Uses Foundry's `game.i18n.format()` / `game.i18n.localize()` when
   * available, returning `null` if i18n is not accessible so the caller
   * can fall back to the raw error message.
   *
   * @param {Error} error - The API error
   * @param {string} operation - The operation that failed
   * @returns {string|null} The localized message, or null if i18n is unavailable
   * @private
   */
  static _localizeApiError(error, operation) {
    try {
      const i18n = (typeof game !== 'undefined') ? game?.i18n : null;
      if (!i18n) return null;

      if (error.isNetworkError) {
        return i18n.format('VOXCHRONICLE.Errors.NetworkError', { operation });
      }

      if (error.message?.includes('rate') || error.message?.includes('limite')) {
        return i18n.format('VOXCHRONICLE.Errors.RateLimited', { operation });
      }

      return i18n.format('VOXCHRONICLE.Errors.ApiError', {
        operation,
        error: error.message || String(error)
      });
    } catch {
      // i18n not available or format key missing - return null to fall back
      return null;
    }
  }

  /**
   * Reset the cooldown map. Intended for testing only.
   *
   * @param {number} [cooldownMs] - Optionally override the cooldown period
   */
  static _resetCooldowns(cooldownMs) {
    ErrorNotificationHelper._lastNotified.clear();
    if (cooldownMs !== undefined) {
      ErrorNotificationHelper._cooldownMs = cooldownMs;
    } else {
      ErrorNotificationHelper._cooldownMs = DEFAULT_COOLDOWN_MS;
    }
  }
}
