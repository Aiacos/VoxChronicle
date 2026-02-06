/**
 * NarrativeExporter - Format Transcripts as Kanka Journal Entries
 *
 * Provides formatting and export utilities to transform session transcripts
 * into well-structured Kanka journal entries (chronicles). Supports both
 * raw transcript formatting and AI-enhanced narrative summaries.
 *
 * @class NarrativeExporter
 * @module vox-chronicle
 */

import { Logger } from '../utils/Logger.mjs';

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
   * @type {Object}
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
   * Create a new NarrativeExporter instance
   *
   * @param {Object} [options] - Configuration options
   * @param {string} [options.campaignName] - Campaign name for headers
   * @param {string} [options.defaultStyle='rich'] - Default formatting style
   * @param {string} [options.defaultFormat='full'] - Default chronicle format
   */
  constructor(options = {}) {
    this._campaignName = options.campaignName || '';
    this._defaultStyle = options.defaultStyle || FormattingStyle.RICH;
    this._defaultFormat = options.defaultFormat || ChronicleFormat.FULL;

    this._logger.debug('NarrativeExporter initialized');
  }

  // ============================================================================
  // Main Formatting Methods
  // ============================================================================

  /**
   * Format a complete chronicle from session data
   *
   * @param {Object} sessionData - Session data to format
   * @param {string} sessionData.title - Chronicle title
   * @param {string} [sessionData.date] - Session date (YYYY-MM-DD or Date object)
   * @param {Array<TranscriptSegment>} sessionData.segments - Transcript segments with speaker/text
   * @param {Object} [sessionData.entities] - Extracted entities (characters, locations, items)
   * @param {Array<SalientMoment>} [sessionData.moments] - Identified salient moments
   * @param {string} [sessionData.summary] - AI-generated summary
   * @param {Object} [options] - Formatting options
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

    this._logger.log(`Formatting chronicle: ${sessionData.title} (format: ${format}, style: ${style})`);

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
   * @param {Object} [options] - Summary options
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
      parts.push(`This session featured ${speakerNames.length} participants: ${speakerNames.join(', ')}.`);
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
      highlights.forEach(h => {
        parts.push(`• ${h}`);
      });
    }

    let summary = parts.join(' ');

    // Truncate if too long
    if (summary.length > maxLength) {
      summary = summary.substring(0, maxLength - 3) + '...';
    }

    return summary;
  }

  /**
   * Export session data to Kanka journal format
   *
   * @param {Object} sessionData - Complete session data
   * @param {Object} [options] - Export options
   * @returns {KankaJournalData} Data ready for KankaService.createJournal()
   */
  export(sessionData, options = {}) {
    const chronicle = this.formatChronicle(sessionData, options);

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
   * @param {Array<Object>} sessions - Array of session data objects
   * @param {Object} [options] - Export options for all sessions
   * @returns {Array<KankaJournalData>} Array of journal data ready for batch creation
   */
  exportBatch(sessions, options = {}) {
    if (!sessions || !Array.isArray(sessions)) {
      return [];
    }

    this._logger.log(`Exporting batch of ${sessions.length} sessions`);

    return sessions.map((session, index) => {
      try {
        return this.export(session, options);
      } catch (error) {
        this._logger.error(`Failed to export session ${index}: ${error.message}`);
        return null;
      }
    }).filter(Boolean);
  }

  // ============================================================================
  // Transcript Formatting
  // ============================================================================

  /**
   * Format transcript segments as readable dialogue
   *
   * @param {Array<TranscriptSegment>} segments - Transcript segments
   * @param {Object} [options] - Formatting options
   * @param {boolean} [options.includeTimestamps=false] - Include timestamps
   * @param {boolean} [options.groupBySpeaker=true] - Merge consecutive segments from same speaker
   * @returns {string} Formatted transcript text
   */
  formatTranscript(segments, options = {}) {
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return '';
    }

    const includeTimestamps = options.includeTimestamps ?? false;
    const groupBySpeaker = options.groupBySpeaker ?? true;

    let formattedSegments = segments;

    // Group consecutive segments from the same speaker
    if (groupBySpeaker) {
      formattedSegments = this._groupBySpeaker(segments);
    }

    // Format each segment
    const lines = formattedSegments.map(segment => {
      const speaker = segment.speaker || 'Unknown';
      const text = (segment.text || '').trim();

      if (includeTimestamps && segment.start !== undefined) {
        const timestamp = this._formatTimestamp(segment.start);
        return `[${timestamp}] **${speaker}:** ${text}`;
      }

      return `**${speaker}:** ${text}`;
    });

    return lines.join('\n\n');
  }

  // ============================================================================
  // HTML Formatting
  // ============================================================================

  /**
   * Format chronicle as HTML content
   *
   * @param {Object} sessionData - Session data
   * @param {string} format - Chronicle format
   * @param {Object} options - Formatting options
   * @returns {string} HTML content
   * @private
   */
  _formatAsHTML(sessionData, format, options) {
    const parts = [];
    const isRich = options.isRich ?? true;

    // Header section
    if (isRich && this._campaignName) {
      parts.push(`<p><em>${this._escapeHtml(this._campaignName)}</em></p>`);
    }

    // Summary section
    if (sessionData.summary && (format === ChronicleFormat.SUMMARY || format === ChronicleFormat.FULL)) {
      parts.push('<h2>Summary</h2>');
      parts.push(`<p>${this._escapeHtml(sessionData.summary)}</p>`);
    } else if (format === ChronicleFormat.SUMMARY || format === ChronicleFormat.FULL) {
      // Generate basic summary
      const summary = this.generateSummary(sessionData.segments || []);
      parts.push('<h2>Summary</h2>');
      parts.push(`<p>${this._escapeHtml(summary)}</p>`);
    }

    // Salient moments section
    if (options.includeMoments && sessionData.moments?.length > 0 && isRich) {
      parts.push('<h2>Key Moments</h2>');
      parts.push('<ul>');
      sessionData.moments.forEach(moment => {
        parts.push(`<li><strong>${this._escapeHtml(moment.title)}</strong>`);
        if (moment.context) {
          parts.push(`<br><em>"${this._escapeHtml(moment.context)}"</em>`);
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
      parts.push(`<div class="narrative">${this._escapeHtml(sessionData.narrative)}</div>`);
    }

    // Footer
    if (isRich) {
      parts.push('<hr>');
      parts.push(`<p><em>Chronicle generated by VoxChronicle on ${new Date().toLocaleDateString()}</em></p>`);
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

    groupedSegments.forEach(segment => {
      const speaker = this._escapeHtml(segment.speaker || 'Unknown');
      const text = this._escapeHtml((segment.text || '').trim());

      lines.push('<p class="dialogue">');

      if (includeTimestamps && segment.start !== undefined) {
        const timestamp = this._formatTimestamp(segment.start);
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
   * @param {Object} entities - Extracted entities object
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
      entities.characters.forEach(char => {
        const typeLabel = char.isNPC ? 'NPC' : 'PC';
        sections.push(`<li><strong>${this._escapeHtml(char.name)}</strong> (${typeLabel})`);
        if (char.description) {
          sections.push(` - ${this._escapeHtml(char.description)}`);
        }
        sections.push('</li>');
      });
      sections.push('</ul>');
    }

    // Locations
    if (entities.locations?.length > 0) {
      sections.push('<h3>Locations</h3>');
      sections.push('<ul>');
      entities.locations.forEach(loc => {
        sections.push(`<li><strong>${this._escapeHtml(loc.name)}</strong>`);
        if (loc.type) {
          sections.push(` (${this._escapeHtml(loc.type)})`);
        }
        if (loc.description) {
          sections.push(` - ${this._escapeHtml(loc.description)}`);
        }
        sections.push('</li>');
      });
      sections.push('</ul>');
    }

    // Items
    if (entities.items?.length > 0) {
      sections.push('<h3>Items</h3>');
      sections.push('<ul>');
      entities.items.forEach(item => {
        sections.push(`<li><strong>${this._escapeHtml(item.name)}</strong>`);
        if (item.type) {
          sections.push(` (${this._escapeHtml(item.type)})`);
        }
        if (item.description) {
          sections.push(` - ${this._escapeHtml(item.description)}`);
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
   * @param {Object} sessionData - Session data
   * @param {string} format - Chronicle format
   * @param {Object} options - Formatting options
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
    if (sessionData.summary && (format === ChronicleFormat.SUMMARY || format === ChronicleFormat.FULL)) {
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
      sessionData.moments.forEach(moment => {
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
   * @param {Object} entities - Extracted entities
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
      entities.characters.forEach(char => {
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
      entities.locations.forEach(loc => {
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
      entities.items.forEach(item => {
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
   * @returns {Object} Speaker statistics
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
    const actionWords = /\b(fight|attack|discover|found|reveal|escape|defeat|kill|save|rescue|cast|spell|magic|dragon|monster|treasure|gold|death|victory)\b/i;

    const candidates = segments
      .filter(seg => seg.text && actionWords.test(seg.text))
      .map(seg => {
        // Truncate long segments
        const text = seg.text.trim();
        return text.length > 100 ? text.substring(0, 97) + '...' : text;
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
   * Format timestamp as MM:SS or HH:MM:SS
   *
   * @param {number} seconds - Timestamp in seconds
   * @returns {string} Formatted timestamp
   * @private
   */
  _formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Escape HTML special characters
   *
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   * @private
   */
  _escapeHtml(text) {
    if (!text) {
      return '';
    }

    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return String(text).replace(/[&<>"']/g, char => escapeMap[char]);
  }

  /**
   * Count total entities in extraction result
   *
   * @param {Object} entities - Entities object
   * @returns {number} Total count
   * @private
   */
  _countEntities(entities) {
    if (!entities) {
      return 0;
    }

    return (entities.characters?.length || 0) +
           (entities.locations?.length || 0) +
           (entities.items?.length || 0);
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
   * @returns {Object} Current configuration
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
 * @typedef {Object} TranscriptSegment
 * @property {string} speaker - Speaker name/identifier
 * @property {string} text - Spoken text
 * @property {number} [start] - Start timestamp in seconds
 * @property {number} [end] - End timestamp in seconds
 */

/**
 * @typedef {Object} SalientMoment
 * @property {string} title - Moment title
 * @property {string} [imagePrompt] - DALL-E image prompt
 * @property {string} [context] - Context from transcript
 * @property {number} [dramaScore] - Drama score 1-10
 */

/**
 * @typedef {Object} ChronicleResult
 * @property {string} name - Chronicle title
 * @property {string} entry - Formatted content (HTML or Markdown)
 * @property {string} type - Chronicle type (always 'Session Chronicle')
 * @property {string|null} date - Session date in YYYY-MM-DD format
 * @property {boolean} is_private - Whether chronicle is private
 * @property {Object} meta - Metadata about the chronicle
 */

/**
 * @typedef {Object} KankaJournalData
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

// Export all classes and enums
export {
  NarrativeExporter,
  ChronicleFormat,
  FormattingStyle
};
