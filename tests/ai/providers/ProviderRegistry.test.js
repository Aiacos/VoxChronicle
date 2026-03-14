import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProviderRegistry } from '../../../scripts/ai/providers/ProviderRegistry.mjs';
import { ChatProvider } from '../../../scripts/ai/providers/ChatProvider.mjs';
import { TranscriptionProvider } from '../../../scripts/ai/providers/TranscriptionProvider.mjs';
import { ImageProvider } from '../../../scripts/ai/providers/ImageProvider.mjs';
import { EmbeddingProvider } from '../../../scripts/ai/providers/EmbeddingProvider.mjs';

// Mock EventBus
vi.mock('../../../scripts/core/EventBus.mjs', () => ({
  eventBus: {
    emit: vi.fn()
  }
}));

import { eventBus } from '../../../scripts/core/EventBus.mjs';

globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`)
  }
};

// Concrete test providers
class MockChatProvider extends ChatProvider {
  async chat(messages, options = {}) {
    return { content: 'mock', usage: {} };
  }
  async *chatStream(messages, options = {}) {
    yield { token: 'mock', done: true };
  }
}

class MockTranscriptionProvider extends TranscriptionProvider {
  async transcribe(audioBlob, options = {}) {
    return { text: 'mock', segments: [] };
  }
}

class MockImageProvider extends ImageProvider {
  async generateImage(prompt, options = {}) {
    return { data: 'base64', format: 'png' };
  }
}

class MockEmbeddingProvider extends EmbeddingProvider {
  async embed(text, options = {}) {
    return { embedding: [0.1], dimensions: 1 };
  }
}

// Multi-capability provider (chat + transcription)
class MockMultiProvider extends ChatProvider {
  static get capabilities() {
    return ['chat', 'chatStream', 'transcribe'];
  }
  async chat(messages, options = {}) {
    return { content: 'multi', usage: {} };
  }
  async *chatStream(messages, options = {}) {
    yield { token: 'multi', done: true };
  }
  async transcribe(audioBlob, options = {}) {
    return { text: 'multi', segments: [] };
  }
}

describe('ProviderRegistry', () => {
  beforeEach(() => {
    ProviderRegistry.resetInstance();
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const a = ProviderRegistry.getInstance();
      const b = ProviderRegistry.getInstance();
      expect(a).toBe(b);
    });

    it('should return a new instance after reset', () => {
      const a = ProviderRegistry.getInstance();
      ProviderRegistry.resetInstance();
      const b = ProviderRegistry.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('register()', () => {
    it('should register a provider by name', () => {
      const registry = ProviderRegistry.getInstance();
      const provider = new MockChatProvider();
      registry.register('openai', provider);
      expect(registry.getProviderByName('openai')).toBe(provider);
    });

    it('should emit ai:providerRegistered event', () => {
      const registry = ProviderRegistry.getInstance();
      const provider = new MockChatProvider();
      registry.register('openai', provider);
      expect(eventBus.emit).toHaveBeenCalledWith('ai:providerRegistered', {
        providerName: 'openai',
        capabilities: ['chat', 'chatStream']
      });
    });

    it('should set default provider when option is true', () => {
      const registry = ProviderRegistry.getInstance();
      const provider = new MockChatProvider();
      registry.register('openai', provider, { default: true });
      expect(registry.getProvider('chat')).toBe(provider);
      expect(registry.getProvider('chatStream')).toBe(provider);
    });

    it('should warn and overwrite if provider name already registered', () => {
      const registry = ProviderRegistry.getInstance();
      const provider1 = new MockChatProvider();
      const provider2 = new MockChatProvider();
      registry.register('openai', provider1);
      registry.register('openai', provider2);
      expect(registry.getProviderByName('openai')).toBe(provider2);
    });

    it('should throw TypeError when registering null as providerInstance', () => {
      const registry = ProviderRegistry.getInstance();
      expect(() => registry.register('bad', null)).toThrow(TypeError);
    });

    it('should throw TypeError when registering a primitive as providerInstance', () => {
      const registry = ProviderRegistry.getInstance();
      expect(() => registry.register('bad', 42)).toThrow(TypeError);
    });

    it('should auto-set default for capability if first provider for that capability', () => {
      const registry = ProviderRegistry.getInstance();
      const provider = new MockChatProvider();
      registry.register('openai', provider);
      // First provider for a capability becomes the default automatically
      expect(registry.getProvider('chat')).toBe(provider);
    });
  });

  describe('getProvider()', () => {
    it('should return default provider for capability', () => {
      const registry = ProviderRegistry.getInstance();
      const chatProvider = new MockChatProvider();
      registry.register('openai', chatProvider, { default: true });
      expect(registry.getProvider('chat')).toBe(chatProvider);
    });

    it('should throw i18n error if no provider for capability', () => {
      const registry = ProviderRegistry.getInstance();
      expect(() => registry.getProvider('chat')).toThrow();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Provider.Error.NoProvider',
        expect.objectContaining({ capability: 'chat' })
      );
    });
  });

  describe('getProviderByName()', () => {
    it('should return provider by name', () => {
      const registry = ProviderRegistry.getInstance();
      const provider = new MockChatProvider();
      registry.register('openai', provider);
      expect(registry.getProviderByName('openai')).toBe(provider);
    });

    it('should throw i18n error if provider not found', () => {
      const registry = ProviderRegistry.getInstance();
      expect(() => registry.getProviderByName('nonexistent')).toThrow();
      expect(game.i18n.format).toHaveBeenCalledWith(
        'VOXCHRONICLE.Provider.Error.NotFound',
        expect.objectContaining({ name: 'nonexistent' })
      );
    });
  });

  describe('listProviders()', () => {
    it('should return empty map when no providers', () => {
      const registry = ProviderRegistry.getInstance();
      expect(registry.listProviders()).toEqual({});
    });

    it('should return name→capabilities map', () => {
      const registry = ProviderRegistry.getInstance();
      registry.register('openai', new MockChatProvider());
      registry.register('whisper', new MockTranscriptionProvider());
      const list = registry.listProviders();
      expect(list).toEqual({
        openai: ['chat', 'chatStream'],
        whisper: ['transcribe']
      });
    });
  });

  describe('setDefault()', () => {
    it('should change default provider for a capability', () => {
      const registry = ProviderRegistry.getInstance();
      const provider1 = new MockChatProvider();
      const provider2 = new MockChatProvider();
      registry.register('openai', provider1, { default: true });
      registry.register('anthropic', provider2);
      registry.setDefault('anthropic', 'chat');
      expect(registry.getProvider('chat')).toBe(provider2);
    });

    it('should emit ai:defaultChanged event', () => {
      const registry = ProviderRegistry.getInstance();
      const provider1 = new MockChatProvider();
      const provider2 = new MockChatProvider();
      registry.register('openai', provider1, { default: true });
      registry.register('anthropic', provider2);
      vi.clearAllMocks();
      registry.setDefault('anthropic', 'chat');
      expect(eventBus.emit).toHaveBeenCalledWith('ai:defaultChanged', {
        providerName: 'anthropic',
        capability: 'chat'
      });
    });

    it('should throw if provider not found', () => {
      const registry = ProviderRegistry.getInstance();
      expect(() => registry.setDefault('nonexistent', 'chat')).toThrow();
    });

    it('should throw if provider does not support capability', () => {
      const registry = ProviderRegistry.getInstance();
      registry.register('openai', new MockChatProvider());
      expect(() => registry.setDefault('openai', 'transcribe')).toThrow();
    });
  });

  describe('unregister()', () => {
    it('should remove a provider', () => {
      const registry = ProviderRegistry.getInstance();
      registry.register('openai', new MockChatProvider());
      registry.unregister('openai');
      expect(() => registry.getProviderByName('openai')).toThrow();
    });

    it('should emit ai:providerUnregistered event', () => {
      const registry = ProviderRegistry.getInstance();
      registry.register('openai', new MockChatProvider());
      vi.clearAllMocks();
      registry.unregister('openai');
      expect(eventBus.emit).toHaveBeenCalledWith('ai:providerUnregistered', {
        providerName: 'openai',
        capabilities: ['chat', 'chatStream']
      });
    });

    it('should clear defaults for removed provider capabilities', () => {
      const registry = ProviderRegistry.getInstance();
      registry.register('openai', new MockChatProvider(), { default: true });
      registry.unregister('openai');
      expect(() => registry.getProvider('chat')).toThrow();
    });

    it('should promote another provider to default when removing the default', () => {
      const registry = ProviderRegistry.getInstance();
      const provider1 = new MockChatProvider();
      const provider2 = new MockChatProvider();
      registry.register('openai', provider1, { default: true });
      registry.register('anthropic', provider2);
      registry.unregister('openai');
      // anthropic should become the default for chat
      expect(registry.getProvider('chat')).toBe(provider2);
    });

    it('should throw if provider not found', () => {
      const registry = ProviderRegistry.getInstance();
      expect(() => registry.unregister('nonexistent')).toThrow();
    });
  });

  describe('multi-capability providers', () => {
    it('should register provider for multiple capabilities', () => {
      const registry = ProviderRegistry.getInstance();
      const multi = new MockMultiProvider();
      registry.register('multi', multi, { default: true });
      expect(registry.getProvider('chat')).toBe(multi);
      expect(registry.getProvider('transcribe')).toBe(multi);
    });

    it('should list all capabilities for multi-provider', () => {
      const registry = ProviderRegistry.getInstance();
      registry.register('multi', new MockMultiProvider());
      expect(registry.listProviders().multi).toEqual(['chat', 'chatStream', 'transcribe']);
    });
  });

  describe('mixed provider types', () => {
    it('should handle different provider types independently', () => {
      const registry = ProviderRegistry.getInstance();
      const chatProvider = new MockChatProvider();
      const imageProvider = new MockImageProvider();
      const embeddingProvider = new MockEmbeddingProvider();
      registry.register('openai-chat', chatProvider, { default: true });
      registry.register('openai-image', imageProvider, { default: true });
      registry.register('openai-embed', embeddingProvider, { default: true });
      expect(registry.getProvider('chat')).toBe(chatProvider);
      expect(registry.getProvider('generateImage')).toBe(imageProvider);
      expect(registry.getProvider('embed')).toBe(embeddingProvider);
    });
  });
});
