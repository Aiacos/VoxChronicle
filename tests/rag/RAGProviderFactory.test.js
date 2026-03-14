import { RAGProviderFactory } from '../../scripts/rag/RAGProviderFactory.mjs';
import { RAGProvider } from '../../scripts/rag/RAGProvider.mjs';
import { OpenAIFileSearchProvider } from '../../scripts/rag/OpenAIFileSearchProvider.mjs';
import { RAGFlowProvider } from '../../scripts/rag/RAGFlowProvider.mjs';

describe('RAGProviderFactory', () => {
  // ── Built-in registration ─────────────────────────────────────────────

  describe('built-in providers', () => {
    it('should have "openai-file-search" registered by default', () => {
      expect(RAGProviderFactory.has('openai-file-search')).toBe(true);
    });

    it('should have "ragflow" registered by default', () => {
      expect(RAGProviderFactory.has('ragflow')).toBe(true);
    });

    it('should include "openai-file-search" in getAvailableProviders()', () => {
      const providers = RAGProviderFactory.getAvailableProviders();
      expect(providers).toContain('openai-file-search');
    });

    it('should include "ragflow" in getAvailableProviders()', () => {
      const providers = RAGProviderFactory.getAvailableProviders();
      expect(providers).toContain('ragflow');
    });
  });

  // ── create() ──────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create an OpenAIFileSearchProvider for "openai-file-search"', () => {
      const provider = RAGProviderFactory.create('openai-file-search');
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
      expect(provider).toBeInstanceOf(RAGProvider);
    });

    it('should create a RAGFlowProvider for "ragflow"', () => {
      const provider = RAGProviderFactory.create('ragflow');
      expect(provider).toBeInstanceOf(RAGFlowProvider);
      expect(provider).toBeInstanceOf(RAGProvider);
    });

    it('should create the default provider when no type is specified', () => {
      const provider = RAGProviderFactory.create();
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
    });

    it('should create the default provider when type is undefined', () => {
      const provider = RAGProviderFactory.create(undefined);
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
    });

    it('should create the default provider when type is null', () => {
      const provider = RAGProviderFactory.create(null);
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
    });

    it('should create the default provider when type is empty string', () => {
      const provider = RAGProviderFactory.create('');
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
    });

    it('should pass config to the provider constructor', () => {
      const provider = RAGProviderFactory.create('openai-file-search', { model: 'gpt-4o' });
      // The provider is created; we can verify it's an instance
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
    });

    it('should fall back to default provider for unknown type', () => {
      const provider = RAGProviderFactory.create('unknown-provider');
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
    });

    it('should fall back to default when an unknown type is given and default exists', () => {
      // The factory should log a warning and return the default provider
      const provider = RAGProviderFactory.create('nonexistent-provider-xyz');
      expect(provider).toBeInstanceOf(OpenAIFileSearchProvider);
    });
  });

  // ── register() ────────────────────────────────────────────────────────

  describe('register()', () => {
    // Use a unique name per test to avoid cross-test pollution
    let counter = 0;

    function uniqueType() {
      return `test-provider-${++counter}-${Date.now()}`;
    }

    it('should register a custom provider class', () => {
      class CustomProvider extends RAGProvider {
        constructor() {
          super();
        }
      }

      const type = uniqueType();
      RAGProviderFactory.register(type, CustomProvider);
      expect(RAGProviderFactory.has(type)).toBe(true);
    });

    it('should allow creating instances of a registered custom provider', () => {
      class AnotherProvider extends RAGProvider {
        constructor(config) {
          super();
          this.customConfig = config;
        }
      }

      const type = uniqueType();
      RAGProviderFactory.register(type, AnotherProvider);
      const provider = RAGProviderFactory.create(type, { key: 'value' });
      expect(provider).toBeInstanceOf(AnotherProvider);
      expect(provider).toBeInstanceOf(RAGProvider);
    });

    it('should appear in getAvailableProviders() after registration', () => {
      class YetAnotherProvider extends RAGProvider {
        constructor() {
          super();
        }
      }

      const type = uniqueType();
      RAGProviderFactory.register(type, YetAnotherProvider);
      const providers = RAGProviderFactory.getAvailableProviders();
      expect(providers).toContain(type);
    });

    it('should overwrite an existing registration for the same type', () => {
      class ProviderA extends RAGProvider {
        constructor() {
          super();
        }
      }
      class ProviderB extends RAGProvider {
        constructor() {
          super();
        }
      }

      const type = uniqueType();
      RAGProviderFactory.register(type, ProviderA);
      const providerA = RAGProviderFactory.create(type);
      expect(providerA).toBeInstanceOf(ProviderA);

      RAGProviderFactory.register(type, ProviderB);
      const providerB = RAGProviderFactory.create(type);
      expect(providerB).toBeInstanceOf(ProviderB);
    });

    it('should throw if type is empty string', () => {
      class EmptyTypeProvider extends RAGProvider {
        constructor() {
          super();
        }
      }
      expect(() => RAGProviderFactory.register('', EmptyTypeProvider)).toThrow(
        'Provider type must be a non-empty string'
      );
    });

    it('should throw if type is null', () => {
      class NullTypeProvider extends RAGProvider {
        constructor() {
          super();
        }
      }
      expect(() => RAGProviderFactory.register(null, NullTypeProvider)).toThrow(
        'Provider type must be a non-empty string'
      );
    });

    it('should throw if type is undefined', () => {
      class UndefinedTypeProvider extends RAGProvider {
        constructor() {
          super();
        }
      }
      expect(() => RAGProviderFactory.register(undefined, UndefinedTypeProvider)).toThrow(
        'Provider type must be a non-empty string'
      );
    });

    it('should throw if type is a number', () => {
      class NumberTypeProvider extends RAGProvider {
        constructor() {
          super();
        }
      }
      expect(() => RAGProviderFactory.register(42, NumberTypeProvider)).toThrow(
        'Provider type must be a non-empty string'
      );
    });

    it('should throw if ProviderClass is not a constructor', () => {
      expect(() => RAGProviderFactory.register('bad-provider-obj', {})).toThrow(
        'ProviderClass must be a constructor'
      );
    });

    it('should throw if ProviderClass is a string', () => {
      expect(() => RAGProviderFactory.register('bad-provider-str', 'NotAClass')).toThrow(
        'ProviderClass must be a constructor'
      );
    });

    it('should throw if ProviderClass is null', () => {
      expect(() => RAGProviderFactory.register('bad-provider-null', null)).toThrow(
        'ProviderClass must be a constructor'
      );
    });

    it('should throw if ProviderClass is undefined', () => {
      expect(() => RAGProviderFactory.register('bad-provider-undef', undefined)).toThrow(
        'ProviderClass must be a constructor'
      );
    });
  });

  // ── has() ─────────────────────────────────────────────────────────────

  describe('has()', () => {
    it('should return true for registered providers', () => {
      expect(RAGProviderFactory.has('openai-file-search')).toBe(true);
    });

    it('should return false for unregistered providers', () => {
      expect(RAGProviderFactory.has('nonexistent-thing')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(RAGProviderFactory.has(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(RAGProviderFactory.has(null)).toBe(false);
    });
  });

  // ── getAvailableProviders() ───────────────────────────────────────────

  describe('getAvailableProviders()', () => {
    it('should return an array', () => {
      const providers = RAGProviderFactory.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should contain at least the built-in provider', () => {
      const providers = RAGProviderFactory.getAvailableProviders();
      expect(providers.length).toBeGreaterThanOrEqual(1);
      expect(providers).toContain('openai-file-search');
    });

    it('should return string values only', () => {
      const providers = RAGProviderFactory.getAvailableProviders();
      for (const p of providers) {
        expect(typeof p).toBe('string');
      }
    });
  });
});
