import { describe, it, expect } from 'vitest';
import { SensitiveDataFilter } from '../../scripts/utils/SensitiveDataFilter.mjs';

describe('SensitiveDataFilter', () => {
  // ── sanitizeString ─────────────────────────────────────────────────────

  describe('sanitizeString()', () => {
    it('should redact OpenAI API keys (sk-...)', () => {
      const input = 'Key: sk-abcdefghij1234567890';
      const result = SensitiveDataFilter.sanitizeString(input);
      expect(result).not.toContain('sk-abcdefghij1234567890');
      expect(result).toContain('***');
    });

    it('should redact OpenAI project keys (sk-proj-...)', () => {
      const input = 'Using sk-proj-abcdefghijk1234567890 for auth';
      const result = SensitiveDataFilter.sanitizeString(input);
      expect(result).not.toContain('sk-proj-abcdefghijk1234567890');
      expect(result).toContain('***');
    });

    it('should redact Bearer tokens while keeping the Bearer prefix', () => {
      const input = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefgh';
      const result = SensitiveDataFilter.sanitizeString(input);
      expect(result).toContain('Bearer');
      expect(result).toContain('***');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });

    it('should redact generic API keys with label', () => {
      const input = 'api_key: abcdefghij1234567890extra';
      const result = SensitiveDataFilter.sanitizeString(input);
      expect(result).toContain('api_key:');
      expect(result).toContain('***');
    });

    it('should redact authorization header values with label', () => {
      const input = 'authorization: Token abcdefghij1234567890extra';
      const result = SensitiveDataFilter.sanitizeString(input);
      expect(result).toContain('authorization:');
      expect(result).toContain('***');
    });

    it('should return non-string values unchanged', () => {
      expect(SensitiveDataFilter.sanitizeString(42)).toBe(42);
      expect(SensitiveDataFilter.sanitizeString(null)).toBeNull();
      expect(SensitiveDataFilter.sanitizeString(undefined)).toBeUndefined();
      expect(SensitiveDataFilter.sanitizeString(true)).toBe(true);
    });

    it('should return normal strings unmodified', () => {
      const input = 'Hello world, nothing sensitive here';
      expect(SensitiveDataFilter.sanitizeString(input)).toBe(input);
    });

    it('should handle empty string', () => {
      expect(SensitiveDataFilter.sanitizeString('')).toBe('');
    });

    it('should handle multiple sensitive patterns in one string', () => {
      const input = 'key sk-abcdefghij1234567890 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const result = SensitiveDataFilter.sanitizeString(input);
      expect(result).not.toContain('sk-abcdefghij1234567890');
      expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    });
  });

  // ── sanitizeObject ─────────────────────────────────────────────────────

  describe('sanitizeObject()', () => {
    it('should return null for null input', () => {
      expect(SensitiveDataFilter.sanitizeObject(null)).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      expect(SensitiveDataFilter.sanitizeObject(undefined)).toBeUndefined();
    });

    it('should sanitize string values passed directly', () => {
      const result = SensitiveDataFilter.sanitizeObject('sk-abcdefghij1234567890');
      expect(result).toContain('***');
    });

    it('should return non-object, non-string primitives unchanged', () => {
      expect(SensitiveDataFilter.sanitizeObject(42)).toBe(42);
      expect(SensitiveDataFilter.sanitizeObject(true)).toBe(true);
    });

    it('should redact sensitive header keys', () => {
      const obj = {
        authorization: 'secret-token-value-that-is-long-enough',
        'Content-Type': 'application/json'
      };
      const result = SensitiveDataFilter.sanitizeObject(obj);
      expect(result.authorization).toBe('***');
      expect(result['Content-Type']).toBe('application/json');
    });

    it('should redact x-api-key header', () => {
      const result = SensitiveDataFilter.sanitizeObject({ 'x-api-key': 'my-secret' });
      expect(result['x-api-key']).toBe('***');
    });

    it('should redact api_key and token params', () => {
      const result = SensitiveDataFilter.sanitizeObject({
        api_key: 'secret123',
        token: 'tok_abc',
        name: 'visible'
      });
      expect(result.api_key).toBe('***');
      expect(result.token).toBe('***');
      expect(result.name).toBe('visible');
    });

    it('should recursively sanitize nested objects', () => {
      const obj = {
        headers: {
          authorization: 'Bearer xyz-long-token-value-here'
        },
        data: { message: 'hello' }
      };
      const result = SensitiveDataFilter.sanitizeObject(obj);
      expect(result.headers.authorization).toBe('***');
      expect(result.data.message).toBe('hello');
    });

    it('should handle arrays by sanitizing each element', () => {
      const arr = [
        { authorization: 'secret' },
        'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.data',
        42
      ];
      const result = SensitiveDataFilter.sanitizeObject(arr);
      expect(Array.isArray(result)).toBe(true);
      expect(result[0].authorization).toBe('***');
      expect(result[1]).toContain('***');
      expect(result[2]).toBe(42);
    });

    it('should sanitize string property values that contain patterns', () => {
      const obj = {
        log: 'Connecting with sk-proj-abcdefghijk1234567890'
      };
      const result = SensitiveDataFilter.sanitizeObject(obj);
      expect(result.log).not.toContain('sk-proj-abcdefghijk1234567890');
    });

    it('should not modify the original object', () => {
      const original = { authorization: 'my-secret' };
      SensitiveDataFilter.sanitizeObject(original);
      expect(original.authorization).toBe('my-secret');
    });

    it('should skip deep recursion when deep=false', () => {
      const obj = {
        nested: { authorization: 'secret-here' }
      };
      const result = SensitiveDataFilter.sanitizeObject(obj, false);
      // When deep=false, nested objects are not recursed into
      expect(result.nested).toEqual({ authorization: 'secret-here' });
    });

    it('should keep non-string, non-object values as-is', () => {
      const obj = { count: 42, active: true, items: null };
      const result = SensitiveDataFilter.sanitizeObject(obj);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
    });

    it('should not recurse array items when deep=false', () => {
      const arr = [
        { authorization: 'secret-long-enough-value-here' },
        'plain text'
      ];
      const result = SensitiveDataFilter.sanitizeObject(arr, false);
      expect(Array.isArray(result)).toBe(true);
      // When deep=false, items are returned as-is without sanitization
      expect(result[0].authorization).toBe('secret-long-enough-value-here');
      expect(result[1]).toBe('plain text');
    });
  });

  // ── sanitizeUrl ────────────────────────────────────────────────────────

  describe('sanitizeUrl()', () => {
    it('should return falsy input unchanged', () => {
      expect(SensitiveDataFilter.sanitizeUrl('')).toBe('');
      expect(SensitiveDataFilter.sanitizeUrl(null)).toBeNull();
      expect(SensitiveDataFilter.sanitizeUrl(undefined)).toBeUndefined();
    });

    it('should redact api_key query parameter', () => {
      const url = 'https://api.example.com/data?api_key=secret123&format=json';
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).not.toContain('secret123');
      expect(result).toContain('api_key=***');
      expect(result).toContain('format=json');
    });

    it('should redact token query parameter', () => {
      const url = 'https://api.example.com?token=abc123';
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).not.toContain('abc123');
      expect(result).toContain('token=***');
    });

    it('should redact access_token query parameter', () => {
      const url = 'https://api.example.com?access_token=xyz';
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).toContain('access_token=***');
    });

    it('should redact auth query parameter', () => {
      const url = 'https://api.example.com?auth=myauth';
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).toContain('auth=***');
    });

    it('should redact key query parameter', () => {
      const url = 'https://api.example.com?key=mykey';
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).toContain('key=***');
    });

    it('should redact apikey query parameter', () => {
      const url = 'https://api.example.com?apikey=myapikey';
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).toContain('apikey=***');
    });

    it('should leave non-sensitive query params untouched', () => {
      const url = 'https://api.example.com?page=1&limit=10';
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).toContain('page=1');
      expect(result).toContain('limit=10');
    });

    it('should handle URL objects', () => {
      const url = new URL('https://api.example.com?token=secret');
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).toContain('token=***');
    });

    it('should fall back to string sanitization for invalid URLs', () => {
      const notUrl = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.data';
      const result = SensitiveDataFilter.sanitizeUrl(notUrl);
      expect(result).toContain('***');
    });

    it('should handle multiple sensitive params', () => {
      const url = 'https://api.example.com?api_key=secret&token=tok';
      const result = SensitiveDataFilter.sanitizeUrl(url);
      expect(result).toContain('api_key=***');
      expect(result).toContain('token=***');
    });
  });

  // ── sanitizeHeaders ────────────────────────────────────────────────────

  describe('sanitizeHeaders()', () => {
    it('should return falsy input unchanged', () => {
      expect(SensitiveDataFilter.sanitizeHeaders(null)).toBeNull();
      expect(SensitiveDataFilter.sanitizeHeaders(undefined)).toBeUndefined();
    });

    it('should return non-object input unchanged', () => {
      expect(SensitiveDataFilter.sanitizeHeaders('string')).toBe('string');
    });

    it('should redact authorization header', () => {
      const headers = { Authorization: 'Token secret123' };
      const result = SensitiveDataFilter.sanitizeHeaders(headers);
      expect(result.Authorization).toBe('***');
    });

    it('should keep Bearer prefix for authorization values', () => {
      const headers = { Authorization: 'Bearer my-secret-token' };
      const result = SensitiveDataFilter.sanitizeHeaders(headers);
      expect(result.Authorization).toBe('Bearer ***');
    });

    it('should redact x-api-key header', () => {
      const headers = { 'X-Api-Key': 'secret' };
      const result = SensitiveDataFilter.sanitizeHeaders(headers);
      expect(result['X-Api-Key']).toBe('***');
    });

    it('should redact x-auth-token header', () => {
      const headers = { 'x-auth-token': 'secret' };
      const result = SensitiveDataFilter.sanitizeHeaders(headers);
      expect(result['x-auth-token']).toBe('***');
    });

    it('should keep non-sensitive headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer secret'
      };
      const result = SensitiveDataFilter.sanitizeHeaders(headers);
      expect(result['Content-Type']).toBe('application/json');
      expect(result.Accept).toBe('application/json');
      expect(result.Authorization).toBe('Bearer ***');
    });

    it('should not modify the original headers object', () => {
      const original = { Authorization: 'Bearer xyz' };
      SensitiveDataFilter.sanitizeHeaders(original);
      expect(original.Authorization).toBe('Bearer xyz');
    });
  });

  // ── sanitizeError ──────────────────────────────────────────────────────

  describe('sanitizeError()', () => {
    it('should return falsy input unchanged', () => {
      expect(SensitiveDataFilter.sanitizeError(null)).toBeNull();
      expect(SensitiveDataFilter.sanitizeError(undefined)).toBeUndefined();
      expect(SensitiveDataFilter.sanitizeError(0)).toBe(0);
    });

    it('should sanitize Error instances', () => {
      const error = new Error('Failed with key sk-abcdefghij1234567890');
      const result = SensitiveDataFilter.sanitizeError(error);
      expect(result.name).toBe('Error');
      expect(result.message).toContain('***');
      expect(result.message).not.toContain('sk-abcdefghij1234567890');
    });

    it('should sanitize Error stack traces', () => {
      const error = new Error('Token Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.data leaked');
      const result = SensitiveDataFilter.sanitizeError(error);
      if (result.stack) {
        expect(result.stack).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      }
    });

    it('should include custom properties from Error', () => {
      const error = new Error('test');
      error.statusCode = 401;
      error.response = { authorization: 'secret' };
      const result = SensitiveDataFilter.sanitizeError(error);
      expect(result.statusCode).toBe(401);
      expect(result.response.authorization).toBe('***');
    });

    it('should handle plain object errors', () => {
      const error = { message: 'fail', authorization: 'secret' };
      const result = SensitiveDataFilter.sanitizeError(error);
      expect(result.authorization).toBe('***');
      expect(result.message).toBe('fail');
    });

    it('should handle Error with no stack', () => {
      const error = new Error('no stack');
      error.stack = undefined;
      const result = SensitiveDataFilter.sanitizeError(error);
      expect(result.stack).toBeUndefined();
    });
  });

  // ── sanitizeArgs ───────────────────────────────────────────────────────

  describe('sanitizeArgs()', () => {
    it('should handle null and undefined arguments', () => {
      const result = SensitiveDataFilter.sanitizeArgs(null, undefined);
      expect(result).toEqual([null, undefined]);
    });

    it('should sanitize string arguments', () => {
      const result = SensitiveDataFilter.sanitizeArgs('sk-abcdefghij1234567890');
      expect(result[0]).toContain('***');
    });

    it('should sanitize Error arguments', () => {
      const error = new Error('key sk-abcdefghij1234567890');
      const result = SensitiveDataFilter.sanitizeArgs(error);
      expect(result[0].message).toContain('***');
    });

    it('should sanitize object arguments', () => {
      const result = SensitiveDataFilter.sanitizeArgs({ authorization: 'secret' });
      expect(result[0].authorization).toBe('***');
    });

    it('should pass through primitive non-string arguments', () => {
      const result = SensitiveDataFilter.sanitizeArgs(42, true, false);
      expect(result).toEqual([42, true, false]);
    });

    it('should handle mixed argument types', () => {
      const result = SensitiveDataFilter.sanitizeArgs(
        'msg',
        42,
        { token: 'secret' },
        null,
        new Error('sk-abcdefghij1234567890')
      );
      expect(result[0]).toBe('msg');
      expect(result[1]).toBe(42);
      expect(result[2].token).toBe('***');
      expect(result[3]).toBeNull();
      expect(result[4].message).toContain('***');
    });
  });

  // ── containsSensitiveData ──────────────────────────────────────────────

  describe('containsSensitiveData()', () => {
    it('should return false for non-string input', () => {
      expect(SensitiveDataFilter.containsSensitiveData(42)).toBe(false);
      expect(SensitiveDataFilter.containsSensitiveData(null)).toBe(false);
      expect(SensitiveDataFilter.containsSensitiveData(undefined)).toBe(false);
    });

    it('should return false for normal strings', () => {
      expect(SensitiveDataFilter.containsSensitiveData('hello world')).toBe(false);
    });

    it('should detect OpenAI API keys', () => {
      expect(SensitiveDataFilter.containsSensitiveData('sk-abcdefghij1234567890')).toBe(true);
    });

    it('should detect Bearer tokens', () => {
      expect(
        SensitiveDataFilter.containsSensitiveData('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.data')
      ).toBe(true);
    });

    it('should detect authorization patterns', () => {
      expect(
        SensitiveDataFilter.containsSensitiveData('authorization: Token abcdefghij1234567890extra')
      ).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(SensitiveDataFilter.containsSensitiveData('')).toBe(false);
    });

    it('should work correctly when called multiple times (regex lastIndex reset)', () => {
      const str = 'sk-abcdefghij1234567890';
      expect(SensitiveDataFilter.containsSensitiveData(str)).toBe(true);
      expect(SensitiveDataFilter.containsSensitiveData(str)).toBe(true);
      expect(SensitiveDataFilter.containsSensitiveData(str)).toBe(true);
    });
  });
});
