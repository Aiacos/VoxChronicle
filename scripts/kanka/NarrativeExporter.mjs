/**
 * NarrativeExporter - Format Transcripts as Kanka Journal Entries
 *
 * Provides formatting and export utilities to transform session transcripts
 * into well-structured Kanka journal entries (chronicles). Supports both
 * raw transcript formatting and AI-enhanced narrative summaries.
 *
 * Integration with TranscriptionService/OpenAI enables AI-powered summary
 * generation for richer, more narrative-style chronicles.
 *
 * @class NarrativeExporter
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';
import { OpenAIClient } from '../ai/OpenAIClient.mjs';
import { escapeHtml } from '../utils/HtmlUtils.mjs';
import { AudioUtils } from '../utils/AudioUtils.mjs';

/**
 * Chronicle format types
 * @enum {string}
 */
const ChronicleFormat = {
  /** Raw transcript with speaker labels */
  TRANSCRIPT: 'transcript',
  /** Narrative prose format */
  NARRATIVE: 'narrative',
  /** Bullet-point summary */
  SUMMARY: 'summary',
  /** Combined transcript and summary */
  FULL: 'full'
};

/**
 * HTML formatting styles for chronicles
 * @enum {string}
 */
const FormattingStyle = {
  /** Clean, minimal HTML */
  MINIMAL: 'minimal',
  /** Rich formatting with sections */
  RICH: 'rich',
  /** Kanka-compatible markdown */
  MARKDOWN: 'markdown'
};

/**
 * NarrativeExporter class for formatting transcripts as Kanka journal entries
 *
 * @example
 * const exporter = new NarrativeExporter();
 * const chronicle = exporter.formatChronicle({
 *   title: 'Session 1 - The Beginning',
 *   date: '2024-01-15',
 *   segments: transcriptionResult.segments
 * });
 */
class NarrativeExporter {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('NarrativeExporter');

  /**
   * Default formatting style
   * @type {string}
   * @private
   */
  _defaultStyle = FormattingStyle.RICH;

  /**
   * Default chronicle format
   * @type {string}
   * @private
   */
  _defaultFormat = ChronicleFormat.FULL;

  /**
   * Campaign name for chronicle headers
   * @type {string}
   * @private
   */
  _campaignName = '';

  /**
   * OpenAI client for AI-enhanced summaries
   * @type {OpenAIClient|null}
   * @private
   */
  _openAIClient = null;

  /**
   * Whether AI summaries are enabled
   * @type {boolean}
   * @private
   */
  _aiSummaryEnabled = false;

  /**
   * Create a new NarrativeExporter instance
   *
   * @param {object} [options] - Configuration options
   * @param {string} [options.campaignName] - Campaign name for headers
   * @param {string} [options.defaultStyle='rich'] - Default formatting style
   * @param {string} [options.defaultFormat='full'] - Default chronicle format
   * @param {string} [options.openAIApiKey] - OpenAI API key for AI-enhanced summaries
   * @param {OpenAIClient} [options.openAIClient] - Existing OpenAI client instance
   */
  constructor(options = {}) {
    this._campaignName = options.campaignName || '';
    this._defaultStyle = options.defaultStyle || FormattingStyle.RICH;
    this._defaultFormat = options.defaultFormat || ChronicleFormat.FULL;

    // Initialize OpenAI client for AI summaries if credentials provided
    if (options.openAIClient) {
      this._openAIClient = options.openAIClient;
      this._aiSummaryEnabled = true;
    } else if (options.openAIApiKey) {
      this._openAIClient = new OpenAIClient(options.openAIApiKey);
      this._aiSummaryEnabled = true;
    }

    this._logger.debug('NarrativeExporter initialized', {
      aiSummaryEnabled: this._aiSummaryEnabled
    });
  }

  // ============================================================================
  // Main Formatting Methods
  // ============================================================================

  /**
   * Format a complete chronicle from session data
   *
   * @param {object} sessionData - Session data to format
   * @param {string} sessionData.title - Chronicle title
   * @param {string} [sessionData.date] - Session date (YYYY-MM-DD or Date object)
   * @param {Array<TranscriptSegment>} sessionData.segments - Transcript segments with speaker/text
   * @param {object} [sessionData.entities] - Extracted entities (characters, locations, items)
   * @param {Array<SalientMoment>} [sessionData.moments] - Identified salient moments
   * @param {string} [sessionData.summary] - AI-generated summary
   * @param {object} [options] - Formatting options
   * @param {string} [options.format] - Chronicle format (transcript, narrative, summary, full)
   * @param {string} [options.style] - Formatting style (minimal, rich, markdown)
   * @param {boolean} [options.includeEntities=true] - Include entity mentions
   * @param {boolean} [options.includeMoments=true] - Include salient moments
   * @param {boolean} [options.includeTimestamps=false] - Include segment timestamps
   * @returns {ChronicleResult} Formatted chronicle ready for Kanka
   */
  formatChronicle(sessionData, options = {}) {
    if (!sessionData) {
      throw new Error('Session data is required');
    }

    const format = options.format || this._defaultFormat;
    const style = options.style || this._defaultStyle;
    const includeEntities = options.includeEntities ?? true;
    const includeMoments = options.includeMoments ?? true;
    const includeTimestamps = options.includeTimestamps ?? false;

    this._logger.debug(
      `formatChronicle: title="${sessionData.title}", segments=${sessionData.segments?.length || 0}, entities=${this._countEntities(sessionData.entities)}, moments=${sessionData.moments?.length || 0}`
    );
    this._logger.log(
      `Formatting chronicle: ${sessionData.title} (format: ${format}, style: ${style})`
    );

    let content = '';

    // Format based on style
    if (style === FormattingStyle.MARKDOWN) {
      content = this._formatAsMarkdown(sessionData, format, {
        includeEntities,
        includeMoments,
        includeTimestamps
      });
    } else {
      content = this._formatAsHTML(sessionData, format, {
        includeEntities,
        includeMoments,
        includeTimestamps,
        isRich: style === FormattingStyle.RICH
      });
    }

    // Build the result
    const result = {
      name: sessionData.title || 'Untitled Session',
      entry: content,
      type: 'Session Chronicle',
      date: this._formatDate(sessionData.date),
      is_private: sessionData.is_private ?? false,
      meta: {
        segmentCount: sessionData.segments?.length || 0,
        entityCount: this._countEntities(sessionData.entities),
        momentCount: sessionData.moments?.length || 0,
        format,
        style,
        generatedAt: new Date().toISOString()
      }
    };

    this._logger.log(`Chronicle formatted: ${result.name} (${content.length} chars)`);

    return result;
  }

  /**
   * Generate a summary from transcript segments
   * Note: For AI-enhanced summaries, use the TranscriptionService integration
   *
   * @param {Array<TranscriptSegment>} segments - Transcript segments
   * @param {object} [options] - Summary options
   * @param {number} [options.maxLength=500] - Maximum summary length in characters
   * @param {boolean} [options.includeSpeakers=true] - Include speaker mentions
   * @param {number} [options.highlightCount=5] - Number of key points to highlight
   * @returns {string} Generated summary
   */
  generateSummary(segments, options = {}) {
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return 'No transcript segments available.';
    }

    const maxLength = options.maxLength || 500;
    const includeSpeakers = options.includeSpeakers ?? true;
    const highlightCount = options.highlightCount || 5;

    this._logger.debug(`Generating summary from ${segments.length} segments`);

    // Collect speaker statistics
    const speakerStats = this._analyzeSpeakers(segments);

    // Get total word count
    const totalWords = segments.reduce((sum, seg) => {
      return sum + (seg.text || '').split(/\s+/).length;
    }, 0);

    // Build summary parts
    const parts = [];

    // Opening line with session overview
    const speakerNames = Object.keys(speakerStats);
    if (includeSpeakers && speakerNames.length > 0) {
      parts.push(
        `This session featured ${speakerNames.length} participants: ${speakerNames.join(', ')}.`
      );
    }

    // Add duration info if timestamps available
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    if (firstSegment?.start !== undefined && lastSegment?.end !== undefined) {
      const durationMinutes = Math.round((lastSegment.end - firstSegment.start) / 60);
      if (durationMinutes > 0) {
        parts.push(`The recording spans approximately ${durationMinutes} minutes.`);
      }
    }

    // Add word count
    parts.push(`Total transcript contains approximately ${totalWords} words.`);

    // Extract key phrases/highlights (simple extraction)
    const highlights = this._extractHighlights(segments, highlightCount);
    if (highlights.length > 0) {
      parts.push(`\n\nKey moments included:`);
      highlights.forEach((h) => {
        parts.push(`• ${h}`);
      });
    }

    let summary = parts.join(' ');

    // Truncate if too long
    if (summary.length > maxLength) {
      summary = `${summary.substring(0, maxLength - 3)}...`;
    }

    this._logger.debug(`generateSummary: produced ${summary.length} chars from ${segments.length} segments`);
    return summary;
  }

  /**
   * Generate an AI-enhanced narrative summary using OpenAI
   *
   * This method uses the OpenAI Chat Completions API to generate a rich,
   * narrative-style summary of the session transcript. Requires OpenAI
   * integration to be configured (via TranscriptionService or API key).
   *
   * @param {Array<TranscriptSegment>} segments - Transcript segments
   * @param {object} [options] - Summary options
   * @param {number} [options.maxLength=1000] - Maximum summary length in characters
   * @param {string} [options.style='narrative'] - Summary style ('narrative', 'bullet', 'formal')
   * @param {string} [options.campaignContext] - Additional context about the campaign
   * @param {object} [options.entities] - Known entities to reference
   * @returns {Promise<AISummaryResult>} AI-generated summary with metadata
   * @throws {Error} If OpenAI integration is not configured
   */
  async generateAISummary(segments, options = {}) {
    if (!this._aiSummaryEnabled || !this._openAIClient) {
      throw new Error(
        'AI summary generation requires OpenAI integration. Configure with openAIApiKey or openAIClient option.'
      );
    }

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return {
        summary: 'No transcript segments available for AI summary.',
        success: false,
        error: 'Empty segments'
      };
    }

    const maxLength = options.maxLength || 1000;
    const style = options.style || 'narrative';
    const campaignContext = options.campaignContext || this._campaignName || '';

    this._logger.log(`Generating AI summary from ${segments.length} segments (style: ${style})`);
    const aiStartTime = Date.now();

    // Build the transcript text for the AI
    const transcriptText = this._buildTranscriptText(segments);
    this._logger.debug(`generateAISummary: transcript text length=${transcriptText.length} chars`);

    // Build the system prompt based on style
    const systemPrompt = this._buildAISummaryPrompt(
      style,
      maxLength,
      campaignContext,
      options.entities
    );

    try {
      const response = await this._openAIClient.post('/chat/completions', {
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Summarize this RPG session transcript:\n\n${transcriptText}` }
        ],
        temperature: 0.7,
        max_tokens: Math.ceil(maxLength / 3) // Approximate tokens from chars
      });

      const aiSummary = response.choices?.[0]?.message?.content || '';
      const aiElapsed = Date.now() - aiStartTime;

      this._logger.log(`AI summary generated in ${aiElapsed}ms (${aiSummary.length} chars)`);

      return {
        summary: aiSummary.trim(),
        success: true,
        model: 'gpt-4o',
        style,
        segmentCount: segments.length,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      this._logger.error('AI summary generation failed:', error.message);

      // Fall back to basic summary on error
      const fallbackSummary = this.generateSummary(segments, { maxLength });

      return {
        summary: fallbackSummary,
        success: false,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Build transcript text from segments for AI processing
   *
   * @param {Array<TranscriptSegment>} segments - Transcript segments
   * @returns {string} Formatted transcript text
   * @private
   */
  _buildTranscriptText(segments) {
    const groupedSegments = this._groupBySpeaker(segments);
    return groupedSegments.map((seg) => `${seg.speaker}: ${seg.text}`).join('\n\n');
  }

  /**
   * Build the system prompt for AI summary generation
   *
   * @param {string} style - Summary style
   * @param {number} maxLength - Maximum length
   * @param {string} campaignContext - Campaign context
   * @param {object} entities - Known entities
   * @returns {string} System prompt
   * @private
   */
  _buildAISummaryPrompt(style, maxLength, campaignContext, entities) {
    const basePrompt = `You are an expert chronicler for tabletop RPG campaigns. Your task is to summarize a session transcript into an engaging chronicle entry.`;

    const styleInstructions = {
      narrative: `Write in a narrative prose style, as if telling a story. Use vivid language and bring the events to life. Focus on key plot developments, character interactions, and dramatic moments.`,
      bullet: `Create a clear, organized bullet-point summary. Group related events together. Highlight key decisions, encounters, discoveries, and NPC interactions.`,
      formal: `Write in a formal chronicle style, documenting events objectively. Include key dates, locations, and participants. Maintain a historical record tone.`
    };

    const styleInstruction = styleInstructions[style] || styleInstructions.narrative;

    let prompt = `${basePrompt}\n\n${styleInstruction}\n\nKeep the summary under ${maxLength} characters.`;

    if (campaignContext) {
      prompt += `\n\nCampaign context: ${campaignContext}`;
    }

    if (entities) {
      const entityInfo = [];
      if (entities.characters?.length) {
        entityInfo.push(`Characters: ${entities.characters.map((c) => c.name).join(', ')}`);
      }
      if (entities.locations?.length) {
        entityInfo.push(`Locations: ${entities.locations.map((l) => l.name).join(', ')}`);
      }
      if (entityInfo.length > 0) {
        prompt += `\n\nKnown entities to reference: ${entityInfo.join('. ')}`;
      }
    }

    prompt += `\n\nDo not include meta-commentary or notes. Output only the summary text.`;

    return prompt;
  }

  /**
   * Check if AI summary generation is available
   *
   * @returns {boolean} True if AI summaries can be generated
   */
  isAISummaryEnabled() {
    return this._aiSummaryEnabled && this._openAIClient !== null;
  }

  /**
   * Configure OpenAI integration for AI summaries
   *
   * @param {string|OpenAIClient} clientOrKey - OpenAI API key or client instance
   */
  setOpenAIClient(clientOrKey) {
    this._logger.debug(`setOpenAIClient: type=${typeof clientOrKey}`);
    if (typeof clientOrKey === 'string') {
      this._openAIClient = new OpenAIClient(clientOrKey);
    } else if (clientOrKey instanceof OpenAIClient) {
      this._openAIClient = clientOrKey;
    } else {
      this._openAIClient = null;
    }

    this._aiSummaryEnabled = this._openAIClient !== null;
    this._logger.debug(`OpenAI integration ${this._aiSummaryEnabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Export session data to Kanka journal format
   *
   * @param {object} sessionData - Complete session data
   * @param {object} [options] - Export options
   * @returns {KankaJournalData} Data ready for KankaService.createJournal()
   */
  export(sessionData, options = {}) {
    this._logger.debug(`export: title="${sessionData?.title}", format=${options.format || this._defaultFormat}, style=${options.style || this._defaultStyle}`);
    const chronicle = this.formatChronicle(sessionData, options);

    this._logger.debug(`export: produced entry of ${chronicle.entry?.length || 0} chars`);
    return {
      name: chronicle.name,
      entry: chronicle.entry,
      type: chronicle.type,
      date: chronicle.date,
      is_private: chronicle.is_private,
      // Include any additional Kanka-specific fields
      ...(options.location_id && { location_id: options.location_id }),
      ...(options.character_id && { character_id: options.character_id }),
      ...(options.journal_id && { journal_id: options.journal_id }),
      ...(options.tags && { tags: options.tags })
    };
  }

  /**
   * Export multiple sessions as a batch
   *
   * @param {Array<object>} sessions - Array of session data objects
   * @param {object} [options] - Export options for all sessions
   * @returns {Array<KankaJournalData>} Array of journal data ready for batch creation
   */
  exportBatch(sessions, options = {}) {
    if (!sessions || !Array.isArray(sessions)) {
      return [];
    }

    this._logger.log(`Exporting batch of ${sessions.length} sessions`);

    const results = sessions
      .map((session, index) => {
        try {
          return this.export(session, options);
        } catch (error) {
          this._logger.error(`Failed to export session ${index}: ${error.message}`);
          return null;
        }
      })
      .filter(Boolean);

    this._logger.debug(`exportBatch: exported ${results.length}/${sessions.length} sessions`);
    return results;
  }

  // ============================================================================
  // Transcript Formatting
  // ============================================================================

  /**
   * Format transcript segments as readable dialogue
   *
   * @param {Array<TranscriptSegment>} segments - Transcript segments
   * @param {object} [options] - Formatting options
   * @param {boolean} [options.includeTimestamps=false] - Include timestamps
   * @param {boolean} [options.groupBySpeaker=true] - Merge consecutive segments from same speaker
   * @returns {string} Formatted transcript text
   */
  formatTranscript(segments, options = {}) {
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      this._logger.debug('formatTranscript: no segments provided');
      return '';
    }

    this._logger.debug(`formatTranscript: ${segments.length} segments, timestamps=${options.includeTimestamps ?? false}, groupBySpeaker=${options.groupBySpeaker ?? true}`);
    const includeTimestamps = options.includeTimestamps ?? false;
    const groupBySpeaker = options.groupBySpeaker ?? true;

    let formattedSegments = segments;

    // Group consecutive segments from the same speaker
    if (groupBySpeaker) {
      formattedSegments = this._groupBySpeaker(segments);
    }

    // Format each segment
    const lines = formattedSegments.map((segment) => {
      const speaker = segment.speaker || 'Unknown';
      const text = (segment.text || '').trim();

      if (includeTimestamps && segment.start !== undefined) {
        const timestamp = AudioUtils.formatDuration(segment.start);
        return `[${timestamp}] **${speaker}:** ${text}`;
      }

      return `**${speaker}:** ${text}`;
    });

    const result = lines.join('\n\n');
    this._logger.debug(`formatTranscript: produced ${result.length} chars`);
    return result;
  }

  // ============================================================================
  // HTML Formatting
  // ============================================================================

  /**
   * Format chronicle as HTML content
   *
   * @param {object} sessionData - Session data
   * @param {string} format - Chronicle format
   * @param {object} options - Formatting options
   * @returns {string} HTML content
   * @private
   */
  _formatAsHTML(sessionData, format, options) {
    const parts = [];
    const isRich = options.isRich ?? true;

    // Header section
    if (isRich && this._campaignName) {
      parts.push(`<p><em>${escapeHtml(this._campaignName)}</em></p>`);
    }

    // Summary section
    if (
      sessionData.summary &&
      (format === ChronicleFormat.SUMMARY || format === ChronicleFormat.FULL)
    ) {
      parts.push('<h2>Summary</h2>');
      parts.push(`<p>${escapeHtml(sessionData.summary)}</p>`);
    } else if (format === ChronicleFormat.SUMMARY || format === ChronicleFormat.FULL) {
      // Generate basic summary
      const summary = this.generateSummary(sessionData.segments || []);
      parts.push('<h2>Summary</h2>');
      parts.push(`<p>${escapeHtml(summary)}</p>`);
    }

    // Salient moments section
    if (options.includeMoments && sessionData.moments?.length > 0 && isRich) {
      parts.push('<h2>Key Moments</h2>');
      parts.push('<ul>');
      sessionData.moments.forEach((moment) => {
        parts.push(`<li><strong>${escapeHtml(moment.title)}</strong>`);
        if (moment.context) {
          parts.push(`<br><em>"${escapeHtml(moment.context)}"</em>`);
        }
        parts.push('</li>');
      });
      parts.push('</ul>');
    }

    // Entities section
    if (options.includeEntities && sessionData.entities && isRich) {
      const entitySection = this._formatEntitiesHTML(sessionData.entities);
      if (entitySection) {
        parts.push('<h2>Entities Mentioned</h2>');
        parts.push(entitySection);
      }
    }

    // Transcript section
    if (format === ChronicleFormat.TRANSCRIPT || format === ChronicleFormat.FULL) {
      if (format === ChronicleFormat.FULL) {
        parts.push('<h2>Full Transcript</h2>');
      }
      const transcript = this._formatTranscriptHTML(
        sessionData.segments || [],
        options.includeTimestamps
      );
      parts.push(transcript);
    }

    // Narrative section (if provided)
    if (format === ChronicleFormat.NARRATIVE && sessionData.narrative) {
      parts.push('<h2>Session Narrative</h2>');
      parts.push(`<div class="narrative">${escapeHtml(sessionData.narrative)}</div>`);
    }

    // Footer
    if (isRich) {
      parts.push('<hr>');
      parts.push(
        `<p><em>Chronicle generated by VoxChronicle on ${new Date().toLocaleDateString()}</em></p>`
      );
    }

    return parts.join('\n');
  }

  /**
   * Format transcript segments as HTML
   *
   * @param {Array<TranscriptSegment>} segments - Transcript segments
   * @param {boolean} includeTimestamps - Whether to include timestamps
   * @returns {string} HTML formatted transcript
   * @private
   */
  _formatTranscriptHTML(segments, includeTimestamps = false) {
    if (!segments || segments.length === 0) {
      return '<p><em>No transcript available.</em></p>';
    }

    const groupedSegments = this._groupBySpeaker(segments);
    const lines = [];

    lines.push('<div class="transcript">');

    groupedSegments.forEach((segment) => {
      const speaker = escapeHtml(segment.speaker || 'Unknown');
      const text = escapeHtml((segment.text || '').trim());

      lines.push('<p class="dialogue">');

      if (includeTimestamps && segment.start !== undefined) {
        const timestamp = AudioUtils.formatDuration(segment.start);
        lines.push(`<span class="timestamp">[${timestamp}]</span> `);
      }

      lines.push(`<strong class="speaker">${speaker}:</strong> `);
      lines.push(`<span class="text">${text}</span>`);
      lines.push('</p>');
    });

    lines.push('</div>');

    return lines.join('\n');
  }

  /**
   * Format entities as HTML list
   *
   * @param {object} entities - Extracted entities object
   * @returns {string} HTML formatted entities list
   * @private
   */
  _formatEntitiesHTML(entities) {
    if (!entities) {
      return '';
    }

    const sections = [];

    // Characters
    if (entities.characters?.length > 0) {
      sections.push('<h3>Characters</h3>');
      sections.push('<ul>');
      entities.characters.forEach((char) => {
        const typeLabel = char.isNPC ? 'NPC' : 'PC';
        sections.push(`<li><strong>${escapeHtml(char.name)}</strong> (${typeLabel})`);
        if (char.description) {
          sections.push(` - ${escapeHtml(char.description)}`);
        }
        sections.push('</li>');
      });
      sections.push('</ul>');
    }

    // Locations
    if (entities.locations?.length > 0) {
      sections.push('<h3>Locations</h3>');
      sections.push('<ul>');
      entities.locations.forEach((loc) => {
        sections.push(`<li><strong>${escapeHtml(loc.name)}</strong>`);
        if (loc.type) {
          sections.push(` (${escapeHtml(loc.type)})`);
        }
        if (loc.description) {
          sections.push(` - ${escapeHtml(loc.description)}`);
        }
        sections.push('</li>');
      });
      sections.push('</ul>');
    }

    // Items
    if (entities.items?.length > 0) {
      sections.push('<h3>Items</h3>');
      sections.push('<ul>');
      entities.items.forEach((item) => {
        sections.push(`<li><strong>${escapeHtml(item.name)}</strong>`);
        if (item.type) {
          sections.push(` (${escapeHtml(item.type)})`);
        }
        if (item.description) {
          sections.push(` - ${escapeHtml(item.description)}`);
        }
        sections.push('</li>');
      });
      sections.push('</ul>');
    }

    return sections.join('\n');
  }

  // ============================================================================
  // Markdown Formatting
  // ============================================================================

  /**
   * Format chronicle as Markdown content
   *
   * @param {object} sessionData - Session data
   * @param {string} format - Chronicle format
   * @param {object} options - Formatting options
   * @returns {string} Markdown content
   * @private
   */
  _formatAsMarkdown(sessionData, format, options) {
    const parts = [];

    // Header
    if (this._campaignName) {
      parts.push(`*${this._campaignName}*`);
      parts.push('');
    }

    // Summary section
    if (
      sessionData.summary &&
      (format === ChronicleFormat.SUMMARY || format === ChronicleFormat.FULL)
    ) {
      parts.push('## Summary');
      parts.push('');
      parts.push(sessionData.summary);
      parts.push('');
    } else if (format === ChronicleFormat.SUMMARY || format === ChronicleFormat.FULL) {
      const summary = this.generateSummary(sessionData.segments || []);
      parts.push('## Summary');
      parts.push('');
      parts.push(summary);
      parts.push('');
    }

    // Salient moments
    if (options.includeMoments && sessionData.moments?.length > 0) {
      parts.push('## Key Moments');
      parts.push('');
      sessionData.moments.forEach((moment) => {
        parts.push(`- **${moment.title}**`);
        if (moment.context) {
          parts.push(`  *"${moment.context}"*`);
        }
      });
      parts.push('');
    }

    // Entities
    if (options.includeEntities && sessionData.entities) {
      const entitySection = this._formatEntitiesMarkdown(sessionData.entities);
      if (entitySection) {
        parts.push('## Entities Mentioned');
        parts.push('');
        parts.push(entitySection);
        parts.push('');
      }
    }

    // Transcript
    if (format === ChronicleFormat.TRANSCRIPT || format === ChronicleFormat.FULL) {
      if (format === ChronicleFormat.FULL) {
        parts.push('## Full Transcript');
        parts.push('');
      }
      const transcript = this.formatTranscript(sessionData.segments || [], {
        includeTimestamps: options.includeTimestamps
      });
      parts.push(transcript);
      parts.push('');
    }

    // Narrative
    if (format === ChronicleFormat.NARRATIVE && sessionData.narrative) {
      parts.push('## Session Narrative');
      parts.push('');
      parts.push(sessionData.narrative);
      parts.push('');
    }

    // Footer
    parts.push('---');
    parts.push(`*Chronicle generated by VoxChronicle on ${new Date().toLocaleDateString()}*`);

    return parts.join('\n');
  }

  /**
   * Format entities as Markdown
   *
   * @param {object} entities - Extracted entities
   * @returns {string} Markdown formatted entities
   * @private
   */
  _formatEntitiesMarkdown(entities) {
    if (!entities) {
      return '';
    }

    const sections = [];

    if (entities.characters?.length > 0) {
      sections.push('### Characters');
      entities.characters.forEach((char) => {
        const typeLabel = char.isNPC ? 'NPC' : 'PC';
        let line = `- **${char.name}** (${typeLabel})`;
        if (char.description) {
          line += ` - ${char.description}`;
        }
        sections.push(line);
      });
      sections.push('');
    }

    if (entities.locations?.length > 0) {
      sections.push('### Locations');
      entities.locations.forEach((loc) => {
        let line = `- **${loc.name}**`;
        if (loc.type) {
          line += ` (${loc.type})`;
        }
        if (loc.description) {
          line += ` - ${loc.description}`;
        }
        sections.push(line);
      });
      sections.push('');
    }

    if (entities.items?.length > 0) {
      sections.push('### Items');
      entities.items.forEach((item) => {
        let line = `- **${item.name}**`;
        if (item.type) {
          line += ` (${item.type})`;
        }
        if (item.description) {
          line += ` - ${item.description}`;
        }
        sections.push(line);
      });
      sections.push('');
    }

    return sections.join('\n');
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Group consecutive segments from the same speaker
   *
   * @param {Array<TranscriptSegment>} segments - Original segments
   * @returns {Array<TranscriptSegment>} Grouped segments
   * @private
   */
  _groupBySpeaker(segments) {
    if (!segments || segments.length === 0) {
      return [];
    }

    const grouped = [];
    let current = null;

    for (const segment of segments) {
      if (current && current.speaker === segment.speaker) {
        // Merge with current segment
        current.text = `${current.text} ${segment.text || ''}`;
        current.end = segment.end;
      } else {
        // Start new segment
        if (current) {
          grouped.push(current);
        }
        current = {
          speaker: segment.speaker,
          text: segment.text || '',
          start: segment.start,
          end: segment.end
        };
      }
    }

    // Don't forget the last segment
    if (current) {
      grouped.push(current);
    }

    return grouped;
  }

  /**
   * Analyze speaker statistics from segments
   *
   * @param {Array<TranscriptSegment>} segments - Transcript segments
   * @returns {object} Speaker statistics
   * @private
   */
  _analyzeSpeakers(segments) {
    const stats = {};

    for (const segment of segments) {
      const speaker = segment.speaker || 'Unknown';
      if (!stats[speaker]) {
        stats[speaker] = {
          segmentCount: 0,
          wordCount: 0,
          totalDuration: 0
        };
      }

      stats[speaker].segmentCount++;
      stats[speaker].wordCount += (segment.text || '').split(/\s+/).length;

      if (segment.start !== undefined && segment.end !== undefined) {
        stats[speaker].totalDuration += segment.end - segment.start;
      }
    }

    return stats;
  }

  /**
   * Extract highlight phrases from segments
   *
   * @param {Array<TranscriptSegment>} segments - Transcript segments
   * @param {number} count - Number of highlights to extract
   * @returns {Array<string>} Highlight phrases
   * @private
   */
  _extractHighlights(segments, count) {
    // Simple extraction: pick segments with the most emotional/action words
    const actionWords =
      /\b(fight|attack|discover|found|reveal|escape|defeat|kill|save|rescue|cast|spell|magic|dragon|monster|treasure|gold|death|victory)\b/i;

    const candidates = segments
      .filter((seg) => seg.text && actionWords.test(seg.text))
      .map((seg) => {
        // Truncate long segments
        const text = seg.text.trim();
        return text.length > 100 ? `${text.substring(0, 97)}...` : text;
      });

    return candidates.slice(0, count);
  }

  /**
   * Format date for Kanka
   *
   * @param {string|Date} date - Date value
   * @returns {string|null} Formatted date or null
   * @private
   */
  _formatDate(date) {
    if (!date) {
      return null;
    }

    if (date instanceof Date) {
      return date.toISOString().split('T')[0];
    }

    // Assume YYYY-MM-DD format if string
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
      return date.split('T')[0];
    }

    return null;
  }

  /**
   * Count total entities in extraction result
   *
   * @param {object} entities - Entities object
   * @returns {number} Total count
   * @private
   */
  _countEntities(entities) {
    if (!entities) {
      return 0;
    }

    return (
      (entities.characters?.length || 0) +
      (entities.locations?.length || 0) +
      (entities.items?.length || 0)
    );
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  /**
   * Set the campaign name for chronicle headers
   *
   * @param {string} name - Campaign name
   */
  setCampaignName(name) {
    this._campaignName = name || '';
    this._logger.debug(`Campaign name set: ${this._campaignName}`);
  }

  /**
   * Set the default formatting style
   *
   * @param {string} style - Formatting style from FormattingStyle enum
   */
  setDefaultStyle(style) {
    if (Object.values(FormattingStyle).includes(style)) {
      this._defaultStyle = style;
      this._logger.debug(`Default style set: ${style}`);
    }
  }

  /**
   * Set the default chronicle format
   *
   * @param {string} format - Chronicle format from ChronicleFormat enum
   */
  setDefaultFormat(format) {
    if (Object.values(ChronicleFormat).includes(format)) {
      this._defaultFormat = format;
      this._logger.debug(`Default format set: ${format}`);
    }
  }

  /**
   * Get current configuration
   *
   * @returns {object} Current configuration
   */
  getConfig() {
    return {
      campaignName: this._campaignName,
      defaultStyle: this._defaultStyle,
      defaultFormat: this._defaultFormat
    };
  }
}

/**
 * @typedef {object} TranscriptSegment
 * @property {string} speaker - Speaker name/identifier
 * @property {string} text - Spoken text
 * @property {number} [start] - Start timestamp in seconds
 * @property {number} [end] - End timestamp in seconds
 */

/**
 * @typedef {object} SalientMoment
 * @property {string} title - Moment title
 * @property {string} [imagePrompt] - DALL-E image prompt
 * @property {string} [context] - Context from transcript
 * @property {number} [dramaScore] - Drama score 1-10
 */

/**
 * @typedef {object} ChronicleResult
 * @property {string} name - Chronicle title
 * @property {string} entry - Formatted content (HTML or Markdown)
 * @property {string} type - Chronicle type (always 'Session Chronicle')
 * @property {string|null} date - Session date in YYYY-MM-DD format
 * @property {boolean} is_private - Whether chronicle is private
 * @property {object} meta - Metadata about the chronicle
 */

/**
 * @typedef {object} KankaJournalData
 * @property {string} name - Journal title
 * @property {string} entry - Journal content
 * @property {string} type - Journal type
 * @property {string|null} date - Journal date
 * @property {boolean} is_private - Whether journal is private
 * @property {string|number} [location_id] - Associated location ID
 * @property {string|number} [character_id] - Associated character ID
 * @property {string|number} [journal_id] - Parent journal ID
 * @property {Array} [tags] - Tag IDs
 */

/**
 * @typedef {object} AISummaryResult
 * @property {string} summary - The generated summary text
 * @property {boolean} success - Whether AI generation succeeded
 * @property {string} [model] - The AI model used (if successful)
 * @property {string} [style] - The summary style used
 * @property {number} [segmentCount] - Number of segments processed
 * @property {string} [generatedAt] - ISO timestamp of generation
 * @property {string} [error] - Error message (if failed)
 * @property {boolean} [fallback] - Whether a fallback summary was used
 */

// Export all classes and enums
export { NarrativeExporter, ChronicleFormat, FormattingStyle };
