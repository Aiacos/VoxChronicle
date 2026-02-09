/**
 * ApiKeyValidator Unit Tests
 *
 * Tests for the ApiKeyValidator utility class.
 * Covers OpenAI key and Kanka token format validation.
 */

import { describe, it, expect } from 'vitest';
import { ApiKeyValidator } from '../../scripts/utils/ApiKeyValidator.mjs';

describe('ApiKeyValidator', () => {
  describe('validateOpenAIKey', () => {
    describe('valid keys', () => {
      it('should accept valid legacy OpenAI key (sk-)', () => {
        const validKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFG';
        const result = ApiKeyValidator.validateOpenAIKey(validKey);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept valid project-scoped OpenAI key (sk-proj-)', () => {
        const validKey = 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyzABCDEFG';
        const result = ApiKeyValidator.validateOpenAIKey(validKey);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept keys with hyphens in the body', () => {
        const validKey = 'sk-1234-5678-90ab-cdef-ghij-klmn-opqr-stuv-wxyz-ABCDEFG';
        const result = ApiKeyValidator.validateOpenAIKey(validKey);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept keys longer than 43 characters', () => {
        const validKey = 'sk-' + 'a'.repeat(100);
        const result = ApiKeyValidator.validateOpenAIKey(validKey);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should trim whitespace and accept valid key', () => {
        const validKey = '  sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFG  ';
        const result = ApiKeyValidator.validateOpenAIKey(validKey);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    describe('invalid keys', () => {
      it('should reject empty string', () => {
        const result = ApiKeyValidator.validateOpenAIKey('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API key must be a non-empty string');
      });

      it('should reject null', () => {
        const result = ApiKeyValidator.validateOpenAIKey(null);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API key must be a non-empty string');
      });

      it('should reject undefined', () => {
        const result = ApiKeyValidator.validateOpenAIKey(undefined);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API key must be a non-empty string');
      });

      it('should reject non-string input (number)', () => {
        const result = ApiKeyValidator.validateOpenAIKey(123456);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API key must be a non-empty string');
      });

      it('should reject non-string input (object)', () => {
        const result = ApiKeyValidator.validateOpenAIKey({ key: 'sk-test' });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API key must be a non-empty string');
      });

      it('should reject whitespace-only string', () => {
        const result = ApiKeyValidator.validateOpenAIKey('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API key must be a non-empty string');
      });

      it('should reject key without sk- prefix', () => {
        const result = ApiKeyValidator.validateOpenAIKey(
          '1234567890abcdefghijklmnopqrstuvwxyzABCDEFG'
        );
        expect(result.valid).toBe(false);
        expect(result.error).toBe("OpenAI API keys must start with 'sk-' or 'sk-proj-'");
      });

      it('should reject key with wrong prefix', () => {
        const result = ApiKeyValidator.validateOpenAIKey(
          'pk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFG'
        );
        expect(result.valid).toBe(false);
        expect(result.error).toBe("OpenAI API keys must start with 'sk-' or 'sk-proj-'");
      });

      it('should reject key too short (less than 43 chars after prefix)', () => {
        const result = ApiKeyValidator.validateOpenAIKey('sk-12345');
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          "Invalid OpenAI API key format. Keys must start with 'sk-' or 'sk-proj-' followed by at least 43 alphanumeric characters or hyphens"
        );
      });

      it('should reject key with invalid characters (spaces)', () => {
        const result = ApiKeyValidator.validateOpenAIKey(
          'sk-1234 5678 90ab cdef ghij klmn opqr stuv wxyz ABCDEFG'
        );
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          "Invalid OpenAI API key format. Keys must start with 'sk-' or 'sk-proj-' followed by at least 43 alphanumeric characters or hyphens"
        );
      });

      it('should reject key with invalid characters (special chars)', () => {
        const result = ApiKeyValidator.validateOpenAIKey(
          'sk-1234567890!@#$%^&*()_+=abcdefghijklmnopqrst'
        );
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          "Invalid OpenAI API key format. Keys must start with 'sk-' or 'sk-proj-' followed by at least 43 alphanumeric characters or hyphens"
        );
      });

      it('should reject just "sk-"', () => {
        const result = ApiKeyValidator.validateOpenAIKey('sk-');
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          "Invalid OpenAI API key format. Keys must start with 'sk-' or 'sk-proj-' followed by at least 43 alphanumeric characters or hyphens"
        );
      });

      it('should reject just "sk-proj-"', () => {
        const result = ApiKeyValidator.validateOpenAIKey('sk-proj-');
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          "Invalid OpenAI API key format. Keys must start with 'sk-' or 'sk-proj-' followed by at least 43 alphanumeric characters or hyphens"
        );
      });
    });
  });

  describe('validateKankaToken', () => {
    describe('valid tokens', () => {
      it('should accept valid 60-character alphanumeric token', () => {
        const validToken = 'a'.repeat(30) + 'B'.repeat(30); // 60 chars
        const result = ApiKeyValidator.validateKankaToken(validToken);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept token with mixed case alphanumerics', () => {
        const validToken = 'aBc123XyZ456' + 'a'.repeat(48); // 60 chars total
        const result = ApiKeyValidator.validateKankaToken(validToken);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept token with all numbers', () => {
        const validToken = '1234567890'.repeat(6); // 60 chars
        const result = ApiKeyValidator.validateKankaToken(validToken);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should trim whitespace and accept valid token', () => {
        const validToken = '  ' + 'a'.repeat(60) + '  ';
        const result = ApiKeyValidator.validateKankaToken(validToken);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    describe('invalid tokens', () => {
      it('should reject empty string', () => {
        const result = ApiKeyValidator.validateKankaToken('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API token must be a non-empty string');
      });

      it('should reject null', () => {
        const result = ApiKeyValidator.validateKankaToken(null);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API token must be a non-empty string');
      });

      it('should reject undefined', () => {
        const result = ApiKeyValidator.validateKankaToken(undefined);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API token must be a non-empty string');
      });

      it('should reject non-string input (number)', () => {
        const result = ApiKeyValidator.validateKankaToken(123456);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API token must be a non-empty string');
      });

      it('should reject non-string input (object)', () => {
        const result = ApiKeyValidator.validateKankaToken({ token: 'abc' });
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API token must be a non-empty string');
      });

      it('should reject whitespace-only string', () => {
        const result = ApiKeyValidator.validateKankaToken('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('API token must be a non-empty string');
      });

      it('should reject token too short (59 chars)', () => {
        const token = 'a'.repeat(59);
        const result = ApiKeyValidator.validateKankaToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Kanka API tokens must be exactly 60 characters (received 59)');
      });

      it('should reject token too long (61 chars)', () => {
        const token = 'a'.repeat(61);
        const result = ApiKeyValidator.validateKankaToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Kanka API tokens must be exactly 60 characters (received 61)');
      });

      it('should reject token with hyphens', () => {
        const token = 'a'.repeat(30) + '-' + 'b'.repeat(29); // 60 chars with hyphen
        const result = ApiKeyValidator.validateKankaToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          'Invalid Kanka API token format. Tokens must be exactly 60 alphanumeric characters'
        );
      });

      it('should reject token with special characters', () => {
        const token = 'a'.repeat(30) + '@' + 'b'.repeat(29); // 60 chars with @
        const result = ApiKeyValidator.validateKankaToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          'Invalid Kanka API token format. Tokens must be exactly 60 alphanumeric characters'
        );
      });

      it('should reject token with spaces', () => {
        const token = 'a'.repeat(30) + ' ' + 'b'.repeat(29); // 60 chars with space
        const result = ApiKeyValidator.validateKankaToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          'Invalid Kanka API token format. Tokens must be exactly 60 alphanumeric characters'
        );
      });

      it('should reject token with underscores', () => {
        const token = 'a'.repeat(30) + '_' + 'b'.repeat(29); // 60 chars with underscore
        const result = ApiKeyValidator.validateKankaToken(token);
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
          'Invalid Kanka API token format. Tokens must be exactly 60 alphanumeric characters'
        );
      });
    });
  });

  describe('isOpenAIKeyFormat', () => {
    it('should return true for valid legacy key', () => {
      const validKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFG';
      expect(ApiKeyValidator.isOpenAIKeyFormat(validKey)).toBe(true);
    });

    it('should return true for valid project-scoped key', () => {
      const validKey = 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyzABCDEFG';
      expect(ApiKeyValidator.isOpenAIKeyFormat(validKey)).toBe(true);
    });

    it('should return true for valid key with whitespace (trims)', () => {
      const validKey = '  sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEFG  ';
      expect(ApiKeyValidator.isOpenAIKeyFormat(validKey)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(ApiKeyValidator.isOpenAIKeyFormat('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(ApiKeyValidator.isOpenAIKeyFormat(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(ApiKeyValidator.isOpenAIKeyFormat(undefined)).toBe(false);
    });

    it('should return false for non-string', () => {
      expect(ApiKeyValidator.isOpenAIKeyFormat(123456)).toBe(false);
    });

    it('should return false for invalid key format', () => {
      expect(ApiKeyValidator.isOpenAIKeyFormat('pk-invalid')).toBe(false);
    });

    it('should return false for key too short', () => {
      expect(ApiKeyValidator.isOpenAIKeyFormat('sk-short')).toBe(false);
    });
  });

  describe('isKankaTokenFormat', () => {
    it('should return true for valid 60-character token', () => {
      const validToken = 'a'.repeat(60);
      expect(ApiKeyValidator.isKankaTokenFormat(validToken)).toBe(true);
    });

    it('should return true for valid token with whitespace (trims)', () => {
      const validToken = '  ' + 'a'.repeat(60) + '  ';
      expect(ApiKeyValidator.isKankaTokenFormat(validToken)).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(ApiKeyValidator.isKankaTokenFormat('')).toBe(false);
    });

    it('should return false for null', () => {
      expect(ApiKeyValidator.isKankaTokenFormat(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(ApiKeyValidator.isKankaTokenFormat(undefined)).toBe(false);
    });

    it('should return false for non-string', () => {
      expect(ApiKeyValidator.isKankaTokenFormat(123456)).toBe(false);
    });

    it('should return false for token wrong length', () => {
      expect(ApiKeyValidator.isKankaTokenFormat('a'.repeat(59))).toBe(false);
      expect(ApiKeyValidator.isKankaTokenFormat('a'.repeat(61))).toBe(false);
    });

    it('should return false for token with invalid characters', () => {
      const invalidToken = 'a'.repeat(30) + '-' + 'b'.repeat(29);
      expect(ApiKeyValidator.isKankaTokenFormat(invalidToken)).toBe(false);
    });
  });
});
