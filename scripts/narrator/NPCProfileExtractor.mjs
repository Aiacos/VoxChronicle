/**
 * NPCProfileExtractor - Extracts structured NPC profiles from adventure journal text
 *
 * Uses a single LLM call to extract all named NPCs from journal content,
 * building a lookup Map keyed by lowercase name and aliases for O(1) access.
 *
 * @class NPCProfileExtractor
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

/**
 * Structured NPC profile extracted from adventure text
 * @typedef {object} NPCProfile
 * @property {string} name - Display name of the NPC
 * @property {string} personality - Personality description
 * @property {string} motivation - Primary motivation
 * @property {string} role - Role in the adventure (merchant, antagonist, ally, etc.)
 * @property {string} chapterLocation - Chapter/section where the NPC appears
 * @property {string[]} aliases - Alternative names for the NPC
 * @property {string[]} sessionNotes - Notes added during the session
 */

/**
 * Maximum session notes per NPC profile
 * @constant {number}
 */
const MAX_SESSION_NOTES = 10;

/**
 * Maximum NPC profiles to return from detectMentionedNPCs
 * @constant {number}
 */
const MAX_MENTIONED_RESULTS = 5;

/**
 * Minimum name length for mention detection (avoids false positives)
 * @constant {number}
 */
const MIN_NAME_LENGTH = 3;

/**
 * NPCProfileExtractor class - Extracts and manages NPC profiles from journal text
 *
 * @example
 * const extractor = new NPCProfileExtractor(openAIClient);
 * const profiles = await extractor.extractProfiles(journalText);
 * const mentioned = extractor.detectMentionedNPCs('Garrick entered the tavern');
 */
class NPCProfileExtractor {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('NPCProfileExtractor');

  /**
   * Creates a new NPCProfileExtractor instance
   *
   * @param {import('../ai/OpenAIClient.mjs').OpenAIClient} openAIClient - OpenAI client instance
   * @param {object} [options={}] - Configuration options
   * @param {string} [options.model='gpt-4o-mini'] - The model to use for extraction
   */
  constructor(openAIClient, options = {}) {
    /**
     * OpenAI client instance
     * @type {import('../ai/OpenAIClient.mjs').OpenAIClient}
     * @private
     */
    this._client = openAIClient;

    /**
     * Model to use for chat completions
     * @type {string}
     * @private
     */
    this._model = options.model || 'gpt-4o-mini';

    /**
     * Stored NPC profiles Map keyed by lowercase name/alias
     * @type {Map<string, NPCProfile>}
     * @private
     */
    this._profiles = new Map();
  }

  // ---------------------------------------------------------------------------
  // Public methods
  // ---------------------------------------------------------------------------

  /**
   * Extracts NPC profiles from adventure journal text via a single LLM call
   *
   * @param {string} journalText - The adventure journal text to extract NPCs from
   * @param {object} [options={}] - Extraction options
   * @returns {Promise<Map<string, NPCProfile>>} Map keyed by lowercase NPC name/alias
   */
  async extractProfiles(journalText, options = {}) {
    if (!journalText) {
      this._profiles = new Map();
      return this._profiles;
    }

    const systemPrompt = `You are an NPC extraction engine for tabletop RPG adventures. Extract ALL named NPCs across ALL chapters from the provided adventure text.

Return a JSON object with this exact structure:
{
  "npcs": [
    {
      "name": "Display Name",
      "personality": "Brief personality description",
      "motivation": "Primary motivation or goal",
      "role": "merchant|antagonist|ally|quest-giver|guard|noble|etc.",
      "chapterLocation": "Chapter X: Section Name",
      "aliases": ["Alternative Name", "Nickname"]
    }
  ]
}

RULES:
- Base ALL profiles strictly on the provided text. Do NOT invent or assume details not present.
- Include every named NPC, even minor ones mentioned briefly.
- If personality or motivation is not stated, use "Not specified" rather than inventing.
- Aliases include nicknames, titles, or alternative references used in the text.

Example output:
{
  "npcs": [
    {
      "name": "Garrick",
      "personality": "Jovial facade hiding deep anxiety",
      "motivation": "Protect his family from the guild",
      "role": "merchant",
      "chapterLocation": "Chapter 3: The Thieves Guild",
      "aliases": ["Garrick the Merchant", "Old Garrick"]
    }
  ]
}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Extract all named NPCs from this adventure text:\n\n${journalText}`
      }
    ];

    try {
      const response = await this._client.post('/chat/completions', {
        model: this._model,
        messages,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      });

      const content = response.choices?.[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);

      if (!parsed.npcs || !Array.isArray(parsed.npcs) || parsed.npcs.length === 0) {
        this._logger.warn('LLM returned no NPCs from journal text');
        this._profiles = new Map();
        return this._profiles;
      }

      this._profiles = this._buildProfileMap(parsed.npcs);
      this._logger.info(`Extracted ${parsed.npcs.length} NPC profiles`);
      return this._profiles;
    } catch (error) {
      this._logger.error('Failed to extract NPC profiles:', error.message);
      throw error;
    }
  }

  /**
   * Adds a session note to a specific NPC profile
   *
   * @param {string} npcName - The NPC name (case-insensitive)
   * @param {string} note - The note to add
   */
  addSessionNote(npcName, note) {
    const profile = this._profiles.get(npcName.toLowerCase());
    if (!profile) {
      this._logger.debug(`NPC "${npcName}" not found in profiles, skipping note`);
      return;
    }

    profile.sessionNotes.push(note);

    // Cap at MAX_SESSION_NOTES, keeping the most recent
    if (profile.sessionNotes.length > MAX_SESSION_NOTES) {
      profile.sessionNotes.splice(0, profile.sessionNotes.length - MAX_SESSION_NOTES);
    }
  }

  /**
   * Detects which NPCs from the profile roster are mentioned in context text
   *
   * Uses word-boundary regex matching. Skips names shorter than MIN_NAME_LENGTH
   * characters to avoid false positives. Deduplicates by profile name.
   * Caps results at MAX_MENTIONED_RESULTS.
   *
   * @param {string} contextText - The text to search for NPC mentions
   * @returns {NPCProfile[]} Array of matched NPC profiles (deduplicated, capped at 5)
   */
  detectMentionedNPCs(contextText) {
    if (!contextText || this._profiles.size === 0) {
      return [];
    }

    const seen = new Set();
    const results = [];

    for (const [key, profile] of this._profiles) {
      // Skip short names to avoid false positives
      if (key.length < MIN_NAME_LENGTH) {
        continue;
      }

      // Skip if we already matched this profile (deduplication by canonical name)
      if (seen.has(profile.name)) {
        continue;
      }

      // Word-boundary match (case-insensitive)
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${  escapedKey  }\\b`, 'i');

      if (regex.test(contextText)) {
        seen.add(profile.name);
        results.push(profile);

        if (results.length >= MAX_MENTIONED_RESULTS) {
          break;
        }
      }
    }

    return results;
  }

  /**
   * Returns the stored profiles Map
   *
   * @returns {Map<string, NPCProfile>} The profiles Map
   */
  getProfiles() {
    return this._profiles;
  }

  /**
   * Clears all stored profiles
   */
  clear() {
    this._profiles = new Map();
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  /**
   * Builds a Map from an array of NPC data, keyed by lowercase name and aliases
   *
   * @param {object[]} npcs - Array of raw NPC objects from LLM response
   * @returns {Map<string, NPCProfile>} Profiles map
   * @private
   */
  _buildProfileMap(npcs) {
    const map = new Map();

    for (const npc of npcs) {
      /** @type {NPCProfile} */
      const profile = {
        name: npc.name || 'Unknown',
        personality: npc.personality || 'Not specified',
        motivation: npc.motivation || 'Not specified',
        role: npc.role || 'npc',
        chapterLocation: npc.chapterLocation || '',
        aliases: Array.isArray(npc.aliases) ? npc.aliases : [],
        sessionNotes: []
      };

      // Key by lowercase canonical name
      map.set(profile.name.toLowerCase(), profile);

      // Key aliases to the same profile object
      for (const alias of profile.aliases) {
        if (alias) {
          map.set(alias.toLowerCase(), profile);
        }
      }
    }

    return map;
  }
}

export { NPCProfileExtractor };
