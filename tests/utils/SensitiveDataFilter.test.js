/**
 * SensitiveDataFilter Unit Tests
 *
 * Tests for the SensitiveDataFilter utility class.
 * Covers sanitization of strings, objects, URLs, headers, errors, and detection
 * of sensitive data patterns (API keys, tokens, authorization headers).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SensitiveDataFilter,
  sanitizeString,
  sanitizeObject,
  sanitizeUrl,
  sanitizeHeaders,
  sanitizeError,
  sanitizeArgs
} from '../../scripts/utils/SensitiveDataFilter.mjs';

describe('SensitiveDataFilter', () => {
  // ============================================================================
  // sanitizeString Tests
  // ============================================================================

  describe('sanitizeString', () => {
    it('should redact OpenAI API keys (sk-... format)', () => {
      const input = 'API Key: sk-1234567890abcdefghij';
      const output = SensitiveDataFilter.sanitizeString(input);
      expect(output).toBe('API Key: ***');
      expect(output).not.toContain('sk-1234567890abcdefghij');
    });

    it('should redact OpenAI API keys (sk-proj-... format)', () => {
      const input = 'Using key sk-proj-abcdefghijklmnop123456';
      const output = SensitiveDataFilter.sanitizeString(input);
      expect(output).toBe('Using key ***');
      expect(output).not.toContain('sk-proj-');
    });

    it('should redact Bearer tokens while preserving prefix', () => {
      const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
      const output = SensitiveDataFilter.sanitizeString(input);
      expect(output).toBe('Authorization: Bearer ***');
      expect(output).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact API keys in various formats', () => {
      const testCases = [
        {
          input: 'api_key: abcdef1234567890ghijklmnopqrstuvwxyz',
          expected: 'api_key: ***'
        },
        {
          input: 'api-key="xyz123456789012345678901234567890"',
          expected: 'api-key="***"'
        },
        {
          input: 'apikeys=token_long_enough_to_be_detected_as_secret',
          expected: 'apikeys=***'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        const output = SensitiveDataFilter.sanitizeString(input);
        expect(output).toBe(expected);
      });
    });

    it('should redact authorization header values', () => {
      const input = 'authorization: Bearer token1234567890abcdefghij';
      const output = SensitiveDataFilter.sanitizeString(input);
      expect(output).toBe('authorization: Bearer ***');
    });

    it('should handle multiple sensitive patterns in one string', () => {
      const input = 'OpenAI: sk-1234567890abcdef, Kanka: Bearer xyz789012345678901234567890';
      const output = SensitiveDataFilter.sanitizeString(input);
      expect(output).not.toContain('sk-1234567890abcdef');
      expect(output).not.toContain('xyz789012345678901234567890');
      expect(output).toContain('***');
    });

    it('should return non-string inputs unchanged', () => {
      expect(SensitiveDataFilter.sanitizeString(123)).toBe(123);
      expect(SensitiveDataFilter.sanitizeString(null)).toBe(null);
      expect(SensitiveDataFilter.sanitizeString(undefined)).toBe(undefined);
      expect(SensitiveDataFilter.sanitizeString(true)).toBe(true);
    });

    it('should return empty strings unchanged', () => {
      expect(SensitiveDataFilter.sanitizeString('')).toBe('');
    });

    it('should not modify strings without sensitive data', () => {
      const input = 'This is a regular log message without secrets';
      const output = SensitiveDataFilter.sanitizeString(input);
      expect(output).toBe(input);
    });
  });

  // ============================================================================
  // sanitizeObject Tests
  // ============================================================================

  describe('sanitizeObject', () => {
    it('should redact sensitive properties by name', () => {
      const input = {
        username: 'testuser',
        authorization: 'Bearer secret_token_here',
        apiKey: 'sk-1234567890abcdef',
        normalField: 'safe value'
      };

      const output = SensitiveDataFilter.sanitizeObject(input);
      expect(output.username).toBe('testuser');
      expect(output.authorization).toBe('***');
      expect(output.apiKey).toBe('***');
      expect(output.normalField).toBe('safe value');
    });

    it('should sanitize nested objects recursively (deep=true)', () => {
      const input = {
        request: {
          headers: {
            authorization: 'Bearer nested_token',
            'content-type': 'application/json'
          }
        },
        config: {
          apiKey: 'secret_key'
        }
      };

      const output = SensitiveDataFilter.sanitizeObject(input, true);
      expect(output.request.headers.authorization).toBe('***');
      expect(output.request.headers['content-type']).toBe('application/json');
      expect(output.config.apiKey).toBe('***');
    });

    it('should not sanitize nested objects when deep=false', () => {
      const input = {
        request: {
          headers: {
            authorization: 'Bearer nested_token'
          }
        }
      };

      const output = SensitiveDataFilter.sanitizeObject(input, false);
      expect(output.request.headers.authorization).toBe('Bearer nested_token');
    });

    it('should sanitize arrays', () => {
      const input = [
        'safe string',
        'api_key: secret123456789012345678901',
        { authorization: 'Bearer token' }
      ];

      const output = SensitiveDataFilter.sanitizeObject(input);
      expect(output[0]).toBe('safe string');
      expect(output[1]).toContain('***');
      expect(output[2].authorization).toBe('***');
    });

    it('should sanitize string values containing sensitive patterns', () => {
      const input = {
        message: 'Error: API key sk-proj-test123456789 is invalid'
      };

      const output = SensitiveDataFilter.sanitizeObject(input);
      expect(output.message).not.toContain('sk-proj-test123456789');
      expect(output.message).toContain('***');
    });

    it('should handle null and undefined objects', () => {
      expect(SensitiveDataFilter.sanitizeObject(null)).toBe(null);
      expect(SensitiveDataFilter.sanitizeObject(undefined)).toBe(undefined);
    });

    it('should handle non-object primitives', () => {
      expect(SensitiveDataFilter.sanitizeObject(42)).toBe(42);
      expect(SensitiveDataFilter.sanitizeObject(true)).toBe(true);
      expect(SensitiveDataFilter.sanitizeObject('plain string')).toBe('plain string');
    });

    it('should detect sensitive headers case-insensitively', () => {
      const input = {
        Authorization: 'Bearer token',
        'X-API-KEY': 'secret',
        'x-auth-token': 'another_secret'
      };

      const output = SensitiveDataFilter.sanitizeObject(input);
      expect(output.Authorization).toBe('***');
      expect(output['X-API-KEY']).toBe('***');
      expect(output['x-auth-token']).toBe('***');
    });

    it('should preserve non-sensitive nested structures', () => {
      const input = {
        data: {
          users: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ],
          metadata: {
            count: 2,
            timestamp: '2024-01-01'
          }
        }
      };

      const output = SensitiveDataFilter.sanitizeObject(input);
      expect(output).toEqual(input);
    });
  });

  // ============================================================================
  // sanitizeUrl Tests
  // ============================================================================

  describe('sanitizeUrl', () => {
    it('should redact sensitive query parameters', () => {
      const input = 'https://api.example.com/endpoint?api_key=secret123&user=test';
      const output = SensitiveDataFilter.sanitizeUrl(input);
      expect(output).toContain('api_key=***');
      expect(output).not.toContain('secret123');
      expect(output).toContain('user=test');
    });

    it('should handle multiple sensitive parameters', () => {
      const input = 'https://api.example.com/data?token=abc&access_token=xyz&page=1';
      const output = SensitiveDataFilter.sanitizeUrl(input);
      expect(output).toContain('token=***');
      expect(output).toContain('access_token=***');
      expect(output).toContain('page=1');
    });

    it('should handle URL objects', () => {
      const urlObj = new URL('https://api.example.com/endpoint?apikey=secret');
      const output = SensitiveDataFilter.sanitizeUrl(urlObj);
      expect(output).toContain('apikey=***');
      expect(output).not.toContain('secret');
    });

    it('should return URLs without sensitive params unchanged', () => {
      const input = 'https://api.example.com/endpoint?page=1&limit=10';
      const output = SensitiveDataFilter.sanitizeUrl(input);
      expect(output).toBe(input);
    });

    it('should handle invalid URLs gracefully', () => {
      const input = 'not a valid url with api_key=secret';
      const output = SensitiveDataFilter.sanitizeUrl(input);
      // Should fall back to string sanitization
      expect(output).toBeDefined();
    });

    it('should handle null/undefined URLs', () => {
      expect(SensitiveDataFilter.sanitizeUrl(null)).toBe(null);
      expect(SensitiveDataFilter.sanitizeUrl(undefined)).toBe(undefined);
    });
  });

  // ============================================================================
  // sanitizeHeaders Tests
  // ============================================================================

  describe('sanitizeHeaders', () => {
    it('should redact authorization headers', () => {
      const input = {
        'Authorization': 'Bearer secret_token',
        'Content-Type': 'application/json'
      };

      const output = SensitiveDataFilter.sanitizeHeaders(input);
      expect(output['Authorization']).toBe('Bearer ***');
      expect(output['Content-Type']).toBe('application/json');
    });

    it('should preserve Bearer prefix for bearer tokens', () => {
      const input = {
        authorization: 'Bearer xyz123456789'
      };

      const output = SensitiveDataFilter.sanitizeHeaders(input);
      expect(output.authorization).toBe('Bearer ***');
      expect(output.authorization).toContain('Bearer');
    });

    it('should redact various sensitive header names', () => {
      const input = {
        'x-api-key': 'secret1',
        'X-API-Token': 'secret2',
        'x-auth-token': 'secret3',
        'api-key': 'secret4',
        'apikey': 'secret5'
      };

      const output = SensitiveDataFilter.sanitizeHeaders(input);
      expect(output['x-api-key']).toBe('***');
      expect(output['X-API-Token']).toBe('***');
      expect(output['x-auth-token']).toBe('***');
      expect(output['api-key']).toBe('***');
      expect(output['apikey']).toBe('***');
    });

    it('should handle non-Bearer authorization values', () => {
      const input = {
        authorization: 'Basic dXNlcjpwYXNz'
      };

      const output = SensitiveDataFilter.sanitizeHeaders(input);
      expect(output.authorization).toBe('***');
    });

    it('should handle null/undefined headers', () => {
      expect(SensitiveDataFilter.sanitizeHeaders(null)).toBe(null);
      expect(SensitiveDataFilter.sanitizeHeaders(undefined)).toBe(undefined);
    });

    it('should handle non-object headers', () => {
      expect(SensitiveDataFilter.sanitizeHeaders('not an object')).toBe('not an object');
    });

    it('should preserve non-sensitive headers', () => {
      const input = {
        'User-Agent': 'VoxChronicle/1.0',
        'Accept': 'application/json',
        'Content-Type': 'text/plain'
      };

      const output = SensitiveDataFilter.sanitizeHeaders(input);
      expect(output).toEqual(input);
    });
  });

  // ============================================================================
  // sanitizeError Tests
  // ============================================================================

  describe('sanitizeError', () => {
    it('should sanitize Error instances', () => {
      const error = new Error('API call failed with key sk-1234567890abcdef');
      const output = SensitiveDataFilter.sanitizeError(error);

      expect(output.name).toBe('Error');
      expect(output.message).not.toContain('sk-1234567890abcdef');
      expect(output.message).toContain('***');
      expect(output.stack).toBeDefined();
    });

    it('should sanitize custom error properties', () => {
      const error = new Error('Request failed');
      error.config = {
        apiKey: 'secret_key',
        url: 'https://api.example.com'
      };
      error.response = {
        headers: {
          authorization: 'Bearer token'
        }
      };

      const output = SensitiveDataFilter.sanitizeError(error);
      expect(output.name).toBe('Error');
      expect(output.message).toBe('Request failed');
      expect(output.config.apiKey).toBe('***');
      expect(output.config.url).toBe('https://api.example.com');
      expect(output.response.headers.authorization).toBe('***');
    });

    it('should sanitize stack traces containing sensitive data', () => {
      const error = new Error('Test');
      error.stack = 'Error: Test\n    at fetch(api_key=sk-secret123456789)';

      const output = SensitiveDataFilter.sanitizeError(error);
      expect(output.stack).not.toContain('sk-secret123456789');
    });

    it('should sanitize plain object errors', () => {
      const error = {
        status: 401,
        message: 'Unauthorized: Invalid api_key sk-test1234567890',
        headers: {
          authorization: 'Bearer token'
        }
      };

      const output = SensitiveDataFilter.sanitizeError(error);
      expect(output.status).toBe(401);
      expect(output.message).not.toContain('sk-test1234567890');
      expect(output.headers.authorization).toBe('***');
    });

    it('should handle null/undefined errors', () => {
      expect(SensitiveDataFilter.sanitizeError(null)).toBe(null);
      expect(SensitiveDataFilter.sanitizeError(undefined)).toBe(undefined);
    });

    it('should handle errors without stack traces', () => {
      const error = new Error('Test error');
      delete error.stack;

      const output = SensitiveDataFilter.sanitizeError(error);
      expect(output.name).toBe('Error');
      expect(output.message).toBe('Test error');
      expect(output.stack).toBeUndefined();
    });
  });

  // ============================================================================
  // sanitizeArgs Tests
  // ============================================================================

  describe('sanitizeArgs', () => {
    it('should sanitize multiple arguments of different types', () => {
      const args = [
        'Log message with sk-1234567890abcdef',
        { apiKey: 'secret' },
        new Error('Error with Bearer token123456789012345678'),
        42,
        null
      ];

      const output = SensitiveDataFilter.sanitizeArgs(...args);

      expect(output[0]).not.toContain('sk-1234567890abcdef');
      expect(output[1].apiKey).toBe('***');
      expect(output[2].message).not.toContain('token123456789012345678');
      expect(output[3]).toBe(42);
      expect(output[4]).toBe(null);
    });

    it('should handle empty arguments', () => {
      const output = SensitiveDataFilter.sanitizeArgs();
      expect(output).toEqual([]);
    });

    it('should handle mixed safe and sensitive arguments', () => {
      const output = SensitiveDataFilter.sanitizeArgs(
        'Safe message',
        'Unsafe: api_key=secret123456789012345',
        { safe: 'value' }
      );

      expect(output[0]).toBe('Safe message');
      expect(output[1]).toContain('***');
      expect(output[2]).toEqual({ safe: 'value' });
    });
  });

  // ============================================================================
  // containsSensitiveData Tests
  // ============================================================================

  describe('containsSensitiveData', () => {
    it('should detect OpenAI API keys', () => {
      expect(SensitiveDataFilter.containsSensitiveData('Key: sk-1234567890abcdef')).toBe(true);
      expect(SensitiveDataFilter.containsSensitiveData('Key: sk-proj-xyz123456789')).toBe(true);
    });

    it('should detect Bearer tokens', () => {
      expect(SensitiveDataFilter.containsSensitiveData('Authorization: Bearer token123')).toBe(true);
    });

    it('should detect API keys in various formats', () => {
      expect(SensitiveDataFilter.containsSensitiveData('api_key: secret123456789012345678')).toBe(true);
      expect(SensitiveDataFilter.containsSensitiveData('api-key=xyz123456789012345678901')).toBe(true);
    });

    it('should return false for safe strings', () => {
      expect(SensitiveDataFilter.containsSensitiveData('This is a safe log message')).toBe(false);
      expect(SensitiveDataFilter.containsSensitiveData('User logged in successfully')).toBe(false);
    });

    it('should return false for non-string inputs', () => {
      expect(SensitiveDataFilter.containsSensitiveData(123)).toBe(false);
      expect(SensitiveDataFilter.containsSensitiveData(null)).toBe(false);
      expect(SensitiveDataFilter.containsSensitiveData(undefined)).toBe(false);
      expect(SensitiveDataFilter.containsSensitiveData({})).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(SensitiveDataFilter.containsSensitiveData('')).toBe(false);
    });
  });

  // ============================================================================
  // Exported Function Tests
  // ============================================================================

  describe('Exported convenience functions', () => {
    it('should export sanitizeString function', () => {
      expect(typeof sanitizeString).toBe('function');
      const result = sanitizeString('api_key: sk-test1234567890');
      expect(result).toContain('***');
    });

    it('should export sanitizeObject function', () => {
      expect(typeof sanitizeObject).toBe('function');
      const result = sanitizeObject({ apiKey: 'secret' });
      expect(result.apiKey).toBe('***');
    });

    it('should export sanitizeUrl function', () => {
      expect(typeof sanitizeUrl).toBe('function');
      const result = sanitizeUrl('https://api.com?token=secret');
      expect(result).toContain('token=***');
    });

    it('should export sanitizeHeaders function', () => {
      expect(typeof sanitizeHeaders).toBe('function');
      const result = sanitizeHeaders({ authorization: 'Bearer token' });
      expect(result.authorization).toBe('Bearer ***');
    });

    it('should export sanitizeError function', () => {
      expect(typeof sanitizeError).toBe('function');
      const error = new Error('api_key: sk-test1234567890');
      const result = sanitizeError(error);
      expect(result.message).toContain('***');
    });

    it('should export sanitizeArgs function', () => {
      expect(typeof sanitizeArgs).toBe('function');
      const result = sanitizeArgs('test', { apiKey: 'secret' });
      expect(result).toHaveLength(2);
      expect(result[1].apiKey).toBe('***');
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('Integration scenarios', () => {
    it('should sanitize a complete API request log', () => {
      const logData = {
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions?api_key=sk-test123456789',
        headers: {
          'Authorization': 'Bearer sk-proj-secret987654321',
          'Content-Type': 'application/json'
        },
        body: {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        }
      };

      const sanitized = SensitiveDataFilter.sanitizeObject(logData);

      expect(sanitized.url).toContain('api_key=***');
      expect(sanitized.headers['Authorization']).toBe('***');
      expect(sanitized.headers['Content-Type']).toBe('application/json');
      expect(sanitized.body.model).toBe('gpt-4');
    });

    it('should sanitize a complete error response', () => {
      const error = new Error('API request failed');
      error.config = {
        url: 'https://api.kanka.io/campaigns',
        headers: {
          'Authorization': 'Bearer kanka_token_xyz',
          'Accept': 'application/json'
        }
      };
      error.response = {
        status: 401,
        data: {
          error: 'Invalid token: Bearer kanka_token_xyz'
        }
      };

      const sanitized = SensitiveDataFilter.sanitizeError(error);

      expect(sanitized.config.headers['Authorization']).toBe('***');
      expect(sanitized.config.headers['Accept']).toBe('application/json');
      expect(sanitized.response.data.error).not.toContain('kanka_token_xyz');
    });

    it('should handle complex nested structures', () => {
      const complexObject = {
        session: {
          id: '123',
          user: {
            name: 'TestUser',
            credentials: {
              apiKey: 'sk-complex123456789',
              refreshToken: 'refresh_token_long_enough_string'
            }
          },
          logs: [
            'Action completed',
            'Error: unauthorized api_key=sk-log123456789'
          ]
        }
      };

      const sanitized = SensitiveDataFilter.sanitizeObject(complexObject);

      expect(sanitized.session.id).toBe('123');
      expect(sanitized.session.user.name).toBe('TestUser');
      expect(sanitized.session.user.credentials.apiKey).toBe('***');
      expect(sanitized.session.user.credentials.refreshToken).toBe('***');
      expect(sanitized.session.logs[0]).toBe('Action completed');
      expect(sanitized.session.logs[1]).not.toContain('sk-log123456789');
    });
  });
});
