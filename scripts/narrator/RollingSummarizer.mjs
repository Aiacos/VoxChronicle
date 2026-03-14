/**
 * RollingSummarizer - AI-Powered Rolling Summarization for VoxChronicle
 *
 * Compresses older conversation turns into a narrative summary using GPT-4o-mini
 * to prevent context window degradation over long sessions.
 *
 * @class RollingSummarizer
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Service that summarizes evicted conversation history turns into a rolling narrative.
 * Called by AIAssistant when conversation history exceeds the summarization trigger threshold.
 */
class RollingSummarizer {
  /** @type {import('../utils/Logger.mjs').Logger} */
  _logger = Logger.createChild('RollingSummarizer');

  /** @type {boolean} Concurrency guard to prevent overlapping summarization */
  _isSummarizing = false;

  /** @type {string} Current accumulated summary text */
  _currentSummary = '';

  /** @type {number} Number of turns that have been summarized */
  _summarizedTurnCount = 0;

  /**
   * @param {object} openaiClient - OpenAI client with createChatCompletion method
   * @param {object} [options={}] - Configuration options
   * @param {string} [options.model='gpt-4o-mini'] - Model to use for summarization
   * @param {number} [options.maxSummaryTokens=500] - Target max tokens for summary output
   */
  constructor(openaiClient, options = {}) {
    this._client = openaiClient;
    this._model = options.model || 'gpt-4o-mini';
    this._maxSummaryTokens = options.maxSummaryTokens || 500;
  }

  /**
   * Summarizes evicted conversation turns into a rolling narrative.
   *
   * If already summarizing (concurrency guard), returns existing summary immediately.
   * On API failure, returns existing summary gracefully without throwing.
   *
   * @param {string} existingSummary - Previous rolling summary (empty string on cold start)
   * @param {string} formattedTurns - Pre-formatted evicted turns text
   * @returns {Promise<{summary: string, usage: object | null}>} Summary result with optional usage data
   */
  async summarize(existingSummary, formattedTurns) {
    // Concurrency guard: skip if already in-flight
    if (this._isSummarizing) {
      return { summary: existingSummary, usage: null };
    }

    // Early return for empty turns
    if (!formattedTurns || formattedTurns.trim() === '') {
      return { summary: existingSummary, usage: null };
    }

    this._isSummarizing = true;
    try {
      const systemPrompt = `You are a session historian for a tabletop RPG game.
Your task is to compress conversation context into a concise narrative summary.

Rules:
- Preserve ALL key plot events, party decisions, and NPC interactions
- Maintain character names and specific details (locations, items, numbers)
- Use present tense for ongoing situations, past tense for completed events
- Keep the tone factual and structured
- Target approximately ${this._maxSummaryTokens} tokens (${this._maxSummaryTokens * 4} characters)
- Do NOT include meta-commentary about the summary itself`;

      const userPrompt = existingSummary
        ? `Here is the existing session summary:\n\n${existingSummary}\n\nHere are the new conversation turns to incorporate:\n\n${formattedTurns}\n\nProduce an updated summary that incorporates the new information while staying concise.`
        : `Here are the conversation turns from a tabletop RPG session:\n\n${formattedTurns}\n\nProduce a concise narrative summary of what has happened so far.`;

      const response = await this._client.createChatCompletion({
        model: this._model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: this._maxSummaryTokens * 2
      });

      const summary = response.choices[0].message.content;
      const usage = response.usage || null;

      this._logger.debug(`Summary generated (${summary.length} chars)`);

      return { summary, usage };
    } catch (error) {
      this._logger.warn('Summarization failed, keeping old summary:', error.message);
      return { summary: existingSummary, usage: null };
    } finally {
      this._isSummarizing = false;
    }
  }

  /**
   * Formats conversation history entries into readable text for summarization.
   *
   * For assistant entries containing JSON (analysis responses), extracts the
   * `.summary` field rather than passing raw JSON to the summarizer.
   *
   * @param {Array<{role: string, content: string}>} entries - Conversation history entries
   * @returns {string} Formatted text with one line per entry
   * @static
   */
  static formatTurnsForSummary(entries) {
    return entries
      .map((entry) => {
        if (entry.role === 'assistant') {
          try {
            const parsed = JSON.parse(entry.content);
            return `AI Summary: ${parsed.summary || 'No summary available'}`;
          } catch {
            return `AI: ${entry.content.substring(0, 200)}`;
          }
        }
        return `Player/DM: ${entry.content}`;
      })
      .join('\n');
  }
}

export { RollingSummarizer };
