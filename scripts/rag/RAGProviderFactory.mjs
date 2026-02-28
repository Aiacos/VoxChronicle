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
    logger.debug(`create() called — type="${type}", requested="${providerType || '(default)'}", configKeys=[${Object.keys(config).join(',')}]`);

    const ProviderClass = providerRegistry.get(type);

    if (!ProviderClass) {
      logger.warn(`Unknown RAG provider "${type}", falling back to "${DEFAULT_PROVIDER}"`);

      globalThis.ui?.notifications?.warn(
        globalThis.game?.i18n?.format('VOXCHRONICLE.Warnings.RAGProviderFallback', { requested: type, fallback: DEFAULT_PROVIDER })
          || `VoxChronicle: RAG provider "${type}" not found. Falling back to "${DEFAULT_PROVIDER}". Check your RAG settings.`
      );

      const FallbackClass = providerRegistry.get(DEFAULT_PROVIDER);

      if (!FallbackClass) {
        logger.error(`No fallback provider registered for "${DEFAULT_PROVIDER}"`);
        throw new Error(`No RAG provider available for type "${type}" and no fallback registered`);
      }

      logger.debug(`create() returning fallback provider: ${DEFAULT_PROVIDER}`);
      return new FallbackClass(config);
    }

    logger.debug(`create() returning provider: ${type}`);
    return new ProviderClass(config);
  }

  /**
   * Register a custom provider type
   * @param {string} type - Provider type identifier
   * @param {typeof import('./RAGProvider.mjs').RAGProvider} ProviderClass - Provider constructor
   */
  static register(type, ProviderClass) {
    logger.debug(`register() called — type="${type}", class="${ProviderClass?.name || '(invalid)'}"`);
    if (!type || typeof type !== 'string') {
      throw new Error('Provider type must be a non-empty string');
    }
    if (typeof ProviderClass !== 'function') {
      throw new Error('ProviderClass must be a constructor');
    }

    const isOverwrite = providerRegistry.has(type);
    providerRegistry.set(type, ProviderClass);
    logger.debug(`register() complete — type="${type}"${isOverwrite ? ' (overwritten)' : ' (new)'}`);
  }

  /**
   * Check if a provider type is registered
   * @param {string} type - Provider type identifier
   * @returns {boolean}
   */
  static has(type) {
    const result = providerRegistry.has(type);
    logger.debug(`has("${type}") → ${result}`);
    return result;
  }

  /**
   * Get all registered provider type identifiers
   * @returns {string[]}
   */
  static getAvailableProviders() {
    const providers = Array.from(providerRegistry.keys());
    logger.debug(`getAvailableProviders() → [${providers.join(', ')}]`);
    return providers;
  }
}
