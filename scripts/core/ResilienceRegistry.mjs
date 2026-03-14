/**
 * ResilienceRegistry - Circuit breaker with fallback chains for service resilience
 *
 * Provides centralized resilience management for VoxChronicle services.
 * Each registered service gets an independent circuit breaker that tracks
 * failures and automatically recovers after a cooldown period.
 *
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { eventBus as defaultEventBus } from './EventBus.mjs';

/** Circuit breaker states */
export const CircuitState = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open'
});

/**
 * Centralized resilience registry with circuit breaker and fallback chain support.
 */
export class ResilienceRegistry {
  /** @type {Map<string, object>} */
  #services = new Map();

  /** @type {object | null} */
  #eventBus = null;

  #logger = Logger.createChild('ResilienceRegistry');

  /**
   * @param {object} [eventBus] - Optional EventBus instance for dual error channel
   */
  constructor(eventBus) {
    this.#eventBus = eventBus ?? null;
  }

  /**
   * Register a service with circuit breaker policy.
   * @param {string} serviceName - Unique service identifier
   * @param {object} [options={}]
   * @param {number} [options.maxFailures=5] - Consecutive failures before opening circuit
   * @param {number} [options.cooldown=60000] - Milliseconds before attempting recovery
   * @param {Function[]} [options.fallback=[]] - Ordered fallback functions
   */
  register(serviceName, options = {}) {
    if (typeof serviceName !== 'string' || serviceName.length === 0) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Resilience.Error.ServiceNotRegistered', {
          service: serviceName
        }) ?? `Invalid service name: "${serviceName}". Must be a non-empty string.`
      );
    }

    if (this.#services.has(serviceName)) {
      this.#logger.warn(`Service "${serviceName}" already registered, overwriting`);
    }

    const { maxFailures = 5, cooldown = 60000, fallback = [] } = options;

    if (!Array.isArray(fallback)) {
      throw new TypeError('Fallback must be an array of functions');
    }
    for (const fb of fallback) {
      if (typeof fb !== 'function') {
        throw new TypeError('Each fallback must be a function');
      }
    }

    this.#services.set(serviceName, {
      maxFailures,
      cooldown,
      fallback,
      state: CircuitState.CLOSED,
      consecutiveFailures: 0,
      lastFailure: null,
      lastSuccess: null,
      cooldownTimer: null
    });
  }

  /**
   * Execute a function with circuit breaker protection.
   * @param {string} serviceName - Registered service name
   * @param {Function} fn - Async function to execute
   * @returns {Promise<*>} Result from fn or fallback
   */
  async execute(serviceName, fn) {
    const svc = this.#getService(serviceName);

    if (svc.state === CircuitState.OPEN) {
      this.#logger.debug(`Circuit OPEN for ${serviceName}, using fallback chain`);
      return this.#executeFallbackChain(serviceName, svc, null);
    }

    try {
      const result = await fn();
      this.#onSuccess(serviceName, svc);
      return result;
    } catch (error) {
      this.#onFailure(serviceName, svc, error);

      // In HALF_OPEN, failure means go back to OPEN
      if (svc.state === CircuitState.HALF_OPEN) {
        svc.consecutiveFailures = 1;
        this.#transitionTo(serviceName, svc, CircuitState.OPEN);
        this.#startCooldownTimer(serviceName, svc);
        this.#emitEvent('error:user', {
          service: serviceName,
          message:
            game?.i18n?.format?.('VOXCHRONICLE.Resilience.Error.CircuitOpen', {
              service: serviceName
            }) ?? `Service ${serviceName} temporarily unavailable`,
          timestamp: Date.now()
        });
      }

      // Try fallback chain if available
      if (svc.fallback.length > 0) {
        return this.#executeFallbackChain(serviceName, svc, error);
      }

      throw error;
    }
  }

  /**
   * Get status of a specific service, or all services if no name provided.
   * @param {string} [serviceName] - Service name, or omit for all
   * @returns {object} Status object or map of all statuses
   */
  getStatus(serviceName) {
    if (serviceName === undefined) {
      const result = {};
      for (const [name, svc] of this.#services) {
        result[name] = this.#formatStatus(svc);
      }
      return result;
    }

    const svc = this.#getService(serviceName);
    return this.#formatStatus(svc);
  }

  /**
   * Force a service circuit breaker to CLOSED state.
   * @param {string} serviceName
   */
  resetService(serviceName) {
    const svc = this.#getService(serviceName);
    const previousState = svc.state;
    this.#clearCooldownTimer(svc);
    svc.state = CircuitState.CLOSED;
    svc.consecutiveFailures = 0;
    svc.lastFailure = null;
    svc.lastSuccess = null;
    if (previousState !== CircuitState.CLOSED) {
      this.#emitEvent('session:resilienceChanged', {
        service: serviceName,
        from: previousState,
        to: CircuitState.CLOSED,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Reset all registered services to CLOSED state.
   */
  resetAll() {
    for (const [name, svc] of this.#services) {
      const previousState = svc.state;
      this.#clearCooldownTimer(svc);
      svc.state = CircuitState.CLOSED;
      svc.consecutiveFailures = 0;
      svc.lastFailure = null;
      svc.lastSuccess = null;
      if (previousState !== CircuitState.CLOSED) {
        this.#emitEvent('session:resilienceChanged', {
          service: name,
          from: previousState,
          to: CircuitState.CLOSED,
          timestamp: Date.now()
        });
      }
    }
  }

  // ── Private methods ──────────────────────────────────────────────

  /**
   * Get a registered service or throw.
   * @param {string} serviceName
   * @returns {object}
   */
  #getService(serviceName) {
    const svc = this.#services.get(serviceName);
    if (!svc) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Resilience.Error.ServiceNotRegistered', {
          service: serviceName
        }) ?? `Service "${serviceName}" is not registered`
      );
    }
    return svc;
  }

  /**
   * Handle a successful execution.
   * @param serviceName
   * @param svc
   */
  #onSuccess(serviceName, svc) {
    const previousState = svc.state;
    svc.consecutiveFailures = 0;
    svc.lastSuccess = Date.now();

    if (previousState === CircuitState.HALF_OPEN) {
      this.#transitionTo(serviceName, svc, CircuitState.CLOSED);
      this.#emitEvent('error:user', {
        service: serviceName,
        message:
          game?.i18n?.format?.('VOXCHRONICLE.Resilience.Status.Recovered', {
            service: serviceName
          }) ?? `Service ${serviceName} recovered`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle a failed execution.
   * @param serviceName
   * @param svc
   * @param error
   */
  #onFailure(serviceName, svc, error) {
    svc.consecutiveFailures++;
    svc.lastFailure = Date.now();

    this.#emitEvent('error:technical', {
      service: serviceName,
      error: error.message,
      state: svc.state,
      consecutiveFailures: svc.consecutiveFailures,
      timestamp: Date.now()
    });

    // Check if we should open the circuit
    if (svc.state === CircuitState.CLOSED && svc.consecutiveFailures >= svc.maxFailures) {
      this.#transitionTo(serviceName, svc, CircuitState.OPEN);
      this.#startCooldownTimer(serviceName, svc);

      this.#emitEvent('error:user', {
        service: serviceName,
        message:
          game?.i18n?.format?.('VOXCHRONICLE.Resilience.Error.CircuitOpen', {
            service: serviceName
          }) ?? `Service ${serviceName} temporarily unavailable`,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Transition a service to a new circuit state.
   * @param serviceName
   * @param svc
   * @param newState
   */
  #transitionTo(serviceName, svc, newState) {
    const from = svc.state;
    svc.state = newState;
    this.#logger.info(`Circuit ${serviceName}: ${from} → ${newState}`);

    this.#emitEvent('session:resilienceChanged', {
      service: serviceName,
      from,
      to: newState,
      timestamp: Date.now()
    });
  }

  /**
   * Execute the fallback chain in order.
   * @param serviceName
   * @param svc
   * @param originalError
   * @returns {Promise<*>} Result from first successful fallback
   */
  async #executeFallbackChain(serviceName, svc, originalError) {
    for (let i = 0; i < svc.fallback.length; i++) {
      try {
        const result = await svc.fallback[i]();
        this.#logger.debug(`Fallback ${i} succeeded for ${serviceName}`);
        return result;
      } catch (err) {
        this.#logger.warn(`Fallback ${i} failed for ${serviceName}:`, err);
      }
    }

    // All fallbacks failed
    this.#emitEvent('error:user', {
      service: serviceName,
      message:
        game?.i18n?.format?.('VOXCHRONICLE.Resilience.Error.AllFallbacksFailed', {
          service: serviceName
        }) ?? `All recovery options exhausted for ${serviceName}`,
      timestamp: Date.now()
    });

    throw originalError ?? new Error(`All fallbacks failed for service "${serviceName}"`);
  }

  /**
   * Start cooldown timer for auto-recovery.
   * @param serviceName
   * @param svc
   */
  #startCooldownTimer(serviceName, svc) {
    this.#clearCooldownTimer(svc);
    svc.cooldownTimer = setTimeout(() => {
      this.#transitionTo(serviceName, svc, CircuitState.HALF_OPEN);
    }, svc.cooldown);
  }

  /**
   * Clear an active cooldown timer.
   * @param svc
   */
  #clearCooldownTimer(svc) {
    if (svc.cooldownTimer !== null) {
      clearTimeout(svc.cooldownTimer);
      svc.cooldownTimer = null;
    }
  }

  /**
   * Format service data for status output.
   * @param svc
   */
  #formatStatus(svc) {
    return {
      state: svc.state,
      consecutiveFailures: svc.consecutiveFailures,
      lastFailure: svc.lastFailure,
      lastSuccess: svc.lastSuccess
    };
  }

  /**
   * Emit an event on the EventBus if available.
   * @param eventName
   * @param payload
   */
  #emitEvent(eventName, payload) {
    try {
      this.#eventBus?.emit(eventName, payload);
    } catch (err) {
      this.#logger.error(`Failed to emit ${eventName}:`, err);
    }
  }
}

/** Module-level singleton instance */
export const resilience = new ResilienceRegistry(defaultEventBus);
