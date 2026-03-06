/**
 * CostTracker - Token and Cost Monitoring Service
 *
 * Accumulates token counts from OpenAI API usage objects and computes
 * session cost from a model-specific pricing map. Supports cost cap
 * enforcement for session budget control.
 *
 * @class CostTracker
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * CostTracker class - Tracks API token usage and estimated costs
 *
 * @example
 * const tracker = new CostTracker();
 * tracker.addUsage('gpt-4o-mini', { prompt_tokens: 100, completion_tokens: 50 });
 * tracker.addTranscriptionMinutes(1.5);
 * console.log(tracker.getTotalCost()); // $0.000105
 * console.log(tracker.isCapExceeded(5.00)); // false
 */
class CostTracker {
  /**
   * Model-specific pricing map
   * Prices in dollars per token (for chat models) or per minute (for transcription)
   * @type {Object<string, {input?: number, output?: number, perMinute?: number}>}
   */
  static PRICING = {
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-transcribe': { perMinute: 0.006 },
    'gpt-4o-transcribe-diarize': { perMinute: 0.006 }
  };

  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('CostTracker');

  /**
   * Total input tokens accumulated
   * @type {number}
   * @private
   */
  _totalInputTokens = 0;

  /**
   * Total output tokens accumulated
   * @type {number}
   * @private
   */
  _totalOutputTokens = 0;

  /**
   * Total cost accumulated in dollars
   * @type {number}
   * @private
   */
  _totalCost = 0;

  /**
   * Total transcription minutes accumulated
   * @type {number}
   * @private
   */
  _transcriptionMinutes = 0;

  /**
   * Add token usage from a chat completion API response
   *
   * @param {string} model - The model name (e.g., 'gpt-4o-mini', 'gpt-4o')
   * @param {Object} usage - The usage object from the API response
   * @param {number} [usage.prompt_tokens] - Number of input tokens
   * @param {number} [usage.completion_tokens] - Number of output tokens
   */
  addUsage(model, usage) {
    const inputTokens = usage.prompt_tokens || 0;
    const outputTokens = usage.completion_tokens || 0;

    this._totalInputTokens += inputTokens;
    this._totalOutputTokens += outputTokens;

    const pricing = CostTracker.PRICING[model];
    if (pricing && pricing.input !== undefined) {
      this._totalCost += (inputTokens * pricing.input) + (outputTokens * pricing.output);
    } else if (!pricing) {
      this._logger.warn(`Unknown model "${model}" — tokens tracked but cost not computed`);
    }
  }

  /**
   * Add transcription time for audio billing
   * Transcription models are billed per minute, not per token.
   *
   * @param {number} minutes - Duration of audio transcribed in minutes
   */
  addTranscriptionMinutes(minutes) {
    this._transcriptionMinutes += minutes;
    this._totalCost += minutes * 0.006;
  }

  /**
   * Get the total accumulated cost in dollars
   *
   * @returns {number} Total cost in dollars
   */
  getTotalCost() {
    return this._totalCost;
  }

  /**
   * Get a summary of token usage and cost
   *
   * @returns {{inputTokens: number, outputTokens: number, totalTokens: number, transcriptionMinutes: number, totalCost: number}}
   */
  getTokenSummary() {
    return {
      inputTokens: this._totalInputTokens,
      outputTokens: this._totalOutputTokens,
      totalTokens: this._totalInputTokens + this._totalOutputTokens,
      transcriptionMinutes: this._transcriptionMinutes,
      totalCost: this._totalCost
    };
  }

  /**
   * Check if the cost cap has been exceeded
   *
   * @param {number} capAmount - The cost cap in dollars (0 = disabled)
   * @returns {boolean} True if totalCost >= cap (false if cap is 0/disabled)
   */
  isCapExceeded(capAmount) {
    if (capAmount <= 0) return false;
    return this._totalCost >= capAmount;
  }

  /**
   * Reset all accumulators to zero
   */
  reset() {
    this._totalInputTokens = 0;
    this._totalOutputTokens = 0;
    this._totalCost = 0;
    this._transcriptionMinutes = 0;
  }
}

export { CostTracker };
