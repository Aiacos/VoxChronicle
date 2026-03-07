/**
 * RulesLookupService - Orchestrates the full rules lookup lifecycle
 *
 * Provides a two-phase hybrid lookup:
 *   Phase 1: Instant compendium search (via RulesReference)
 *   Phase 2: Async AI synthesis (via OpenAIClient with gpt-4o)
 *
 * Features:
 * - Topic cooldown prevents duplicate auto-lookups within 5 minutes
 * - On-demand queries (skipCooldown) always execute
 * - AbortSignal support for lifecycle management
 *
 * @class RulesLookupService
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Stop words filtered during topic normalization
 * @constant {Set<string>}
 */
const STOP_WORDS = new Set([
  'how', 'does', 'do', 'what', 'is', 'the', 'rule', 'rules',
  'for', 'a', 'an', 'can', 'i', 'you', 'work', 'works', 'when', 'if'
]);

/**
 * Default cooldown duration in milliseconds (5 minutes)
 * @constant {number}
 */
const DEFAULT_COOLDOWN_MS = 300000;

/**
 * Maximum excerpt length per compendium result for synthesis prompt
 * @constant {number}
 */
const MAX_EXCERPT_LENGTH = 1500;

export class RulesLookupService {
  /**
   * Creates a new RulesLookupService instance
   * @param {import('./RulesReference.mjs').RulesReference} rulesReference - Rules search service
   * @param {import('../ai/OpenAIClient.mjs').OpenAIClient} openaiClient - OpenAI API client
   * @param {Object} [options={}] - Configuration options
   * @param {number} [options.cooldownMs=300000] - Cooldown duration in ms (default 5 minutes)
   * @param {Object} [options.logger] - Optional logger instance
   */
  constructor(rulesReference, openaiClient, options = {}) {
    this._rulesReference = rulesReference;
    this._openaiClient = openaiClient;
    this._cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this._logger = options.logger || Logger.createChild('RulesLookupService');

    /**
     * Cooldown map: normalized topic -> timestamp (Date.now())
     * @type {Map<string, number>}
     * @private
     */
    this._cooldownMap = new Map();
  }

  /**
   * Main entry point for rules lookup
   *
   * Returns immediate compendium results and a deferred synthesis promise.
   * Returns null if the topic is on cooldown (unless skipCooldown is true),
   * or if the question normalizes to empty.
   *
   * @param {string} question - The rules question to look up
   * @param {Object} [options={}] - Lookup options
   * @param {boolean} [options.skipCooldown=false] - Skip cooldown check (on-demand queries)
   * @param {AbortSignal} [options.signal] - Abort signal for cancellation
   * @returns {Promise<{compendiumResults: Array, synthesisPromise: Promise, topic: string}|null>}
   */
  async lookup(question, { skipCooldown = false, signal } = {}) {
    if (!question || typeof question !== 'string') {
      return null;
    }

    // Step 1: Normalize topic
    const topic = this._normalizeTopic(question);
    if (!topic) {
      return null;
    }

    // Step 2: Check cooldown (skip if on-demand)
    if (!skipCooldown && this._isOnCooldown(topic)) {
      this._logger.debug(`lookup() — topic "${topic}" is on cooldown, skipping`);
      return null;
    }

    // Step 3: Phase 1 — compendium search
    let compendiumResults = await this._rulesReference.searchRules(topic, { limit: 3 });

    // Step 4: Fallback to searchCompendiums if no results
    if (!compendiumResults || compendiumResults.length === 0) {
      this._logger.debug(`lookup() — no searchRules results, falling back to searchCompendiums`);
      compendiumResults = await this._rulesReference.searchCompendiums(topic, { limit: 3 });
    }

    // Step 5: Phase 2 — create synthesis promise (NOT awaited)
    // Skip synthesis when no compendium results — avoids misleading "Refining..." spinner
    const synthesisPromise = (compendiumResults && compendiumResults.length > 0)
      ? this._synthesize(question, compendiumResults, { signal })
      : null;

    // Step 6: Set cooldown (unless skipCooldown)
    if (!skipCooldown) {
      this._setCooldown(topic);
    }

    // Step 7: Return hybrid result
    return {
      compendiumResults,
      synthesisPromise,
      topic,
      question
    };
  }

  /**
   * Synthesizes a concise answer from compendium results using gpt-4o
   *
   * @param {string} question - The original question
   * @param {Array} compendiumResults - Compendium search results
   * @param {Object} [options={}] - Options
   * @param {AbortSignal} [options.signal] - Abort signal
   * @returns {Promise<{answer: string, citations: string[], usage: Object}>}
   * @private
   */
  async _synthesize(question, compendiumResults, { signal } = {}) {
    // Build excerpts from compendium results
    const excerpts = (compendiumResults || []).map(result => {
      const citation = result.rule.citation?.formatted || result.rule.source || 'Unknown';
      const content = (result.rule.content || '').substring(0, MAX_EXCERPT_LENGTH);
      return `[${citation}] ${result.rule.title}:\n${content}`;
    }).join('\n\n');

    const messages = [
      {
        role: 'system',
        content: 'You are a D&D 5e rules expert. Answer the question using ONLY the provided source excerpts. Cite sources in brackets (e.g., [PHB p. 195]). Keep your answer to 2-3 sentences maximum. If the provided sources are insufficient to answer the question, say so honestly.'
      },
      {
        role: 'user',
        content: `Question: ${question}\n\nSource Excerpts:\n${excerpts}`
      }
    ];

    const response = await this._openaiClient.post('/chat/completions', {
      model: 'gpt-4o',
      messages,
      temperature: 0.2,
      max_tokens: 300
    }, { signal });

    const answer = response?.choices?.[0]?.message?.content;
    if (!answer) {
      throw new Error('OpenAI returned an empty or filtered response for rules synthesis');
    }

    // Extract citations from compendium results
    const citations = (compendiumResults || [])
      .map(result => result.rule.citation?.formatted || result.rule.source)
      .filter(Boolean);

    return {
      answer,
      citations,
      usage: response.usage || null
    };
  }

  /**
   * Normalizes a topic string for cooldown deduplication
   *
   * Lowercases, splits on whitespace, filters stop words,
   * filters words shorter than 2 chars, sorts alphabetically,
   * and joins with space.
   *
   * @param {string} text - The text to normalize
   * @returns {string} Normalized topic key
   */
  _normalizeTopic(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .toLowerCase()
      .replace(/[?!.,;:'"]/g, '')
      .split(/\s+/)
      .filter(word => word.length >= 2 && !STOP_WORDS.has(word))
      .sort()
      .join(' ');
  }

  /**
   * Checks if a normalized topic is currently on cooldown
   * @param {string} normalizedTopic - The normalized topic key
   * @returns {boolean} True if on cooldown
   * @private
   */
  _isOnCooldown(normalizedTopic) {
    const timestamp = this._cooldownMap.get(normalizedTopic);
    if (!timestamp) return false;

    const elapsed = Date.now() - timestamp;
    if (elapsed >= this._cooldownMs) {
      this._cooldownMap.delete(normalizedTopic);
      return false;
    }

    return true;
  }

  /**
   * Sets cooldown for a normalized topic
   * @param {string} normalizedTopic - The normalized topic key
   * @private
   */
  _setCooldown(normalizedTopic) {
    this._cooldownMap.set(normalizedTopic, Date.now());
  }

  /**
   * Cleans up the service, clearing all cooldown state
   */
  destroy() {
    this._cooldownMap.clear();
    this._logger.debug('destroy() — cooldown map cleared');
  }
}
