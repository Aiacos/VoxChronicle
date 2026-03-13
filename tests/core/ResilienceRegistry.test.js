import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilienceRegistry, CircuitState } from '../../scripts/core/ResilienceRegistry.mjs';

// Mock Logger
vi.mock('../../scripts/utils/Logger.mjs', () => {
  const childLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    Logger: {
      createChild: vi.fn(() => childLogger),
      _childInstance: childLogger,
      isDebugMode: vi.fn(() => false),
    },
  };
});

// Mock game global
globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
    format: vi.fn((key, data) => `${key} ${JSON.stringify(data)}`),
  },
};

// Mock ui global
globalThis.ui = {
  notifications: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
};

describe('ResilienceRegistry', () => {
  let registry;
  let mockEventBus;

  beforeEach(() => {
    vi.useFakeTimers();
    mockEventBus = {
      emit: vi.fn(),
      on: vi.fn(),
    };
    registry = new ResilienceRegistry(mockEventBus);
    vi.clearAllMocks();
  });

  afterEach(() => {
    registry.resetAll();
    vi.useRealTimers();
  });

  describe('CircuitState constants', () => {
    it('should export all 3 states', () => {
      expect(CircuitState.CLOSED).toBe('closed');
      expect(CircuitState.OPEN).toBe('open');
      expect(CircuitState.HALF_OPEN).toBe('half_open');
    });

    it('should be frozen (immutable)', () => {
      expect(() => { CircuitState.NEW = 'new'; }).toThrow();
    });
  });

  describe('register()', () => {
    it('should register a service with default options', () => {
      registry.register('testService');

      const status = registry.getStatus('testService');
      expect(status.state).toBe(CircuitState.CLOSED);
      expect(status.consecutiveFailures).toBe(0);
      expect(status.lastFailure).toBeNull();
      expect(status.lastSuccess).toBeNull();
    });

    it('should register a service with custom options', () => {
      const fallback = [() => 'cached'];
      registry.register('customService', {
        maxFailures: 3,
        cooldown: 30000,
        fallback,
      });

      const status = registry.getStatus('customService');
      expect(status.state).toBe(CircuitState.CLOSED);
    });

    it('should throw for invalid service name', () => {
      expect(() => registry.register('')).toThrow();
      expect(() => registry.register(null)).toThrow();
      expect(() => registry.register(123)).toThrow();
    });

    it('should throw for invalid fallback (not an array)', () => {
      expect(() => registry.register('svc', { fallback: 'notArray' })).toThrow();
    });

    it('should throw for fallback array with non-functions', () => {
      expect(() => registry.register('svc', { fallback: ['notFn'] })).toThrow();
    });
  });

  describe('execute()', () => {
    it('should execute fn successfully when circuit is closed', async () => {
      registry.register('svc');
      const result = await registry.execute('svc', () => 'success');
      expect(result).toBe('success');
    });

    it('should reset consecutive failures on success', async () => {
      registry.register('svc', { maxFailures: 5 });

      // Cause some failures
      for (let i = 0; i < 3; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(registry.getStatus('svc').consecutiveFailures).toBe(3);

      // Success resets
      await registry.execute('svc', () => 'ok');
      expect(registry.getStatus('svc').consecutiveFailures).toBe(0);
    });

    it('should increment failure counter on error', async () => {
      registry.register('svc');
      await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      expect(registry.getStatus('svc').consecutiveFailures).toBe(1);
    });

    it('should throw for unregistered service', async () => {
      await expect(registry.execute('unknown', () => 'x')).rejects.toThrow();
    });

    it('should open circuit breaker after maxFailures consecutive failures', async () => {
      registry.register('svc', { maxFailures: 5 });

      for (let i = 0; i < 5; i++) {
        await registry.execute('svc', () => { throw new Error(`fail ${i}`); }).catch(() => {});
      }

      expect(registry.getStatus('svc').state).toBe(CircuitState.OPEN);
    });

    it('should not call fn when circuit is open (use fallback)', async () => {
      const fn = vi.fn(() => 'live');
      const fallback = vi.fn(() => 'cached');

      registry.register('svc', { maxFailures: 2, fallback: [fallback] });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(registry.getStatus('svc').state).toBe(CircuitState.OPEN);

      // Now execute — fn should NOT be called, fallback should
      const result = await registry.execute('svc', fn);
      expect(fn).not.toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
      expect(result).toBe('cached');
    });
  });

  describe('fallback chain', () => {
    it('should execute fallbacks in order and return first success', async () => {
      const fb1 = vi.fn(() => { throw new Error('fb1 fail'); });
      const fb2 = vi.fn(() => 'fb2 success');
      const fb3 = vi.fn(() => 'fb3 success');

      registry.register('svc', { maxFailures: 1, fallback: [fb1, fb2, fb3] });

      // Open circuit
      await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});

      // Execute with open circuit — fallback chain
      const result = await registry.execute('svc', () => 'live');
      expect(fb1).toHaveBeenCalled();
      expect(fb2).toHaveBeenCalled();
      expect(fb3).not.toHaveBeenCalled();
      expect(result).toBe('fb2 success');
    });

    it('should throw wrapped error when all fallbacks fail', async () => {
      const fb1 = vi.fn(() => { throw new Error('fb1 fail'); });
      const fb2 = vi.fn(() => { throw new Error('fb2 fail'); });

      registry.register('svc', { maxFailures: 1, fallback: [fb1, fb2] });

      // Open circuit
      await registry.execute('svc', () => { throw new Error('original'); }).catch(() => {});

      // All fallbacks fail
      await expect(registry.execute('svc', () => 'live')).rejects.toThrow();
    });

    it('should execute fallback on fn failure in CLOSED state', async () => {
      const fallback = vi.fn(() => 'fallback result');
      registry.register('svc', { maxFailures: 5, fallback: [fallback] });

      const result = await registry.execute('svc', () => { throw new Error('fail'); });
      expect(fallback).toHaveBeenCalled();
      expect(result).toBe('fallback result');
    });

    it('should throw original error when no fallbacks configured and fn fails', async () => {
      registry.register('svc', { maxFailures: 5 });

      await expect(
        registry.execute('svc', () => { throw new Error('original error'); })
      ).rejects.toThrow('original error');
    });
  });

  describe('auto-recovery', () => {
    it('should transition from OPEN to HALF_OPEN after cooldown', async () => {
      registry.register('svc', { maxFailures: 2, cooldown: 60000 });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(registry.getStatus('svc').state).toBe(CircuitState.OPEN);

      // Advance time past cooldown
      vi.advanceTimersByTime(60000);
      expect(registry.getStatus('svc').state).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition from HALF_OPEN to CLOSED on success', async () => {
      registry.register('svc', { maxFailures: 2, cooldown: 60000 });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }

      // Wait for HALF_OPEN
      vi.advanceTimersByTime(60000);
      expect(registry.getStatus('svc').state).toBe(CircuitState.HALF_OPEN);

      // Success in HALF_OPEN → CLOSED
      await registry.execute('svc', () => 'recovered');
      expect(registry.getStatus('svc').state).toBe(CircuitState.CLOSED);
      expect(registry.getStatus('svc').consecutiveFailures).toBe(0);
    });

    it('should transition from HALF_OPEN to OPEN on failure and restart cooldown', async () => {
      registry.register('svc', { maxFailures: 2, cooldown: 60000 });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }

      // Wait for HALF_OPEN
      vi.advanceTimersByTime(60000);

      // Fail in HALF_OPEN → back to OPEN
      await registry.execute('svc', () => { throw new Error('still failing'); }).catch(() => {});
      expect(registry.getStatus('svc').state).toBe(CircuitState.OPEN);

      // Should restart cooldown — advance again
      vi.advanceTimersByTime(60000);
      expect(registry.getStatus('svc').state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('dual error channel (EventBus)', () => {
    it('should emit error:technical on every failure', async () => {
      registry.register('svc');
      await registry.execute('svc', () => { throw new Error('api error'); }).catch(() => {});

      expect(mockEventBus.emit).toHaveBeenCalledWith('error:technical', expect.objectContaining({
        service: 'svc',
        state: CircuitState.CLOSED,
        consecutiveFailures: 1,
      }));
    });

    it('should emit error:user when circuit opens', async () => {
      registry.register('svc', { maxFailures: 2 });

      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }

      expect(mockEventBus.emit).toHaveBeenCalledWith('error:user', expect.objectContaining({
        service: 'svc',
      }));
    });

    it('should emit error:user with recovery message when circuit closes', async () => {
      registry.register('svc', { maxFailures: 2, cooldown: 60000 });

      // Open
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }
      vi.clearAllMocks();

      // HALF_OPEN
      vi.advanceTimersByTime(60000);

      // Recover
      await registry.execute('svc', () => 'ok');

      expect(mockEventBus.emit).toHaveBeenCalledWith('error:user', expect.objectContaining({
        service: 'svc',
      }));
    });

    it('should emit session:resilienceChanged on state transitions', async () => {
      registry.register('svc', { maxFailures: 2, cooldown: 60000 });

      // CLOSED → OPEN
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }

      expect(mockEventBus.emit).toHaveBeenCalledWith('session:resilienceChanged', expect.objectContaining({
        service: 'svc',
        from: CircuitState.CLOSED,
        to: CircuitState.OPEN,
      }));
    });
  });

  describe('getStatus()', () => {
    it('should return status for a single service', () => {
      registry.register('svc');
      const status = registry.getStatus('svc');
      expect(status).toEqual({
        state: CircuitState.CLOSED,
        consecutiveFailures: 0,
        lastFailure: null,
        lastSuccess: null,
      });
    });

    it('should return all services status when called without args', () => {
      registry.register('svc1');
      registry.register('svc2');
      const statuses = registry.getStatus();
      expect(statuses).toHaveProperty('svc1');
      expect(statuses).toHaveProperty('svc2');
      expect(statuses.svc1.state).toBe(CircuitState.CLOSED);
    });

    it('should throw for unregistered service', () => {
      expect(() => registry.getStatus('unknown')).toThrow();
    });
  });

  describe('resetService()', () => {
    it('should force circuit to CLOSED and clear timer', async () => {
      registry.register('svc', { maxFailures: 2, cooldown: 60000 });

      // Open circuit
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(registry.getStatus('svc').state).toBe(CircuitState.OPEN);

      registry.resetService('svc');
      expect(registry.getStatus('svc').state).toBe(CircuitState.CLOSED);
      expect(registry.getStatus('svc').consecutiveFailures).toBe(0);
    });

    it('should throw for unregistered service', () => {
      expect(() => registry.resetService('unknown')).toThrow();
    });

    it('should emit session:resilienceChanged when resetting from non-CLOSED state', async () => {
      registry.register('svc', { maxFailures: 2, cooldown: 60000 });
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }
      vi.clearAllMocks();

      registry.resetService('svc');
      expect(mockEventBus.emit).toHaveBeenCalledWith('session:resilienceChanged', expect.objectContaining({
        service: 'svc',
        from: CircuitState.OPEN,
        to: CircuitState.CLOSED,
      }));
    });

    it('should not emit event when already CLOSED', () => {
      registry.register('svc');
      registry.resetService('svc');
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('resetAll()', () => {
    it('should reset all registered services', async () => {
      registry.register('svc1', { maxFailures: 1 });
      registry.register('svc2', { maxFailures: 1 });

      // Open both circuits
      await registry.execute('svc1', () => { throw new Error('fail'); }).catch(() => {});
      await registry.execute('svc2', () => { throw new Error('fail'); }).catch(() => {});

      registry.resetAll();

      expect(registry.getStatus('svc1').state).toBe(CircuitState.CLOSED);
      expect(registry.getStatus('svc2').state).toBe(CircuitState.CLOSED);
    });
  });

  describe('without EventBus', () => {
    it('should work without errors when no EventBus provided', async () => {
      const noEventBusRegistry = new ResilienceRegistry();
      noEventBusRegistry.register('svc', { maxFailures: 2 });

      // Should not throw even when emitting events
      for (let i = 0; i < 2; i++) {
        await noEventBusRegistry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }

      expect(noEventBusRegistry.getStatus('svc').state).toBe(CircuitState.OPEN);
      noEventBusRegistry.resetAll();
    });
  });

  describe('timestamp tracking', () => {
    it('should set lastSuccess after successful execute', async () => {
      registry.register('svc');
      await registry.execute('svc', () => 'ok');
      const status = registry.getStatus('svc');
      expect(status.lastSuccess).toBeTypeOf('number');
      expect(status.lastFailure).toBeNull();
    });

    it('should set lastFailure after failed execute', async () => {
      registry.register('svc');
      await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      const status = registry.getStatus('svc');
      expect(status.lastFailure).toBeTypeOf('number');
      expect(status.lastSuccess).toBeNull();
    });
  });

  describe('consecutiveFailures counter reset', () => {
    it('should reset counter to 1 on HALF_OPEN failure (not grow unbounded)', async () => {
      registry.register('svc', { maxFailures: 2, cooldown: 60000 });

      // Open circuit (2 failures)
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(registry.getStatus('svc').consecutiveFailures).toBe(2);

      // HALF_OPEN
      vi.advanceTimersByTime(60000);

      // Fail in HALF_OPEN — counter should reset to 1, not increment to 3
      await registry.execute('svc', () => { throw new Error('still failing'); }).catch(() => {});
      expect(registry.getStatus('svc').consecutiveFailures).toBe(1);
    });
  });

  describe('duplicate registration', () => {
    it('should overwrite existing registration with warning', async () => {
      const { Logger } = await import('../../scripts/utils/Logger.mjs');
      registry.register('svc', { maxFailures: 10 });
      registry.register('svc', { maxFailures: 2 });

      // Should use new config (maxFailures=2)
      for (let i = 0; i < 2; i++) {
        await registry.execute('svc', () => { throw new Error('fail'); }).catch(() => {});
      }
      expect(registry.getStatus('svc').state).toBe(CircuitState.OPEN);
      expect(Logger._childInstance.warn).toHaveBeenCalled();
    });
  });

  describe('service independence', () => {
    it('should not affect other services when one fails', async () => {
      registry.register('aiAssistant', { maxFailures: 2 });
      registry.register('audioRecorder', { maxFailures: 2 });

      // Open aiAssistant circuit
      for (let i = 0; i < 2; i++) {
        await registry.execute('aiAssistant', () => { throw new Error('fail'); }).catch(() => {});
      }

      // audioRecorder should still work
      const result = await registry.execute('audioRecorder', () => 'audio ok');
      expect(result).toBe('audio ok');
      expect(registry.getStatus('aiAssistant').state).toBe(CircuitState.OPEN);
      expect(registry.getStatus('audioRecorder').state).toBe(CircuitState.CLOSED);
    });
  });
});
