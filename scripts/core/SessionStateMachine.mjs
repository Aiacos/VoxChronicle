/**
 * SessionStateMachine - Formal state machine for session lifecycle
 *
 * Declarative transition matrix with guard conditions and EventBus integration.
 * NOT a singleton — instantiated and owned by SessionOrchestrator.
 *
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/** All valid session states */
export const SessionState = Object.freeze({
  IDLE: 'idle',
  CONFIGURING: 'configuring',
  LIVE: 'live',
  TRANSITIONING: 'transitioning',
  CHRONICLE: 'chronicle',
  PUBLISHING: 'publishing',
  COMPLETE: 'complete',
  ERROR: 'error',
});

/** All valid session events */
export const SessionEvent = Object.freeze({
  START_CONFIG: 'START_CONFIG',
  CONFIG_DONE: 'CONFIG_DONE',
  CONFIG_CANCEL: 'CONFIG_CANCEL',
  END_LIVE: 'END_LIVE',
  CRITICAL_ERROR: 'CRITICAL_ERROR',
  TRANSITION_DONE: 'TRANSITION_DONE',
  TRANSITION_FAIL: 'TRANSITION_FAIL',
  START_PUBLISH: 'START_PUBLISH',
  SKIP_PUBLISH: 'SKIP_PUBLISH',
  PUBLISH_DONE: 'PUBLISH_DONE',
  PUBLISH_FAIL: 'PUBLISH_FAIL',
  RESET: 'RESET',
  RECOVER: 'RECOVER',
  RETRY: 'RETRY',
});

/** @type {Set<string>} Valid state values for fast lookup */
const VALID_STATES = new Set(Object.values(SessionState));

/**
 * Declarative transition matrix: state → { event → targetState }
 * null target means dynamic resolution (RETRY uses previousState)
 */
const TRANSITIONS = Object.freeze({
  [SessionState.IDLE]: { [SessionEvent.START_CONFIG]: SessionState.CONFIGURING },
  [SessionState.CONFIGURING]: { [SessionEvent.CONFIG_DONE]: SessionState.LIVE, [SessionEvent.CONFIG_CANCEL]: SessionState.IDLE },
  [SessionState.LIVE]: { [SessionEvent.END_LIVE]: SessionState.TRANSITIONING, [SessionEvent.CRITICAL_ERROR]: SessionState.ERROR },
  [SessionState.TRANSITIONING]: { [SessionEvent.TRANSITION_DONE]: SessionState.CHRONICLE, [SessionEvent.TRANSITION_FAIL]: SessionState.ERROR },
  [SessionState.CHRONICLE]: { [SessionEvent.START_PUBLISH]: SessionState.PUBLISHING, [SessionEvent.SKIP_PUBLISH]: SessionState.COMPLETE },
  [SessionState.PUBLISHING]: { [SessionEvent.PUBLISH_DONE]: SessionState.COMPLETE, [SessionEvent.PUBLISH_FAIL]: SessionState.ERROR },
  [SessionState.COMPLETE]: { [SessionEvent.RESET]: SessionState.IDLE },
  [SessionState.ERROR]: { [SessionEvent.RECOVER]: SessionState.IDLE, [SessionEvent.RETRY]: null },
});

export class SessionStateMachine {
  #state;
  #previousState;
  #eventBus;
  /** @type {Map<string, Function[]>} */
  #guards = new Map();
  #logger = Logger.createChild('SessionStateMachine');

  /**
   * @param {Object} [eventBus] - Optional EventBus instance for emitting state changes
   * @param {string} [initialState='idle'] - Starting state
   */
  constructor(eventBus = null, initialState = SessionState.IDLE) {
    this.#eventBus = eventBus;
    this.#state = initialState;
    this.#previousState = null;
  }

  /** @returns {string} Current state (readonly) */
  get state() {
    return this.#state;
  }

  /**
   * Attempt a state transition.
   * @param {string} event - The event triggering the transition
   * @param {Object} [context={}] - Context passed to guards
   * @returns {boolean} true if transition succeeded, false if guard blocked it
   * @throws {Error} If the event is not defined for the current state
   */
  transition(event, context = {}) {
    const stateTransitions = TRANSITIONS[this.#state];
    if (!stateTransitions || !(event in stateTransitions)) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Session.Error.InvalidTransition', { event, state: this.#state })
          ?? `Invalid transition: event "${event}" is not valid in state "${this.#state}"`
      );
    }

    // Resolve target state (null means RETRY → use previousState)
    let targetState = stateTransitions[event];
    if (targetState === null) {
      targetState = this.#previousState ?? SessionState.IDLE;
    }

    // Check all guards (AND logic) with error isolation
    const guards = this.#guards.get(event);
    if (guards) {
      for (const guard of guards) {
        try {
          if (!guard(this.#state, event, context)) {
            this.#logger.debug(
              game?.i18n?.localize('VOXCHRONICLE.Session.Error.GuardFailed')
                ?? `Guard blocked transition: event "${event}" in state "${this.#state}"`
            );
            return false;
          }
        } catch (error) {
          this.#logger.error(`Guard threw for event "${event}":`, error);
          return false;
        }
      }
    }

    // Execute transition
    const from = this.#state;
    this.#previousState = from;
    this.#state = targetState;

    // Emit AFTER state change
    this.#emitStateChanged(from, targetState, event);

    return true;
  }

  /**
   * Check if a transition is possible without executing it.
   * @param {string} event
   * @param {Object} [context={}]
   * @returns {boolean}
   */
  canTransition(event, context = {}) {
    const stateTransitions = TRANSITIONS[this.#state];
    if (!stateTransitions || !(event in stateTransitions)) {
      return false;
    }

    const guards = this.#guards.get(event);
    if (guards) {
      for (const guard of guards) {
        try {
          if (!guard(this.#state, event, context)) {
            return false;
          }
        } catch {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Register a guard condition for an event.
   * @param {string} event
   * @param {Function} guardFn - (currentState, event, context) => boolean
   */
  addGuard(event, guardFn) {
    if (typeof guardFn !== 'function') {
      throw new Error(`Guard must be a function, got ${typeof guardFn}`);
    }
    if (!this.#guards.has(event)) {
      this.#guards.set(event, []);
    }
    this.#guards.get(event).push(guardFn);
  }

  /**
   * Get list of events available from current state.
   * @returns {string[]}
   */
  getAvailableTransitions() {
    const stateTransitions = TRANSITIONS[this.#state];
    return stateTransitions ? Object.keys(stateTransitions) : [];
  }

  /**
   * Check if current state matches any of the provided states.
   * @param {...string} states
   * @returns {boolean}
   */
  isInState(...states) {
    return states.includes(this.#state);
  }

  /**
   * Force reset to idle state.
   */
  reset() {
    const from = this.#state;
    this.#previousState = null;
    this.#state = SessionState.IDLE;
    this.#emitStateChanged(from, SessionState.IDLE, SessionEvent.RESET);
  }

  /**
   * Serialize state for localStorage persistence.
   * @returns {{ state: string, previousState: string|null, timestamp: number }}
   */
  serialize() {
    return {
      state: this.#state,
      previousState: this.#previousState,
      timestamp: Date.now(),
    };
  }

  /**
   * Restore a state machine from serialized data.
   * @param {{ state: string, previousState: string|null, timestamp: number }} data
   * @param {Object} [eventBus]
   * @returns {SessionStateMachine}
   */
  static deserialize(data, eventBus = null) {
    const logger = Logger.createChild('SessionStateMachine');

    if (!data || !VALID_STATES.has(data.state)) {
      logger.warn(`Invalid serialized state "${data?.state}", falling back to idle`);
      return new SessionStateMachine(eventBus, SessionState.IDLE);
    }

    const sm = new SessionStateMachine(eventBus, data.state);
    // Restore previousState only if valid
    sm.#previousState = (data.previousState && VALID_STATES.has(data.previousState))
      ? data.previousState : null;
    return sm;
  }

  /**
   * Emit state change event on EventBus if available.
   * @param {string} from
   * @param {string} to
   * @param {string} event
   */
  #emitStateChanged(from, to, event) {
    if (!this.#eventBus) return;

    this.#eventBus.emit('session:stateChanged', {
      from,
      to,
      event,
      timestamp: Date.now(),
    });
  }
}
