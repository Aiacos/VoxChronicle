/**
 * EventBus - Observer pattern with typed channels and middleware support
 *
 * Foundation for decoupled communication between VoxChronicle services.
 * All events follow the format `channel:actionCamelCase` with object payloads.
 *
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/** Valid channel names for event routing */
const VALID_CHANNELS = Object.freeze([
  'ai',
  'audio',
  'scene',
  'session',
  'ui',
  'error',
  'analytics'
]);

/**
 * Internal event bus with typed channels and middleware pipeline.
 */
export class EventBus {
  /** @type {Map<string, Set<Function>>} */
  #subscribers = new Map();

  /** @type {Function[]} */
  #middleware = [];

  #logger = Logger.createChild('EventBus');

  constructor() {
    // Register built-in logging middleware
    this.use((channel, event, payload, next) => {
      if (Logger.isDebugMode()) {
        this.#logger.debug(`[${channel}:${event}]`, payload);
      }
      next();
    });
  }

  /**
   * Parse and validate an event name in `channel:action` format.
   * @param {string} eventName
   * @returns {{ channel: string, action: string }}
   */
  #parseEvent(eventName) {
    const colonIdx = eventName.indexOf(':');
    if (colonIdx === -1) {
      throw new Error(
        game?.i18n?.localize('VOXCHRONICLE.EventBus.Error.InvalidFormat') ??
          `Invalid event format: "${eventName}". Expected "channel:action".`
      );
    }
    const channel = eventName.slice(0, colonIdx);
    const action = eventName.slice(colonIdx + 1);

    if (!VALID_CHANNELS.includes(channel)) {
      throw new Error(
        game?.i18n?.localize('VOXCHRONICLE.EventBus.Error.ChannelNotFound') ??
          `Unknown channel: "${channel}". Valid channels: ${VALID_CHANNELS.join(', ')}`
      );
    }

    return { channel, action };
  }

  /**
   * Validate that payload is a plain object.
   * @param {*} payload
   */
  #validatePayload(payload) {
    if (
      payload === null ||
      payload === undefined ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      throw new TypeError(
        game?.i18n?.localize('VOXCHRONICLE.EventBus.Error.InvalidPayload') ??
          `Invalid payload: expected a plain object, got ${payload === null ? 'null' : typeof payload}`
      );
    }
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * @param {string} eventName - Format: `channel:action`
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(eventName, callback) {
    this.#parseEvent(eventName); // validates channel

    if (!this.#subscribers.has(eventName)) {
      this.#subscribers.set(eventName, new Set());
    }
    this.#subscribers.get(eventName).add(callback);

    return () => this.off(eventName, callback);
  }

  /**
   * Remove a specific subscriber.
   * @param {string} eventName - Format: `channel:action`
   * @param {Function} callback
   */
  off(eventName, callback) {
    const subs = this.#subscribers.get(eventName);
    if (subs) {
      subs.delete(callback);
    }
  }

  /**
   * Subscribe to an event, auto-removing after first invocation.
   * @param {string} eventName - Format: `channel:action`
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  once(eventName, callback) {
    const wrapper = (payload) => {
      this.off(eventName, wrapper);
      callback(payload);
    };
    return this.on(eventName, wrapper);
  }

  /**
   * Emit an event to all subscribers on the matching channel:action.
   * Middleware executes first; subscribers execute synchronously.
   * @param {string} eventName - Format: `channel:action`
   * @param {object} payload - Must be a plain object
   */
  emit(eventName, payload) {
    const { channel, action } = this.#parseEvent(eventName);
    this.#validatePayload(payload);

    // Execute middleware chain — sentinel tracks intentional blocking vs errors
    let chainCompleted = false;
    const chain = [...this.#middleware];

    const runChain = (index) => {
      if (index >= chain.length) {
        chainCompleted = true;
        return;
      }
      try {
        chain[index](channel, action, payload, () => runChain(index + 1));
      } catch (err) {
        this.#logger.error(`Middleware error on ${eventName}:`, err);
        // Error isolation: continue to next middleware despite error
        runChain(index + 1);
      }
    };

    runChain(0);

    if (!chainCompleted) return; // Middleware intentionally blocked

    // Dispatch to subscribers — snapshot the Set to handle once() self-removal
    const subs = this.#subscribers.get(eventName);
    if (!subs || subs.size === 0) return;

    const snapshot = [...subs];
    for (const callback of snapshot) {
      try {
        callback(payload);
      } catch (err) {
        this.#logger.error(`Subscriber error on ${eventName}:`, err);
      }
    }
  }

  /**
   * Add a middleware function to the pipeline.
   * @param {Function} fn - Signature: (channel, event, payload, next) => void
   */
  use(fn) {
    this.#middleware.push(fn);
  }

  /**
   * Remove all listeners, optionally filtered by channel.
   * @param {string} [channel] - If provided, only remove listeners for this channel
   */
  removeAllListeners(channel) {
    if (channel) {
      for (const key of this.#subscribers.keys()) {
        if (key.startsWith(`${channel  }:`)) {
          this.#subscribers.delete(key);
        }
      }
    } else {
      this.#subscribers.clear();
    }
  }

  /**
   * Get the number of listeners for a specific event.
   * @param {string} eventName - Format: `channel:action`
   * @returns {number}
   */
  listenerCount(eventName) {
    const subs = this.#subscribers.get(eventName);
    return subs ? subs.size : 0;
  }

  /**
   * Get the list of valid channels.
   * @returns {ReadonlyArray<string>}
   */
  channels() {
    return VALID_CHANNELS;
  }
}

/** Module-level singleton instance */
export const eventBus = new EventBus();
