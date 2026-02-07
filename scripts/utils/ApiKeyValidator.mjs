/**
 * ApiKeyValidator - API Key Format Validation Utility for VoxChronicle
 *
 * Provides format validation for external API keys (OpenAI, Kanka) to catch
 * invalid input before storage or API calls.
 *
 * @class ApiKeyValidator
 * @module vox-chronicle
 */

/**
 * Regular expression patterns for API key validation
 * @private
 */
const PATTERNS = {
  /**
   * OpenAI API key pattern
   * - Must start with 'sk-' (legacy) or 'sk-proj-' (project-scoped)
   * - Followed by 43+ alphanumeric characters and hyphens
   */
  OPENAI_KEY: /^sk-(proj-)?[a-zA-Z0-9-]{43,}$/,

  /**
   * Kanka API token pattern
   * - Must be exactly 60 alphanumeric characters
   */
  KANKA_TOKEN: /^[a-zA-Z0-9]{60}$/
};

/**
 * ApiKeyValidator utility class for VoxChronicle
 * Provides format validation for external API keys
 */
class ApiKeyValidator {
  /**
   * Validate OpenAI API key format
   *
   * @param {string} key - The API key to validate
   * @returns {{ valid: boolean, error?: string }} Validation result
   */
  static validateOpenAIKey(key) {
    // Check for empty or non-string input
    if (!key || typeof key !== 'string') {
      return {
        valid: false,
        error: 'API key must be a non-empty string'
      };
    }

    // Trim whitespace
    const trimmedKey = key.trim();

    // Check if key is empty after trimming
    if (trimmedKey.length === 0) {
      return {
        valid: false,
        error: 'API key must be a non-empty string'
      };
    }

    // Check prefix
    if (!trimmedKey.startsWith('sk-')) {
      return {
        valid: false,
        error: "OpenAI API keys must start with 'sk-' or 'sk-proj-'"
      };
    }

    // Validate full pattern
    if (!PATTERNS.OPENAI_KEY.test(trimmedKey)) {
      return {
        valid: false,
        error: "Invalid OpenAI API key format. Keys must start with 'sk-' or 'sk-proj-' followed by at least 43 alphanumeric characters or hyphens"
      };
    }

    return { valid: true };
  }

  /**
   * Validate Kanka API token format
   *
   * @param {string} token - The API token to validate
   * @returns {{ valid: boolean, error?: string }} Validation result
   */
  static validateKankaToken(token) {
    // Check for empty or non-string input
    if (!token || typeof token !== 'string') {
      return {
        valid: false,
        error: 'API token must be a non-empty string'
      };
    }

    // Trim whitespace
    const trimmedToken = token.trim();

    // Check if token is empty after trimming
    if (trimmedToken.length === 0) {
      return {
        valid: false,
        error: 'API token must be a non-empty string'
      };
    }

    // Check length
    if (trimmedToken.length !== 60) {
      return {
        valid: false,
        error: `Kanka API tokens must be exactly 60 characters (received ${trimmedToken.length})`
      };
    }

    // Validate full pattern (alphanumeric only)
    if (!PATTERNS.KANKA_TOKEN.test(trimmedToken)) {
      return {
        valid: false,
        error: 'Invalid Kanka API token format. Tokens must be exactly 60 alphanumeric characters'
      };
    }

    return { valid: true };
  }

  /**
   * Quick boolean check for OpenAI key format
   *
   * @param {string} key - The API key to check
   * @returns {boolean} True if the key matches the expected format
   */
  static isOpenAIKeyFormat(key) {
    if (!key || typeof key !== 'string') {
      return false;
    }
    return PATTERNS.OPENAI_KEY.test(key.trim());
  }

  /**
   * Quick boolean check for Kanka token format
   *
   * @param {string} token - The API token to check
   * @returns {boolean} True if the token matches the expected format
   */
  static isKankaTokenFormat(token) {
    if (!token || typeof token !== 'string') {
      return false;
    }
    return PATTERNS.KANKA_TOKEN.test(token.trim());
  }
}

export { ApiKeyValidator };
