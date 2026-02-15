/**
 * Logger - Console Logging Utility for VoxChronicle
 *
 * Provides module-prefixed console output with multiple log levels
 * and optional debug mode for development.
 *
 * @class Logger
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { SensitiveDataFilter } from './SensitiveDataFilter.mjs';

/**
 * Log levels enumeration
 * @enum {number}
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  LOG: 2,
  WARN: 3,
  ERROR: 4,
  NONE: 5
};

/**
 * Logger utility class for VoxChronicle
 * Provides consistent, prefixed console output across the module
 */
class Logger {
  /**
   * Current minimum log level (messages below this level are suppressed)
   * @type {number}
   * @private
   */
  static _logLevel = LogLevel.LOG;

  /**
   * Whether debug mode is enabled
   * @type {boolean}
   * @private
   */
  static _debugEnabled = false;

  /**
   * Timing data for performance tracking
   * @type {Map<string, number>}
   * @private
   */
  static _timers = new Map();

  /**
   * Get the module prefix for log messages
   *
   * @returns {string} The formatted prefix
   * @private
   */
  static _getPrefix() {
    return `${MODULE_ID} |`;
  }

  /**
   * Get a styled prefix for different log levels (in browsers that support it)
   *
   * @param {string} level - The log level name
   * @param {string} color - The color for the level badge
   * @returns {Array} The styled prefix arguments
   * @private
   */
  static _getStyledPrefix(level, color) {
    return [
      `%c${MODULE_ID}%c ${level}`,
      'color: #9b59b6; font-weight: bold;',
      `color: ${color}; font-weight: bold;`
    ];
  }

  /**
   * Set the minimum log level
   *
   * @param {number} level - The log level from LogLevel enum
   */
  static setLogLevel(level) {
    if (level >= LogLevel.DEBUG && level <= LogLevel.NONE) {
      Logger._logLevel = level;
    }
  }

  /**
   * Enable or disable debug mode
   *
   * @param {boolean} enabled - Whether to enable debug mode
   */
  static setDebugEnabled(enabled) {
    Logger._debugEnabled = Boolean(enabled);
    if (enabled) {
      Logger._logLevel = LogLevel.DEBUG;
    }
  }

  /**
   * Alias for setDebugEnabled - used by Settings onChange callback
   *
   * @param {boolean} enabled - Whether to enable debug mode
   */
  static setDebugMode(enabled) {
    Logger.setDebugEnabled(enabled);
  }

  /**
   * Check if debug mode is currently enabled
   *
   * @returns {boolean} True if debug mode is enabled
   */
  static isDebugMode() {
    return Logger._debugEnabled;
  }

  /**
   * Check if a log level should be displayed
   *
   * @param {number} level - The log level to check
   * @returns {boolean} True if the message should be logged
   * @private
   */
  static _shouldLog(level) {
    return level >= Logger._logLevel;
  }

  /**
   * Log a debug message (only shown when debug mode is enabled)
   *
   * @param {...*} args - The message and arguments to log
   */
  static debug(...args) {
    if (Logger._shouldLog(LogLevel.DEBUG) && Logger._debugEnabled) {
      console.debug(`${Logger._getPrefix()} [DEBUG]`, ...args);
    }
  }

  /**
   * Log an informational message
   *
   * @param {...*} args - The message and arguments to log
   */
  static info(...args) {
    if (Logger._shouldLog(LogLevel.INFO)) {
      console.info(`${Logger._getPrefix()} [INFO]`, ...args);
    }
  }

  /**
   * Log a standard message
   *
   * @param {...*} args - The message and arguments to log
   */
  static log(...args) {
    if (Logger._shouldLog(LogLevel.LOG)) {
      console.log(`${Logger._getPrefix()}`, ...args);
    }
  }

  /**
   * Log a warning message
   *
   * @param {...*} args - The message and arguments to log
   */
  static warn(...args) {
    if (Logger._shouldLog(LogLevel.WARN)) {
      console.warn(`${Logger._getPrefix()} [WARN]`, ...args);
    }
  }

  /**
   * Log an error message
   *
   * @param {...*} args - The message and arguments to log
   */
  static error(...args) {
    if (Logger._shouldLog(LogLevel.ERROR)) {
      console.error(`${Logger._getPrefix()} [ERROR]`, ...args);
    }
  }

  /**
   * Start a console group (collapsible in browser dev tools)
   *
   * @param {string} label - The group label
   * @param {boolean} [collapsed=true] - Whether the group should start collapsed
   */
  static group(label, collapsed = true) {
    const groupMethod = collapsed ? console.groupCollapsed : console.group;
    groupMethod(`${Logger._getPrefix()} ${label}`);
  }

  /**
   * End a console group
   */
  static groupEnd() {
    console.groupEnd();
  }

  /**
   * Start a timer for performance measurement
   *
   * @param {string} label - The timer label
   */
  static time(label) {
    Logger._timers.set(label, performance.now());
    Logger.debug(`Timer started: ${label}`);
  }

  /**
   * End a timer and log the elapsed time
   *
   * @param {string} label - The timer label
   * @returns {number|null} The elapsed time in milliseconds, or null if timer not found
   */
  static timeEnd(label) {
    const startTime = Logger._timers.get(label);
    if (startTime === undefined) {
      Logger.warn(`Timer "${label}" not found`);
      return null;
    }

    const elapsed = performance.now() - startTime;
    Logger._timers.delete(label);
    Logger.log(`${label}: ${elapsed.toFixed(2)}ms`);
    return elapsed;
  }

  /**
   * Log a table of data (useful for debugging arrays/objects)
   *
   * @param {Array | object} data - The data to display as a table
   * @param {Array<string>} [columns] - Optional column names to display
   */
  static table(data, columns) {
    if (Logger._shouldLog(LogLevel.DEBUG)) {
      console.log(`${Logger._getPrefix()} Table:`);
      console.table(data, columns);
    }
  }

  /**
   * Log an object with expandable details
   *
   * @param {string} label - The label for the object
   * @param {object} obj - The object to log
   */
  static dir(label, obj) {
    if (Logger._shouldLog(LogLevel.DEBUG)) {
      console.log(`${Logger._getPrefix()} ${label}:`);
      console.dir(obj);
    }
  }

  /**
   * Log a trace (stack trace) message
   *
   * @param {...*} args - The message and arguments to log
   */
  static trace(...args) {
    if (Logger._shouldLog(LogLevel.DEBUG)) {
      console.trace(`${Logger._getPrefix()} [TRACE]`, ...args);
    }
  }

  /**
   * Assert a condition and log an error if it fails
   *
   * @param {boolean} condition - The condition to assert
   * @param {...*} args - The message and arguments to log on failure
   */
  static assert(condition, ...args) {
    console.assert(condition, `${Logger._getPrefix()} [ASSERT]`, ...args);
  }

  /**
   * Clear the console
   */
  static clear() {
    console.clear();
    Logger.log('Console cleared');
  }

  /**
   * Create a child logger with a sub-module prefix
   *
   * @param {string} subModule - The sub-module name
   * @param {boolean | object} [options=false] - Sanitization options.
   * If boolean: enable/disable sanitization.
   * If object: { sanitize: boolean }
   * @returns {object} A logger object with the same methods but prefixed with sub-module
   */
  static createChild(subModule, options = false) {
    const childPrefix = `${MODULE_ID}:${subModule} |`;

    // Handle options parameter (boolean or object)
    const sanitize = typeof options === 'boolean' ? options : options?.sanitize || false;

    // Helper to sanitize arguments if enabled
    const maybeSanitize = (args) => {
      return sanitize ? SensitiveDataFilter.sanitizeArgs(args) : args;
    };

    return {
      debug: (...args) => {
        if (Logger._shouldLog(LogLevel.DEBUG) && Logger._debugEnabled) {
          console.debug(`${childPrefix} [DEBUG]`, ...maybeSanitize(args));
        }
      },
      info: (...args) => {
        if (Logger._shouldLog(LogLevel.INFO)) {
          console.info(`${childPrefix} [INFO]`, ...maybeSanitize(args));
        }
      },
      log: (...args) => {
        if (Logger._shouldLog(LogLevel.LOG)) {
          console.log(`${childPrefix}`, ...maybeSanitize(args));
        }
      },
      warn: (...args) => {
        if (Logger._shouldLog(LogLevel.WARN)) {
          console.warn(`${childPrefix} [WARN]`, ...maybeSanitize(args));
        }
      },
      error: (...args) => {
        if (Logger._shouldLog(LogLevel.ERROR)) {
          console.error(`${childPrefix} [ERROR]`, ...maybeSanitize(args));
        }
      },
      group: (label, collapsed = true) => {
        const groupMethod = collapsed ? console.groupCollapsed : console.group;
        const sanitizedLabel = sanitize ? SensitiveDataFilter.sanitizeString(label) : label;
        groupMethod(`${childPrefix} ${sanitizedLabel}`);
      },
      groupEnd: () => console.groupEnd(),
      time: (label) => Logger.time(`${subModule}:${label}`),
      timeEnd: (label) => Logger.timeEnd(`${subModule}:${label}`)
    };
  }
}

// Export both the Logger class and LogLevel enum
export { Logger, LogLevel };
