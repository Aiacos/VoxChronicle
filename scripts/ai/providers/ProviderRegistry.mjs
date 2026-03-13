/**
 * ProviderRegistry - Central registry for AI provider instances
 *
 * Manages provider registration, capability-based selection, and defaults.
 * Emits events on the EventBus `ai:` channel for provider lifecycle changes.
 *
 * @class ProviderRegistry
 * @module vox-chronicle
 */

import { Logger } from '../../utils/Logger.mjs';
import { eventBus } from '../../core/EventBus.mjs';

export class ProviderRegistry {
  static #instance = null;

  /** @type {Map<string, {provider: Object, capabilities: string[]}>} */
  #providers = new Map();

  /** @type {Map<string, string>} capability → providerName */
  #defaults = new Map();

  #logger = Logger.createChild('ProviderRegistry');

  static getInstance() {
    if (!ProviderRegistry.#instance) {
      ProviderRegistry.#instance = new ProviderRegistry();
    }
    return ProviderRegistry.#instance;
  }

  static resetInstance() {
    ProviderRegistry.#instance = null;
  }

  /**
   * Register a provider instance.
   * @param {string} name - Unique provider name
   * @param {Object} providerInstance - Provider instance with static capabilities
   * @param {Object} [options={}]
   * @param {boolean} [options.default=false] - Set as default for all its capabilities
   */
  register(name, providerInstance, options = {}) {
    if (!providerInstance || typeof providerInstance !== 'object' || typeof providerInstance.constructor !== 'function') {
      throw new TypeError(`Cannot register '${name}': providerInstance must be a valid provider object`);
    }
    const capabilities = providerInstance.constructor.capabilities ?? [];

    if (this.#providers.has(name)) {
      this.#logger.warn(
        game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.AlreadyRegistered', { name })
          ?? `Provider '${name}' is already registered, overwriting`
      );
      // Clean up old defaults for this provider name
      for (const [cap, defName] of this.#defaults) {
        if (defName === name) {
          this.#defaults.delete(cap);
        }
      }
    }

    this.#providers.set(name, { provider: providerInstance, capabilities });

    // Auto-set default: if first provider for a capability, or explicit default
    for (const cap of capabilities) {
      if (options.default || !this.#defaults.has(cap)) {
        this.#defaults.set(cap, name);
      }
    }

    eventBus.emit('ai:providerRegistered', {
      providerName: name,
      capabilities: [...capabilities],
    });
  }

  /**
   * Get the default provider for a capability.
   * @param {string} capability
   * @returns {Object} Provider instance
   */
  getProvider(capability) {
    const providerName = this.#defaults.get(capability);
    if (!providerName) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NoProvider', { capability })
          ?? `No provider registered for capability: ${capability}`
      );
    }
    const entry = this.#providers.get(providerName);
    if (!entry) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotFound', { name: providerName })
          ?? `Provider '${providerName}' not found in registry`
      );
    }
    return entry.provider;
  }

  /**
   * Get a provider by its registered name.
   * @param {string} name
   * @returns {Object} Provider instance
   */
  getProviderByName(name) {
    const entry = this.#providers.get(name);
    if (!entry) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotFound', { name })
          ?? `Provider '${name}' not found in registry`
      );
    }
    return entry.provider;
  }

  /**
   * List all registered providers with their capabilities.
   * @returns {Object} Map of name → capabilities array
   */
  listProviders() {
    const result = {};
    for (const [name, { capabilities }] of this.#providers) {
      result[name] = [...capabilities];
    }
    return result;
  }

  /**
   * Change the default provider for a specific capability.
   * @param {string} name - Provider name
   * @param {string} capability - Capability to set default for
   */
  setDefault(name, capability) {
    const entry = this.#providers.get(name);
    if (!entry) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotFound', { name })
          ?? `Provider '${name}' not found in registry`
      );
    }

    if (!entry.capabilities.includes(capability)) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.ProviderCapabilityMismatch', { name, capability })
          ?? `Provider '${name}' does not support capability: ${capability}`
      );
    }

    this.#defaults.set(capability, name);

    eventBus.emit('ai:defaultChanged', {
      providerName: name,
      capability,
    });
  }

  /**
   * Remove a provider from the registry.
   * @param {string} name - Provider name to remove
   */
  unregister(name) {
    const entry = this.#providers.get(name);
    if (!entry) {
      throw new Error(
        game?.i18n?.format?.('VOXCHRONICLE.Provider.Error.NotFound', { name })
          ?? `Provider '${name}' not found in registry`
      );
    }

    const { capabilities } = entry;
    this.#providers.delete(name);

    // Clean up defaults and promote another provider if available
    for (const cap of capabilities) {
      if (this.#defaults.get(cap) === name) {
        this.#defaults.delete(cap);
        // Promote first remaining provider that supports this capability
        for (const [otherName, otherEntry] of this.#providers) {
          if (otherEntry.capabilities.includes(cap)) {
            this.#defaults.set(cap, otherName);
            break;
          }
        }
      }
    }

    eventBus.emit('ai:providerUnregistered', {
      providerName: name,
      capabilities: [...capabilities],
    });
  }
}
