/**
 * RAGProviderFactory - Factory for creating RAG provider instances
 *
 * Creates the appropriate RAGProvider implementation based on settings.
 * Supports registration of custom providers for extensibility.
 *
 * @class RAGProviderFactory
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { OpenAIFileSearchProvider } from './OpenAIFileSearchProvider.mjs';
import { RAGFlowProvider } from './RAGFlowProvider.mjs';

const logger = Logger.createChild('RAGProviderFactory');

/**
 * Default provider type
 * @constant {string}
 */
const DEFAULT_PROVIDER = 'openai-file-search';

/**
 * Registry of available provider constructors
 * @type {Map<string, typeof import('./RAGProvider.mjs').RAGProvider>}
 */
const providerRegistry = new Map([
  ['openai-file-search', OpenAIFileSearchProvider],
  ['ragflow', RAGFlowProvider]
]);

export class RAGProviderFactory {
  /**
   * Create a RAG provider instance
   * @param {string} [providerType] - Provider type identifier (default: from settings or 'openai-file-search')
   * @param {object} [config] - Provider-specific configuration
   * @returns {import('./RAGProvider.mjs').RAGProvider} Provider instance (not yet initialized)
   * @throws {Error} If provider type is unknown and no fallback available
   */
  static create(providerType, config = {}) {
    const type = providerType || DEFAULT_PROVIDER;

    const ProviderClass = providerRegistry.get(type);

    if (!ProviderClass) {
      logger.warn(`Unknown RAG provider "${type}", falling back to "${DEFAULT_PROVIDER}"`);
      const FallbackClass = providerRegistry.get(DEFAULT_PROVIDER);

      if (!FallbackClass) {
        throw new Error(`No RAG provider available for type "${type}" and no fallback registered`);
      }

      return new FallbackClass(config);
    }

    logger.debug(`Creating RAG provider: ${type}`);
    return new ProviderClass(config);
  }

  /**
   * Register a custom provider type
   * @param {string} type - Provider type identifier
   * @param {typeof import('./RAGProvider.mjs').RAGProvider} ProviderClass - Provider constructor
   */
  static register(type, ProviderClass) {
    if (!type || typeof type !== 'string') {
      throw new Error('Provider type must be a non-empty string');
    }
    if (typeof ProviderClass !== 'function') {
      throw new Error('ProviderClass must be a constructor');
    }

    logger.debug(`Registering RAG provider: ${type}`);
    providerRegistry.set(type, ProviderClass);
  }

  /**
   * Check if a provider type is registered
   * @param {string} type - Provider type identifier
   * @returns {boolean}
   */
  static has(type) {
    return providerRegistry.has(type);
  }

  /**
   * Get all registered provider type identifiers
   * @returns {string[]}
   */
  static getAvailableProviders() {
    return Array.from(providerRegistry.keys());
  }
}
