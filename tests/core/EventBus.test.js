import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../../scripts/core/EventBus.mjs';

// Mock Logger
vi.mock('../../scripts/utils/Logger.mjs', () => {
  const childLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  return {
    Logger: {
      createChild: vi.fn(() => childLogger),
      isDebugMode: vi.fn(() => false),
      _childInstance: childLogger
    }
  };
});

// Mock game global
globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key)
  }
};

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
    vi.clearAllMocks();
  });

  describe('on', () => {
    it('should register a subscriber and receive events', () => {
      const callback = vi.fn();
      bus.on('ai:suggestionReady', callback);

      bus.emit('ai:suggestionReady', { type: 'narration' });

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith({ type: 'narration' });
    });

    it('should return an unsubscribe function', () => {
      const callback = vi.fn();
      const unsub = bus.on('ai:suggestionReady', callback);

      expect(typeof unsub).toBe('function');

      unsub();
      bus.emit('ai:suggestionReady', { data: 1 });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should allow multiple subscribers on the same event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      bus.on('ai:suggestionReady', cb1);
      bus.on('ai:suggestionReady', cb2);

      bus.emit('ai:suggestionReady', { data: 1 });

      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();
    });
  });

  describe('off', () => {
    it('should remove a specific subscriber', () => {
      const callback = vi.fn();
      bus.on('ai:suggestionReady', callback);
      bus.off('ai:suggestionReady', callback);

      bus.emit('ai:suggestionReady', { data: 1 });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should not throw when removing non-existent subscriber', () => {
      expect(() => bus.off('ai:suggestionReady', () => {})).not.toThrow();
    });
  });

  describe('emit', () => {
    it('should dispatch to all subscribers of the event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      bus.on('session:started', cb1);
      bus.on('session:started', cb2);

      bus.emit('session:started', { timestamp: 123 });

      expect(cb1).toHaveBeenCalledWith({ timestamp: 123 });
      expect(cb2).toHaveBeenCalledWith({ timestamp: 123 });
    });

    it('should not throw when emitting with no subscribers', () => {
      expect(() => bus.emit('ai:suggestionReady', { data: 1 })).not.toThrow();
    });

    it('should isolate channels — ai: event does not notify scene: subscriber', () => {
      const aiCallback = vi.fn();
      const sceneCallback = vi.fn();
      bus.on('ai:suggestionReady', aiCallback);
      bus.on('scene:changed', sceneCallback);

      bus.emit('ai:suggestionReady', { type: 'narration' });

      expect(aiCallback).toHaveBeenCalledOnce();
      expect(sceneCallback).not.toHaveBeenCalled();
    });

    it('should isolate events within the same channel', () => {
      const readyCb = vi.fn();
      const errorCb = vi.fn();
      bus.on('ai:suggestionReady', readyCb);
      bus.on('ai:streamError', errorCb);

      bus.emit('ai:suggestionReady', { type: 'narration' });

      expect(readyCb).toHaveBeenCalledOnce();
      expect(errorCb).not.toHaveBeenCalled();
    });

    it('should throw Error for unknown channel', () => {
      expect(() => bus.emit('unknown:event', { data: 1 })).toThrow(Error);
    });

    it('should throw TypeError for non-object payload', () => {
      expect(() => bus.emit('ai:suggestionReady', 'string')).toThrow(TypeError);
      expect(() => bus.emit('ai:suggestionReady', 42)).toThrow(TypeError);
      expect(() => bus.emit('ai:suggestionReady', null)).toThrow(TypeError);
      expect(() => bus.emit('ai:suggestionReady', undefined)).toThrow(TypeError);
      expect(() => bus.emit('ai:suggestionReady', [1, 2])).toThrow(TypeError);
      expect(() => bus.emit('ai:suggestionReady', true)).toThrow(TypeError);
    });

    it('should accept valid object payload', () => {
      const cb = vi.fn();
      bus.on('ai:suggestionReady', cb);
      expect(() => bus.emit('ai:suggestionReady', { data: 1 })).not.toThrow();
      expect(() => bus.emit('ai:suggestionReady', {})).not.toThrow();
    });

    it('should not block other subscribers when one throws', () => {
      const cb1 = vi.fn(() => {
        throw new Error('boom');
      });
      const cb2 = vi.fn();
      const cb3 = vi.fn();
      bus.on('ai:suggestionReady', cb1);
      bus.on('ai:suggestionReady', cb2);
      bus.on('ai:suggestionReady', cb3);

      bus.emit('ai:suggestionReady', { data: 1 });

      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();
      expect(cb3).toHaveBeenCalledOnce();
    });
  });

  describe('once', () => {
    it('should call the callback only once', () => {
      const callback = vi.fn();
      bus.once('ai:suggestionReady', callback);

      bus.emit('ai:suggestionReady', { data: 1 });
      bus.emit('ai:suggestionReady', { data: 2 });

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith({ data: 1 });
    });

    it('should call once() callback exactly once even when event emitted from within a subscriber', () => {
      const onceCb = vi.fn();
      bus.once('ai:suggestionReady', onceCb);

      // Another subscriber that re-emits the same event
      bus.on('ai:suggestionReady', () => {
        bus.emit('ai:suggestionReady', { nested: true });
      });

      bus.emit('ai:suggestionReady', { initial: true });

      // The once callback should only fire once (for the initial emit)
      expect(onceCb).toHaveBeenCalledOnce();
    });
  });

  describe('channel validation', () => {
    it('should accept all 7 valid channels', () => {
      const channels = ['ai', 'audio', 'scene', 'session', 'ui', 'error', 'analytics'];
      for (const ch of channels) {
        expect(() => bus.emit(`${ch}:test`, { data: 1 })).not.toThrow();
      }
    });

    it('should throw Error for unknown channel on emit', () => {
      expect(() => bus.emit('unknown:event', { data: 1 })).toThrow(Error);
    });

    it('should throw Error for unknown channel on subscribe', () => {
      expect(() => bus.on('unknown:event', () => {})).toThrow(Error);
    });

    it('should throw Error for event name without colon', () => {
      expect(() => bus.emit('noChannel', { data: 1 })).toThrow(Error);
    });
  });

  describe('middleware', () => {
    it('should execute middleware before dispatching to subscribers', () => {
      const order = [];
      bus.use((channel, event, payload, next) => {
        order.push('middleware');
        next();
      });
      bus.on('ai:suggestionReady', () => order.push('subscriber'));

      bus.emit('ai:suggestionReady', { data: 1 });

      expect(order).toEqual(['middleware', 'subscriber']);
    });

    it('should allow middleware to block dispatch by not calling next()', () => {
      const callback = vi.fn();
      bus.use((_channel, _event, _payload, _next) => {
        // Intentionally not calling next()
      });
      bus.on('ai:suggestionReady', callback);

      bus.emit('ai:suggestionReady', { data: 1 });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should chain multiple middleware in order', () => {
      const order = [];
      bus.use((ch, ev, p, next) => {
        order.push('mw1');
        next();
      });
      bus.use((ch, ev, p, next) => {
        order.push('mw2');
        next();
      });
      bus.on('ai:suggestionReady', () => order.push('subscriber'));

      bus.emit('ai:suggestionReady', { data: 1 });

      expect(order).toEqual(['mw1', 'mw2', 'subscriber']);
    });

    it('should not block subscribers when middleware throws', () => {
      const callback = vi.fn();
      bus.use(() => {
        throw new Error('middleware crash');
      });
      bus.on('ai:suggestionReady', callback);

      bus.emit('ai:suggestionReady', { data: 1 });

      expect(callback).toHaveBeenCalledOnce();
    });

    it('should continue to next middleware when one throws (error isolation)', () => {
      const order = [];
      bus.use(() => {
        order.push('mw1-throw');
        throw new Error('mw1 crash');
      });
      bus.use((ch, ev, p, next) => {
        order.push('mw2');
        next();
      });
      bus.on('ai:suggestionReady', () => order.push('subscriber'));

      bus.emit('ai:suggestionReady', { data: 1 });

      expect(order).toEqual(['mw1-throw', 'mw2', 'subscriber']);
    });

    it('should log events when logging middleware is active and debug mode is on', async () => {
      const { Logger } = await import('../../scripts/utils/Logger.mjs');
      Logger.isDebugMode.mockReturnValue(true);

      const debugBus = new EventBus();
      debugBus.on('ai:suggestionReady', () => {});
      debugBus.emit('ai:suggestionReady', { type: 'narration' });

      expect(Logger._childInstance.debug).toHaveBeenCalled();
    });

    it('should not log events when debug mode is off', async () => {
      const { Logger } = await import('../../scripts/utils/Logger.mjs');
      Logger.isDebugMode.mockReturnValue(false);

      const debugBus = new EventBus();
      debugBus.on('ai:suggestionReady', () => {});
      debugBus.emit('ai:suggestionReady', { type: 'narration' });

      expect(Logger._childInstance.debug).not.toHaveBeenCalled();
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners when called without arguments', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      bus.on('ai:suggestionReady', cb1);
      bus.on('scene:changed', cb2);

      bus.removeAllListeners();

      bus.emit('ai:suggestionReady', { data: 1 });
      bus.emit('scene:changed', { data: 1 });

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });

    it('should remove only listeners for specified channel', () => {
      const aiCb = vi.fn();
      const sceneCb = vi.fn();
      bus.on('ai:suggestionReady', aiCb);
      bus.on('scene:changed', sceneCb);

      bus.removeAllListeners('ai');

      bus.emit('ai:suggestionReady', { data: 1 });
      bus.emit('scene:changed', { data: 1 });

      expect(aiCb).not.toHaveBeenCalled();
      expect(sceneCb).toHaveBeenCalledOnce();
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      expect(bus.listenerCount('ai:suggestionReady')).toBe(0);

      bus.on('ai:suggestionReady', () => {});
      bus.on('ai:suggestionReady', () => {});

      expect(bus.listenerCount('ai:suggestionReady')).toBe(2);
    });

    it('should decrease after unsubscribe', () => {
      const cb = vi.fn();
      bus.on('ai:suggestionReady', cb);
      expect(bus.listenerCount('ai:suggestionReady')).toBe(1);

      bus.off('ai:suggestionReady', cb);
      expect(bus.listenerCount('ai:suggestionReady')).toBe(0);
    });
  });

  describe('channels', () => {
    it('should return all 7 registered channels', () => {
      const channels = bus.channels();
      expect(channels).toEqual(
        expect.arrayContaining(['ai', 'audio', 'scene', 'session', 'ui', 'error', 'analytics'])
      );
      expect(channels).toHaveLength(7);
    });

    it('should return a frozen copy (immutable)', () => {
      const channels = bus.channels();
      expect(() => {
        channels.push('extra');
      }).toThrow();
    });
  });

  describe('performance', () => {
    it('should dispatch to 50 subscribers in under 5ms', () => {
      const subscribers = [];
      for (let i = 0; i < 50; i++) {
        const cb = vi.fn();
        bus.on('ai:suggestionReady', cb);
        subscribers.push(cb);
      }

      // Warmup to avoid JIT cold start
      bus.emit('ai:suggestionReady', { warmup: true });
      subscribers.forEach((cb) => cb.mockClear());

      const start = performance.now();
      bus.emit('ai:suggestionReady', { type: 'narration', content: 'test' });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5); // 5ms threshold (NFR18 target 1ms + CI margin)
      subscribers.forEach((cb) => expect(cb).toHaveBeenCalledOnce());
    });
  });
});
