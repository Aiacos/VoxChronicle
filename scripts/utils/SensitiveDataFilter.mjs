/**
 * SensitiveDataFilter - Security Utility for VoxChronicle
 *
 * Provides sanitization functions to redact sensitive data (API keys, tokens,
 * authorization headers) from logs, error messages, and debug output.
 *
 * Prevents accidental exposure of credentials in browser console logs,
 * especially in debug mode where detailed request/response data may be logged.
 *
 * @class SensitiveDataFilter
 * @module vox-chronicle
 */

/**
 * Patterns for detecting sensitive data
 * @private
 */
const SENSITIVE_PATTERNS = {
  // OpenAI API keys (sk-... or sk-proj-...)
  OPENAI_KEY: /sk-(?:proj-)?[a-zA-Z0-9]{10,}/g,

  // Generic bearer tokens
  BEARER_TOKEN: /\b(Bearer\s+)([a-zA-Z0-9\-._~+/]+=*)/gi,

  // Generic API keys in various formats
  API_KEY: /\b(api[_-]?key[s]?["\s:=]+)([a-zA-Z0-9\-._~+/]{20,})/gi,

  // Authorization header values
  AUTHORIZATION: /\b(authorization["\s:=]+)([a-zA-Z0-9\-._~+/\s]{20,})/gi,

  // Kanka tokens (format may vary)
  KANKA_TOKEN: /\b([a-zA-Z0-9]{64,})\b/g
};

/**
 * Sensitive HTTP headers that should be redacted
 * @private
 */
const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'x-api-token',
  'x-auth-token',
  'api-key',
  'apikey'
];

/**
 * Sensitive query parameters that should be redacted
 * @private
 */
const SENSITIVE_PARAMS = ['api_key', 'apikey', 'token', 'access_token', 'auth', 'key'];

/**
 * Replacement text for redacted values
 * @private
 */
const REDACTED = '***';

/**
 * SensitiveDataFilter utility class
 * Provides methods to sanitize sensitive data before logging
 */
export class SensitiveDataFilter {
  /**
   * Sanitize a string by redacting sensitive data patterns
   *
   * @param {string} str - The string to sanitize
   * @returns {string} The sanitized string with sensitive data redacted
   */
  static sanitizeString(str) {
    if (typeof str !== 'string') {
      return str;
    }

    let sanitized = str;

    // Replace Bearer tokens (keep "Bearer" prefix visible)
    sanitized = sanitized.replace(
      SENSITIVE_PATTERNS.BEARER_TOKEN,
      (match, prefix) => `${prefix}${REDACTED}`
    );

    // Replace OpenAI keys
    sanitized = sanitized.replace(SENSITIVE_PATTERNS.OPENAI_KEY, REDACTED);

    // Replace API keys (keep the label visible)
    sanitized = sanitized.replace(
      SENSITIVE_PATTERNS.API_KEY,
      (match, prefix) => `${prefix}${REDACTED}`
    );

    // Replace authorization values (keep the label visible)
    sanitized = sanitized.replace(
      SENSITIVE_PATTERNS.AUTHORIZATION,
      (match, prefix) => `${prefix}${REDACTED}`
    );

    return sanitized;
  }

  /**
   * Sanitize an object by redacting sensitive properties
   * Creates a deep copy to avoid modifying the original object
   *
   * @param {object} obj - The object to sanitize
   * @param {boolean} [deep=true] - Whether to recursively sanitize nested objects
   * @returns {object} A sanitized copy of the object
   */
  static sanitizeObject(obj, deep = true) {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return typeof obj === 'string' ? SensitiveDataFilter.sanitizeString(obj) : obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map((item) => (deep ? SensitiveDataFilter.sanitizeObject(item, deep) : item));
    }

    // Handle objects
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      // Check if this is a sensitive header or property
      const isSensitive =
        SENSITIVE_HEADERS.some((h) => lowerKey.includes(h)) ||
        SENSITIVE_PARAMS.some((p) => lowerKey.includes(p));

      if (isSensitive) {
        // Redact the entire value
        sanitized[key] = REDACTED;
      } else if (deep && typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = SensitiveDataFilter.sanitizeObject(value, deep);
      } else if (typeof value === 'string') {
        // Sanitize string values
        sanitized[key] = SensitiveDataFilter.sanitizeString(value);
      } else {
        // Keep other values as-is
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize a URL by redacting sensitive query parameters
   *
   * @param {string|URL} url - The URL to sanitize (string or URL object)
   * @returns {string} The sanitized URL string
   */
  static sanitizeUrl(url) {
    if (!url) {
      return url;
    }

    try {
      const urlObj = typeof url === 'string' ? new URL(url) : url;

      // Check and redact sensitive query parameters
      let _modified = false;
      SENSITIVE_PARAMS.forEach((param) => {
        if (urlObj.searchParams.has(param)) {
          urlObj.searchParams.set(param, REDACTED);
          _modified = true;
        }
      });

      return urlObj.toString();
    } catch {
      // If URL parsing fails, treat as a string
      return SensitiveDataFilter.sanitizeString(url);
    }
  }

  /**
   * Sanitize HTTP headers object
   * Specifically designed for sanitizing request/response headers
   *
   * @param {object} headers - Headers object to sanitize
   * @returns {object} Sanitized copy of headers
   */
  static sanitizeHeaders(headers) {
    if (!headers || typeof headers !== 'object') {
      return headers;
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_HEADERS.some((h) => lowerKey.includes(h));

      if (isSensitive) {
        // For bearer tokens, keep the "Bearer" prefix visible
        if (typeof value === 'string' && value.toLowerCase().startsWith('bearer ')) {
          sanitized[key] = `Bearer ${REDACTED}`;
        } else {
          sanitized[key] = REDACTED;
        }
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize an error object before logging
   * Handles Error instances and plain objects
   *
   * @param {Error | object} error - The error to sanitize
   * @returns {object} Sanitized error information
   */
  static sanitizeError(error) {
    if (!error) {
      return error;
    }

    if (error instanceof Error) {
      // Extract error properties and sanitize
      const sanitized = {
        name: error.name,
        message: SensitiveDataFilter.sanitizeString(error.message),
        stack: error.stack ? SensitiveDataFilter.sanitizeString(error.stack) : undefined
      };

      // Include any custom properties
      for (const [key, value] of Object.entries(error)) {
        if (!['name', 'message', 'stack'].includes(key)) {
          sanitized[key] = SensitiveDataFilter.sanitizeObject(value, true);
        }
      }

      return sanitized;
    }

    // Plain object error
    return SensitiveDataFilter.sanitizeObject(error, true);
  }

  /**
   * Sanitize multiple arguments (useful for log functions)
   * Automatically detects type and applies appropriate sanitization
   *
   * @param {...*} args - Arguments to sanitize
   * @returns {Array} Array of sanitized arguments
   */
  static sanitizeArgs(...args) {
    return args.map((arg) => {
      if (arg === null || arg === undefined) {
        return arg;
      }

      if (arg instanceof Error) {
        return SensitiveDataFilter.sanitizeError(arg);
      }

      if (typeof arg === 'string') {
        return SensitiveDataFilter.sanitizeString(arg);
      }

      if (typeof arg === 'object') {
        return SensitiveDataFilter.sanitizeObject(arg, true);
      }

      return arg;
    });
  }

  /**
   * Check if a string contains potentially sensitive data
   * Useful for warnings or validation
   *
   * @param {string} str - String to check
   * @returns {boolean} True if sensitive patterns are detected
   */
  static containsSensitiveData(str) {
    if (typeof str !== 'string') {
      return false;
    }

    return Object.values(SENSITIVE_PATTERNS).some((pattern) => {
      // Reset regex lastIndex to ensure fresh test
      pattern.lastIndex = 0;
      return pattern.test(str);
    });
  }
}

/**
 * Export individual sanitization functions for convenience
 */
export const sanitizeString = SensitiveDataFilter.sanitizeString.bind(SensitiveDataFilter);
export const sanitizeObject = SensitiveDataFilter.sanitizeObject.bind(SensitiveDataFilter);
export const sanitizeUrl = SensitiveDataFilter.sanitizeUrl.bind(SensitiveDataFilter);
export const sanitizeHeaders = SensitiveDataFilter.sanitizeHeaders.bind(SensitiveDataFilter);
export const sanitizeError = SensitiveDataFilter.sanitizeError.bind(SensitiveDataFilter);
export const sanitizeArgs = SensitiveDataFilter.sanitizeArgs.bind(SensitiveDataFilter);

/**
 * Default export is the class
 */
export default SensitiveDataFilter;
