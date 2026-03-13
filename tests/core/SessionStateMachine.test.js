import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionStateMachine, SessionState, SessionEvent } from '../../scripts/core/SessionStateMachine.mjs';

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
    },
  };
});

// Mock game global
globalThis.game = {
  i18n: {
    localize: vi.fn((key) => key),
  },
};

describe('SessionStateMachine', () => {
  let sm;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      emit: vi.fn(),
    };
    sm = new SessionStateMachine(mockEventBus);
    vi.clearAllMocks();
  });

  describe('SessionState constants', () => {
    it('should export all 8 states', () => {
      expect(SessionState.IDLE).toBe('idle');
      expect(SessionState.CONFIGURING).toBe('configuring');
      expect(SessionState.LIVE).toBe('live');
      expect(SessionState.TRANSITIONING).toBe('transitioning');
      expect(SessionState.CHRONICLE).toBe('chronicle');
      expect(SessionState.PUBLISHING).toBe('publishing');
      expect(SessionState.COMPLETE).toBe('complete');
      expect(SessionState.ERROR).toBe('error');
    });

    it('should be frozen (immutable)', () => {
      expect(() => { SessionState.NEW = 'new'; }).toThrow();
    });
  });

  describe('SessionEvent constants', () => {
    it('should export all events', () => {
      expect(SessionEvent.START_CONFIG).toBe('START_CONFIG');
      expect(SessionEvent.CONFIG_DONE).toBe('CONFIG_DONE');
      expect(SessionEvent.CONFIG_CANCEL).toBe('CONFIG_CANCEL');
      expect(SessionEvent.END_LIVE).toBe('END_LIVE');
      expect(SessionEvent.CRITICAL_ERROR).toBe('CRITICAL_ERROR');
      expect(SessionEvent.TRANSITION_DONE).toBe('TRANSITION_DONE');
      expect(SessionEvent.TRANSITION_FAIL).toBe('TRANSITION_FAIL');
      expect(SessionEvent.START_PUBLISH).toBe('START_PUBLISH');
      expect(SessionEvent.SKIP_PUBLISH).toBe('SKIP_PUBLISH');
      expect(SessionEvent.PUBLISH_DONE).toBe('PUBLISH_DONE');
      expect(SessionEvent.PUBLISH_FAIL).toBe('PUBLISH_FAIL');
      expect(SessionEvent.RESET).toBe('RESET');
      expect(SessionEvent.RECOVER).toBe('RECOVER');
      expect(SessionEvent.RETRY).toBe('RETRY');
    });

    it('should be frozen (immutable)', () => {
      expect(() => { SessionEvent.NEW = 'NEW'; }).toThrow();
    });
  });

  describe('constructor', () => {
    it('should start in idle state by default', () => {
      expect(sm.state).toBe(SessionState.IDLE);
    });

    it('should accept custom initial state', () => {
      const custom = new SessionStateMachine(mockEventBus, SessionState.ERROR);
      expect(custom.state).toBe(SessionState.ERROR);
    });
  });

  describe('transition', () => {
    // AC #1: Test transizione valida — stato cambia e evento emesso
    it('should change state on valid transition and emit event', () => {
      const result = sm.transition(SessionEvent.START_CONFIG);

      expect(result).toBe(true);
      expect(sm.state).toBe(SessionState.CONFIGURING);
      expect(mockEventBus.emit).toHaveBeenCalledWith('session:stateChanged', {
        from: SessionState.IDLE,
        to: SessionState.CONFIGURING,
        event: SessionEvent.START_CONFIG,
        timestamp: expect.any(Number),
      });
    });

    // AC #2: Test transizione invalida — stato invariato, errore lanciato
    it('should throw Error for undefined transition', () => {
      expect(() => sm.transition(SessionEvent.END_LIVE)).toThrow(Error);
      expect(sm.state).toBe(SessionState.IDLE);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw Error for completely unknown event', () => {
      expect(() => sm.transition('UNKNOWN_EVENT')).toThrow(Error);
      expect(sm.state).toBe(SessionState.IDLE);
    });

    // AC #4: Test CRITICAL_ERROR da live → error
    it('should transition to error on CRITICAL_ERROR from live', () => {
      sm.transition(SessionEvent.START_CONFIG);
      sm.transition(SessionEvent.CONFIG_DONE);
      expect(sm.state).toBe(SessionState.LIVE);

      const result = sm.transition(SessionEvent.CRITICAL_ERROR);
      expect(result).toBe(true);
      expect(sm.state).toBe(SessionState.ERROR);
    });

    // Test RECOVER da error → idle
    it('should transition from error to idle on RECOVER', () => {
      const errorSm = new SessionStateMachine(mockEventBus, SessionState.ERROR);
      const result = errorSm.transition(SessionEvent.RECOVER);

      expect(result).toBe(true);
      expect(errorSm.state).toBe(SessionState.IDLE);
    });

    // Test RETRY da error → previousState
    it('should transition from error to previous state on RETRY', () => {
      sm.transition(SessionEvent.START_CONFIG);
      sm.transition(SessionEvent.CONFIG_DONE);
      expect(sm.state).toBe(SessionState.LIVE);

      sm.transition(SessionEvent.CRITICAL_ERROR);
      expect(sm.state).toBe(SessionState.ERROR);

      vi.clearAllMocks();
      const result = sm.transition(SessionEvent.RETRY);
      expect(result).toBe(true);
      expect(sm.state).toBe(SessionState.LIVE);
      expect(mockEventBus.emit).toHaveBeenCalledWith('session:stateChanged', {
        from: SessionState.ERROR,
        to: SessionState.LIVE,
        event: SessionEvent.RETRY,
        timestamp: expect.any(Number),
      });
    });

    it('should default RETRY to idle when no previous state exists', () => {
      const errorSm = new SessionStateMachine(mockEventBus, SessionState.ERROR);
      const result = errorSm.transition(SessionEvent.RETRY);

      expect(result).toBe(true);
      expect(errorSm.state).toBe(SessionState.IDLE);
    });

    // AC #1: L'emit avviene DOPO il cambio di stato
    it('should emit event AFTER state has changed', () => {
      let stateAtEmitTime;
      mockEventBus.emit = vi.fn(() => {
        stateAtEmitTime = sm.state;
      });

      sm.transition(SessionEvent.START_CONFIG);
      expect(stateAtEmitTime).toBe(SessionState.CONFIGURING);
    });

    // Transizioni fallite NON emettono eventi
    it('should not emit events for failed transitions', () => {
      expect(() => sm.transition(SessionEvent.END_LIVE)).toThrow();
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transition without side effects', () => {
      expect(sm.canTransition(SessionEvent.START_CONFIG)).toBe(true);
      // State should not have changed
      expect(sm.state).toBe(SessionState.IDLE);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should return false for invalid transition without side effects', () => {
      expect(sm.canTransition(SessionEvent.END_LIVE)).toBe(false);
      expect(sm.state).toBe(SessionState.IDLE);
    });

    it('should return false for unknown event', () => {
      expect(sm.canTransition('UNKNOWN')).toBe(false);
    });

    it('should respect guard conditions', () => {
      sm.addGuard(SessionEvent.START_CONFIG, () => false);
      expect(sm.canTransition(SessionEvent.START_CONFIG)).toBe(false);
    });
  });

  describe('guard system', () => {
    // AC #3: Guard che blocca transizione — ritorno false, nessun errore
    it('should block transition when guard returns false', () => {
      sm.addGuard(SessionEvent.START_CONFIG, () => false);

      const result = sm.transition(SessionEvent.START_CONFIG);

      expect(result).toBe(false);
      expect(sm.state).toBe(SessionState.IDLE);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should allow transition when guard returns true', () => {
      sm.addGuard(SessionEvent.START_CONFIG, () => true);

      const result = sm.transition(SessionEvent.START_CONFIG);

      expect(result).toBe(true);
      expect(sm.state).toBe(SessionState.CONFIGURING);
    });

    it('should pass correct arguments to guard function', () => {
      const guard = vi.fn(() => true);
      sm.addGuard(SessionEvent.START_CONFIG, guard);

      const context = { userId: 123 };
      sm.transition(SessionEvent.START_CONFIG, context);

      expect(guard).toHaveBeenCalledWith(SessionState.IDLE, SessionEvent.START_CONFIG, context);
    });

    // Guard multipla (AND logic) — una sola guard che fallisce blocca
    it('should require ALL guards to pass (AND logic)', () => {
      sm.addGuard(SessionEvent.START_CONFIG, () => true);
      sm.addGuard(SessionEvent.START_CONFIG, () => false);

      const result = sm.transition(SessionEvent.START_CONFIG);

      expect(result).toBe(false);
      expect(sm.state).toBe(SessionState.IDLE);
    });

    it('should pass when all multiple guards return true', () => {
      sm.addGuard(SessionEvent.START_CONFIG, () => true);
      sm.addGuard(SessionEvent.START_CONFIG, () => true);

      const result = sm.transition(SessionEvent.START_CONFIG);

      expect(result).toBe(true);
      expect(sm.state).toBe(SessionState.CONFIGURING);
    });

    it('should treat throwing guard as guard failure (error isolation)', () => {
      sm.addGuard(SessionEvent.START_CONFIG, () => {
        throw new Error('Guard bug');
      });

      const result = sm.transition(SessionEvent.START_CONFIG);

      expect(result).toBe(false);
      expect(sm.state).toBe(SessionState.IDLE);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('should throw when registering non-function guard', () => {
      expect(() => sm.addGuard(SessionEvent.START_CONFIG, 'not a function')).toThrow('Guard must be a function');
      expect(() => sm.addGuard(SessionEvent.START_CONFIG, null)).toThrow('Guard must be a function');
    });

    // Guard predefinite come esempio (non hardcoded)
    it('should support TRANSITION_DONE guard requiring transcript', () => {
      const liveSm = new SessionStateMachine(mockEventBus, SessionState.LIVE);
      liveSm.transition(SessionEvent.END_LIVE);
      expect(liveSm.state).toBe(SessionState.TRANSITIONING);

      liveSm.addGuard(SessionEvent.TRANSITION_DONE, (_state, _event, ctx) => {
        return ctx.transcript && ctx.transcript.length > 0;
      });

      // Without transcript — blocked
      expect(liveSm.transition(SessionEvent.TRANSITION_DONE, {})).toBe(false);
      expect(liveSm.state).toBe(SessionState.TRANSITIONING);

      // With transcript — allowed
      expect(liveSm.transition(SessionEvent.TRANSITION_DONE, { transcript: 'Hello' })).toBe(true);
      expect(liveSm.state).toBe(SessionState.CHRONICLE);
    });

    it('should support START_PUBLISH guard requiring entities', () => {
      const chronicleSm = new SessionStateMachine(mockEventBus, SessionState.CHRONICLE);

      chronicleSm.addGuard(SessionEvent.START_PUBLISH, (_state, _event, ctx) => {
        return Array.isArray(ctx.entities) && ctx.entities.length > 0;
      });

      // Without entities — blocked
      expect(chronicleSm.transition(SessionEvent.START_PUBLISH, {})).toBe(false);

      // With entities — allowed
      expect(chronicleSm.transition(SessionEvent.START_PUBLISH, { entities: ['npc1'] })).toBe(true);
      expect(chronicleSm.state).toBe(SessionState.PUBLISHING);
    });
  });

  describe('serialization', () => {
    // AC #5: Serializzazione round-trip
    it('should serialize current state', () => {
      sm.transition(SessionEvent.START_CONFIG);

      const data = sm.serialize();

      expect(data.state).toBe(SessionState.CONFIGURING);
      expect(data.previousState).toBe(SessionState.IDLE);
      expect(data.timestamp).toEqual(expect.any(Number));
    });

    it('should deserialize to restore state', () => {
      const data = { state: SessionState.LIVE, previousState: SessionState.CONFIGURING, timestamp: Date.now() };
      const restored = SessionStateMachine.deserialize(data, mockEventBus);

      expect(restored.state).toBe(SessionState.LIVE);
    });

    it('should round-trip correctly', () => {
      sm.transition(SessionEvent.START_CONFIG);
      sm.transition(SessionEvent.CONFIG_DONE);

      const serialized = sm.serialize();
      const restored = SessionStateMachine.deserialize(serialized, mockEventBus);

      expect(restored.state).toBe(sm.state);
    });

    // Test deserializzazione con stato invalido → fallback idle
    it('should fallback to idle when deserializing invalid state', () => {
      const data = { state: 'nonexistent', previousState: null, timestamp: Date.now() };
      const restored = SessionStateMachine.deserialize(data, mockEventBus);

      expect(restored.state).toBe(SessionState.IDLE);
    });

    it('should fallback to idle when deserializing null data', () => {
      const restored = SessionStateMachine.deserialize(null, mockEventBus);
      expect(restored.state).toBe(SessionState.IDLE);
    });

    it('should fallback to idle when deserializing undefined data', () => {
      const restored = SessionStateMachine.deserialize(undefined, mockEventBus);
      expect(restored.state).toBe(SessionState.IDLE);
    });

    it('should discard invalid previousState during deserialization', () => {
      const data = { state: SessionState.ERROR, previousState: 'hackedState', timestamp: Date.now() };
      const restored = SessionStateMachine.deserialize(data, mockEventBus);

      expect(restored.state).toBe(SessionState.ERROR);
      // RETRY should go to idle (invalid previousState was discarded)
      const result = restored.transition(SessionEvent.RETRY);
      expect(result).toBe(true);
      expect(restored.state).toBe(SessionState.IDLE);
    });

    it('should preserve valid previousState during deserialization', () => {
      const data = { state: SessionState.ERROR, previousState: SessionState.LIVE, timestamp: Date.now() };
      const restored = SessionStateMachine.deserialize(data, mockEventBus);

      const result = restored.transition(SessionEvent.RETRY);
      expect(result).toBe(true);
      expect(restored.state).toBe(SessionState.LIVE);
    });

    it('should not include guards in serialization', () => {
      sm.addGuard(SessionEvent.START_CONFIG, () => true);
      const data = sm.serialize();

      // Serialization is plain JSON — no functions
      const json = JSON.stringify(data);
      expect(json).not.toContain('function');
    });

    it('should work without eventBus on deserialize', () => {
      const data = { state: SessionState.LIVE, previousState: SessionState.CONFIGURING, timestamp: Date.now() };
      const restored = SessionStateMachine.deserialize(data);

      expect(restored.state).toBe(SessionState.LIVE);
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return available events from idle', () => {
      const events = sm.getAvailableTransitions();
      expect(events).toEqual([SessionEvent.START_CONFIG]);
    });

    it('should return available events from configuring', () => {
      sm.transition(SessionEvent.START_CONFIG);
      const events = sm.getAvailableTransitions();
      expect(events).toContain(SessionEvent.CONFIG_DONE);
      expect(events).toContain(SessionEvent.CONFIG_CANCEL);
    });

    it('should return available events from live', () => {
      sm.transition(SessionEvent.START_CONFIG);
      sm.transition(SessionEvent.CONFIG_DONE);
      const events = sm.getAvailableTransitions();
      expect(events).toContain(SessionEvent.END_LIVE);
      expect(events).toContain(SessionEvent.CRITICAL_ERROR);
    });

    it('should return available events from error', () => {
      const errorSm = new SessionStateMachine(mockEventBus, SessionState.ERROR);
      const events = errorSm.getAvailableTransitions();
      expect(events).toContain(SessionEvent.RECOVER);
      expect(events).toContain(SessionEvent.RETRY);
    });

    it('should return correct events for each state', () => {
      const allStates = Object.values(SessionState);
      for (const state of allStates) {
        const machine = new SessionStateMachine(null, state);
        const events = machine.getAvailableTransitions();
        expect(Array.isArray(events)).toBe(true);
      }
    });
  });

  describe('isInState', () => {
    it('should return true for current state', () => {
      expect(sm.isInState(SessionState.IDLE)).toBe(true);
    });

    it('should return false for other state', () => {
      expect(sm.isInState(SessionState.LIVE)).toBe(false);
    });

    it('should support multiple state arguments (varargs)', () => {
      expect(sm.isInState(SessionState.IDLE, SessionState.LIVE)).toBe(true);
      expect(sm.isInState(SessionState.LIVE, SessionState.ERROR)).toBe(false);
    });
  });

  describe('reset', () => {
    it('should force state to idle', () => {
      sm.transition(SessionEvent.START_CONFIG);
      sm.transition(SessionEvent.CONFIG_DONE);
      expect(sm.state).toBe(SessionState.LIVE);

      sm.reset();
      expect(sm.state).toBe(SessionState.IDLE);
    });

    it('should emit event when EventBus is present', () => {
      sm.transition(SessionEvent.START_CONFIG);
      vi.clearAllMocks();

      sm.reset();

      expect(mockEventBus.emit).toHaveBeenCalledWith('session:stateChanged', {
        from: SessionState.CONFIGURING,
        to: SessionState.IDLE,
        event: 'RESET',
        timestamp: expect.any(Number),
      });
    });

    it('should not throw when EventBus is absent', () => {
      const noEventBusSm = new SessionStateMachine(null, SessionState.LIVE);
      expect(() => noEventBusSm.reset()).not.toThrow();
      expect(noEventBusSm.state).toBe(SessionState.IDLE);
    });

    it('should clear previousState on reset', () => {
      sm.transition(SessionEvent.START_CONFIG);
      sm.reset();

      // Verify previousState is null by serializing
      const data = sm.serialize();
      expect(data.previousState).toBeNull();
    });
  });

  describe('without EventBus', () => {
    it('should work without throwing when no eventBus is provided', () => {
      const noEventBusSm = new SessionStateMachine();
      const result = noEventBusSm.transition(SessionEvent.START_CONFIG);

      expect(result).toBe(true);
      expect(noEventBusSm.state).toBe(SessionState.CONFIGURING);
    });

    it('should not emit events when no eventBus provided', () => {
      const noEventBusSm = new SessionStateMachine(null);
      noEventBusSm.transition(SessionEvent.START_CONFIG);
      // No error, no emit — passes if no exception
    });
  });

  describe('full lifecycle chain', () => {
    it('should complete full chain: idle → configuring → live → transitioning → chronicle → publishing → complete → idle', () => {
      // idle → configuring
      expect(sm.transition(SessionEvent.START_CONFIG)).toBe(true);
      expect(sm.state).toBe(SessionState.CONFIGURING);

      // configuring → live
      expect(sm.transition(SessionEvent.CONFIG_DONE)).toBe(true);
      expect(sm.state).toBe(SessionState.LIVE);

      // live → transitioning
      expect(sm.transition(SessionEvent.END_LIVE)).toBe(true);
      expect(sm.state).toBe(SessionState.TRANSITIONING);

      // transitioning → chronicle
      expect(sm.transition(SessionEvent.TRANSITION_DONE)).toBe(true);
      expect(sm.state).toBe(SessionState.CHRONICLE);

      // chronicle → publishing
      expect(sm.transition(SessionEvent.START_PUBLISH)).toBe(true);
      expect(sm.state).toBe(SessionState.PUBLISHING);

      // publishing → complete
      expect(sm.transition(SessionEvent.PUBLISH_DONE)).toBe(true);
      expect(sm.state).toBe(SessionState.COMPLETE);

      // complete → idle
      expect(sm.transition(SessionEvent.RESET)).toBe(true);
      expect(sm.state).toBe(SessionState.IDLE);

      // Verify 7 transitions emitted events
      expect(mockEventBus.emit).toHaveBeenCalledTimes(7);
    });
  });
});
