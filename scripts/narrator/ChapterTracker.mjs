/**
 * ChapterTracker - Tracks current position in adventure narrative
 *
 * Ported from Narrator Master's chapter-tracker.js to VoxChronicle as an ES6 module.
 * Coordinates with JournalParser to understand journal structure
 * and determines current chapter from active Foundry scene.
 *
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';

/**
 * Represents chapter information with navigation context
 * @typedef {Object} ChapterInfo
 * @property {string} id - Unique identifier for this chapter
 * @property {string} title - The chapter title
 * @property {number} level - Heading level (0 for page, 1-6 for h1-h6, 7 for section)
 * @property {string} type - Node type: 'page', 'heading', or 'section'
 * @property {string} pageId - The ID of the page containing this chapter
 * @property {string} pageName - The name of the page containing this chapter
 * @property {string} content - Text content of this chapter section
 * @property {string} journalId - The ID of the journal containing this chapter
 * @property {string} journalName - The name of the journal
 * @property {string} path - Full hierarchical path (e.g., "Chapter 1 > The Tavern > Encounter")
 */

/**
 * Represents a subchapter/subsection for navigation
 * @typedef {Object} SubchapterInfo
 * @property {string} id - Unique identifier for this subchapter
 * @property {string} title - The subchapter title
 * @property {number} level - Heading level relative to parent
 * @property {string} type - Node type: 'heading' or 'section'
 * @property {string} path - Full hierarchical path to this subchapter
 */

/**
 * Represents the source that determined the current chapter
 * @typedef {Object} ChapterSource
 * @property {string} type - Source type: 'scene', 'manual', 'auto', 'none'
 * @property {string} [sceneId] - The scene ID if source is 'scene'
 * @property {string} [sceneName] - The scene name if source is 'scene'
 * @property {Date} updatedAt - When the chapter was last updated
 */

/**
 * ChapterTracker - Tracks current position in adventure narrative
 * Coordinates with JournalParser to understand journal structure
 * and determines current chapter from active Foundry scene
 */
export class ChapterTracker {
  /**
   * Creates a new ChapterTracker instance
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [options.journalParser=null] - JournalParser instance for chapter structure
   */
  constructor(options = {}) {
    /**
     * Child logger for ChapterTracker
     * @type {object}
     * @private
     */
    this._logger = Logger.createChild('ChapterTracker');

    /**
     * Reference to JournalParser for structure extraction
     * @type {Object|null}
     * @private
     */
    this._journalParser = options.journalParser || null;

    /**
     * Currently tracked chapter information
     * @type {ChapterInfo|null}
     * @private
     */
    this._currentChapter = null;

    /**
     * Subchapters of the current chapter for navigation
     * @type {SubchapterInfo[]}
     * @private
     */
    this._subchapters = [];

    /**
     * ID of the currently active Foundry scene
     * @type {string|null}
     * @private
     */
    this._activeSceneId = null;

    /**
     * Source that determined the current chapter
     * @type {ChapterSource}
     * @private
     */
    this._chapterSource = {
      type: 'none',
      updatedAt: new Date()
    };

    /**
     * Cache of scene-to-chapter mappings for faster lookup
     * @type {Map<string, ChapterInfo>}
     * @private
     */
    this._sceneChapterCache = new Map();

    /**
     * History of visited chapters for navigation
     * @type {ChapterInfo[]}
     * @private
     */
    this._chapterHistory = [];

    /**
     * Maximum history entries to keep
     * @type {number}
     * @private
     */
    this._maxHistorySize = 20;

    /**
     * Journal ID to use for chapter tracking
     * @type {string|null}
     * @private
     */
    this._selectedJournalId = null;

    this._logger.debug('ChapterTracker initialized');
  }

  // ---------------------------------------------------------------------------
  // Public API -- Configuration
  // ---------------------------------------------------------------------------

  /**
   * Sets the JournalParser instance to use for structure extraction
   * @param {Object} journalParser - JournalParser instance
   */
  setJournalParser(journalParser) {
    this._journalParser = journalParser;
    this._logger.debug('JournalParser reference set');
  }

  /**
   * Sets the journal ID to track chapters from
   * @param {string} journalId - The journal ID to use
   */
  setSelectedJournal(journalId) {
    if (journalId !== this._selectedJournalId) {
      this._selectedJournalId = journalId;
      this._sceneChapterCache.clear();
      this._logger.debug(`Selected journal set to: ${journalId}`);
    }
  }

  /**
   * Gets the currently selected journal ID
   * @returns {string|null} The selected journal ID
   */
  getSelectedJournal() {
    return this._selectedJournalId;
  }

  /**
   * Checks if the tracker is configured with required dependencies
   * @returns {boolean} True if the tracker is ready to use
   */
  isConfigured() {
    return this._journalParser !== null && this._selectedJournalId !== null;
  }

  // ---------------------------------------------------------------------------
  // Public API -- Scene-based detection
  // ---------------------------------------------------------------------------

  /**
   * Updates current chapter position based on the active Foundry scene.
   * Uses scene name and linked journal to deduce the chapter.
   * @param {Object} scene - The active Foundry VTT scene object
   * @returns {ChapterInfo|null} The detected chapter or null if not found
   */
  updateFromScene(scene) {
    if (!scene) {
      this._logger.debug('No scene provided to updateFromScene');
      return null;
    }

    const sceneId = scene.id;
    const sceneName = scene.name;

    // Store active scene ID
    this._activeSceneId = sceneId;

    this._logger.debug(`Updating from scene: ${sceneName} (${sceneId})`);

    // Check cache first
    if (this._sceneChapterCache.has(sceneId)) {
      const cachedChapter = this._sceneChapterCache.get(sceneId);
      this._setCurrentChapter(cachedChapter, 'scene', { sceneId, sceneName });
      this._logger.debug(`Using cached chapter for scene: ${sceneName}`);
      return cachedChapter;
    }

    // Try to detect chapter from scene
    const detectedChapter = this._detectChapterFromScene(scene);

    if (detectedChapter) {
      // Cache the result
      this._sceneChapterCache.set(sceneId, detectedChapter);
      this._setCurrentChapter(detectedChapter, 'scene', { sceneId, sceneName });
      this._logger.info(`Detected chapter "${detectedChapter.title}" from scene "${sceneName}"`);
      return detectedChapter;
    }

    this._logger.debug(`Could not detect chapter from scene: ${sceneName}`);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Public API -- Chapter state
  // ---------------------------------------------------------------------------

  /**
   * Gets the current chapter information
   * @returns {ChapterInfo|null} The current chapter or null if not set
   */
  getCurrentChapter() {
    return this._currentChapter;
  }

  /**
   * Gets the subchapters of the current chapter for navigation
   * @returns {SubchapterInfo[]} Array of subchapter info objects
   */
  getSubchapters() {
    return [...this._subchapters];
  }

  /**
   * Manually sets the current chapter by ID.
   * Used when user explicitly selects a chapter in the UI.
   * @param {string} chapterId - The chapter ID to set
   * @returns {boolean} True if the chapter was found and set
   */
  setManualChapter(chapterId) {
    this._logger.debug(`setManualChapter() entry — chapterId="${chapterId}"`);

    if (!chapterId || !this._journalParser || !this._selectedJournalId) {
      this._logger.warn('Cannot set manual chapter: missing requirements');
      return false;
    }

    // Get flat chapter list to find the chapter
    const flatList = this._journalParser.getFlatChapterList(this._selectedJournalId);
    const targetChapter = flatList.find(c => c.id === chapterId);

    if (!targetChapter) {
      this._logger.warn(`Chapter not found: ${chapterId}`);
      return false;
    }

    const chapterInfo = this._convertFlatNodeToChapterInfo(targetChapter, this._selectedJournalId);
    this._setCurrentChapter(chapterInfo, 'manual');

    this._logger.info(`Manually set chapter to: ${chapterInfo.title}`);
    return true;
  }

  /**
   * Gets the source that determined the current chapter
   * @returns {ChapterSource} The chapter source information
   */
  getChapterSource() {
    return { ...this._chapterSource };
  }

  // ---------------------------------------------------------------------------
  // Public API -- History and navigation
  // ---------------------------------------------------------------------------

  /**
   * Gets the chapter navigation history
   * @returns {ChapterInfo[]} Array of previously visited chapters
   */
  getChapterHistory() {
    return [...this._chapterHistory];
  }

  /**
   * Navigates back to the previous chapter in history
   * @returns {ChapterInfo|null} The previous chapter or null if history is empty
   */
  navigateBack() {
    if (this._chapterHistory.length === 0) {
      this._logger.debug('No chapter history to navigate back');
      return null;
    }

    const previousChapter = this._chapterHistory.pop();
    this._currentChapter = previousChapter;
    this._chapterSource = {
      type: 'manual',
      updatedAt: new Date()
    };

    this._updateSubchapters();

    this._logger.debug(`Navigated back to: ${previousChapter.title}`);
    return previousChapter;
  }

  /**
   * Gets all available chapters as a flat list for navigation
   * @returns {Array<{id: string, title: string, level: number, path: string}>} Flat list of chapters
   */
  getAllChapters() {
    if (!this._journalParser || !this._selectedJournalId) {
      return [];
    }

    return this._journalParser.getFlatChapterList(this._selectedJournalId);
  }

  /**
   * Gets sibling chapters (same level, same parent).
   * Useful for showing "Next" and "Previous" navigation.
   * @returns {{previous: ChapterInfo|null, next: ChapterInfo|null}} Previous and next siblings
   */
  getSiblingChapters() {
    if (!this._currentChapter || !this._journalParser || !this._selectedJournalId) {
      return { previous: null, next: null };
    }

    const flatList = this._journalParser.getFlatChapterList(this._selectedJournalId);
    const currentIndex = flatList.findIndex(c => c.id === this._currentChapter.id);

    if (currentIndex === -1) {
      return { previous: null, next: null };
    }

    // Find previous sibling at same level
    let previous = null;
    for (let i = currentIndex - 1; i >= 0; i--) {
      if (flatList[i].level === this._currentChapter.level) {
        previous = this._convertFlatNodeToChapterInfo(flatList[i], this._selectedJournalId);
        break;
      } else if (flatList[i].level < this._currentChapter.level) {
        // Hit parent level, stop searching
        break;
      }
    }

    // Find next sibling at same level
    let next = null;
    for (let i = currentIndex + 1; i < flatList.length; i++) {
      if (flatList[i].level === this._currentChapter.level) {
        next = this._convertFlatNodeToChapterInfo(flatList[i], this._selectedJournalId);
        break;
      } else if (flatList[i].level < this._currentChapter.level) {
        // Hit parent level, stop searching
        break;
      }
    }

    return { previous, next };
  }

  // ---------------------------------------------------------------------------
  // Public API -- AI context
  // ---------------------------------------------------------------------------

  /**
   * Gets the content of the current chapter formatted for AI context
   * @param {number} [maxLength=5000] - Maximum content length
   * @returns {string} The chapter content with context
   */
  getCurrentChapterContentForAI(maxLength = 5000) {
    if (!this._currentChapter) {
      this._logger.debug('getCurrentChapterContentForAI() — no current chapter set');
      return '';
    }

    this._logger.debug(`getCurrentChapterContentForAI() — chapter="${this._currentChapter.title}", maxLength=${maxLength}`);

    const parts = [];

    // Add chapter header
    parts.push(`CAPITOLO CORRENTE: ${this._currentChapter.title}`);
    parts.push(`PERCORSO: ${this._currentChapter.path}`);
    parts.push('');

    // Add chapter content
    if (this._currentChapter.content) {
      let content = this._currentChapter.content;
      if (content.length > maxLength) {
        content = content.substring(0, maxLength) + '...';
      }
      parts.push('CONTENUTO:');
      parts.push(content);
      parts.push('');
    }

    // Add subchapters list
    if (this._subchapters.length > 0) {
      parts.push('SOTTOSEZIONI DISPONIBILI:');
      for (const sub of this._subchapters) {
        parts.push(`- ${sub.title}`);
      }
    }

    return parts.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Public API -- State management
  // ---------------------------------------------------------------------------

  /**
   * Clears the chapter tracking state
   */
  clear() {
    this._currentChapter = null;
    this._subchapters = [];
    this._activeSceneId = null;
    this._chapterSource = {
      type: 'none',
      updatedAt: new Date()
    };
    this._chapterHistory = [];

    this._logger.debug('Chapter tracking cleared');
  }

  /**
   * Clears the scene-to-chapter cache
   */
  clearCache() {
    this._sceneChapterCache.clear();
    this._logger.debug('Scene chapter cache cleared');
  }

  // ---------------------------------------------------------------------------
  // Private -- Scene detection
  // ---------------------------------------------------------------------------

  /**
   * Detects chapter from scene properties
   * @param {Object} scene - The Foundry scene object
   * @returns {ChapterInfo|null} Detected chapter or null
   * @private
   */
  _detectChapterFromScene(scene) {
    if (!this._journalParser || !this._selectedJournalId) {
      this._logger.debug('JournalParser or journal not configured');
      return null;
    }

    const sceneName = scene.name;

    // Method 1: Check if scene has a linked journal entry
    const linkedJournalId = scene.journal;
    if (linkedJournalId) {
      this._logger.debug(`Scene has linked journal: ${linkedJournalId}`);
      // If linked journal matches our selected journal, find the chapter
      if (linkedJournalId === this._selectedJournalId) {
        // Try to find matching chapter by page
        const chapter = this._findChapterByPageId(linkedJournalId, scene.journalPage);
        if (chapter) {
          return chapter;
        }
      }
    }

    // Method 2: Match scene name to chapter titles
    const chapter = this._journalParser.getChapterBySceneName(this._selectedJournalId, sceneName);
    if (chapter) {
      return this._convertNodeToChapterInfo(chapter, this._selectedJournalId);
    }

    // Method 3: Fall back to keyword matching in scene name
    return this._detectChapterByKeywords(sceneName);
  }

  /**
   * Finds a chapter by its page ID within a journal
   * @param {string} journalId - The journal ID
   * @param {string} pageId - The page ID to find
   * @returns {ChapterInfo|null} The chapter info or null
   * @private
   */
  _findChapterByPageId(journalId, pageId) {
    if (!pageId || !this._journalParser) {
      return null;
    }

    const flatList = this._journalParser.getFlatChapterList(journalId);
    const matchingChapter = flatList.find(c => c.pageId === pageId);

    if (matchingChapter) {
      return this._convertFlatNodeToChapterInfo(matchingChapter, journalId);
    }

    return null;
  }

  /**
   * Detects chapter by searching for keywords in scene name
   * @param {string} sceneName - The scene name to search
   * @returns {ChapterInfo|null} Detected chapter or null
   * @private
   */
  _detectChapterByKeywords(sceneName) {
    if (!this._journalParser || !this._selectedJournalId) {
      return null;
    }

    // Extract significant words from scene name
    const keywords = sceneName
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 3);

    if (keywords.length === 0) {
      return null;
    }

    // Search for these keywords in journal
    const pages = this._journalParser.searchByKeywords(this._selectedJournalId, keywords);

    if (pages.length > 0) {
      // Try to find a chapter using getChapterAtPosition if available
      if (typeof this._journalParser.getChapterAtPosition === 'function') {
        const chapter = this._journalParser.getChapterAtPosition(
          this._selectedJournalId,
          pages[0].id,
          0
        );

        if (chapter) {
          return this._convertNodeToChapterInfo(chapter, this._selectedJournalId);
        }
      }

      // Fallback: get chapter structure and find matching page node
      const structure = this._journalParser.extractChapterStructure(this._selectedJournalId);
      if (structure) {
        const pageNode = structure.chapters.find(c => c.pageId === pages[0].id);
        if (pageNode) {
          return this._convertNodeToChapterInfo(pageNode, this._selectedJournalId);
        }
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Private -- Conversion helpers
  // ---------------------------------------------------------------------------

  /**
   * Converts a ChapterNode to ChapterInfo format
   * @param {Object} node - The chapter node from JournalParser
   * @param {string} journalId - The journal ID
   * @returns {ChapterInfo} The chapter info object
   * @private
   */
  _convertNodeToChapterInfo(node, journalId) {
    const cached = this._journalParser._cachedContent?.get(journalId);
    const journalName = cached?.name || '';

    return {
      id: node.id,
      title: node.title,
      level: node.level,
      type: node.type,
      pageId: node.pageId,
      pageName: node.pageName,
      content: node.content || '',
      journalId: journalId,
      journalName: journalName,
      path: this._buildChapterPath(node)
    };
  }

  /**
   * Converts a flat chapter list node to ChapterInfo format
   * @param {Object} node - The flat node from getFlatChapterList
   * @param {string} journalId - The journal ID
   * @returns {ChapterInfo} The chapter info object
   * @private
   */
  _convertFlatNodeToChapterInfo(node, journalId) {
    const cached = this._journalParser._cachedContent?.get(journalId);
    const journalName = cached?.name || '';

    return {
      id: node.id,
      title: node.title,
      level: node.level,
      type: node.type,
      pageId: node.pageId,
      pageName: node.pageName,
      content: '',
      journalId: journalId,
      journalName: journalName,
      path: node.path
    };
  }

  /**
   * Builds the hierarchical path string for a chapter
   * @param {Object} node - The chapter node
   * @returns {string} The path string (e.g., "Chapter 1 > The Tavern")
   * @private
   */
  _buildChapterPath(node) {
    // If node already has a path, use it
    if (node.path) {
      return node.path;
    }

    // Otherwise build from title and page name
    if (node.type === 'page') {
      return node.title;
    }

    if (node.pageName && node.pageName !== node.title) {
      return `${node.pageName} > ${node.title}`;
    }

    return node.title;
  }

  // ---------------------------------------------------------------------------
  // Private -- State management
  // ---------------------------------------------------------------------------

  /**
   * Sets the current chapter and updates history
   * @param {ChapterInfo} chapter - The chapter to set
   * @param {string} sourceType - The source type ('scene', 'manual', 'auto')
   * @param {Object} [sourceData={}] - Additional source data
   * @private
   */
  _setCurrentChapter(chapter, sourceType, sourceData = {}) {
    // Only update if actually changing chapters
    if (this._currentChapter?.id === chapter.id) {
      return;
    }

    const prevTitle = this._currentChapter?.title || '(none)';

    // Add previous chapter to history
    if (this._currentChapter) {
      this._chapterHistory.push(this._currentChapter);
      if (this._chapterHistory.length > this._maxHistorySize) {
        this._chapterHistory.shift();
      }
    }

    this._currentChapter = chapter;

    // Update source information
    this._chapterSource = {
      type: sourceType,
      ...sourceData,
      updatedAt: new Date()
    };

    // Extract subchapters for navigation
    this._updateSubchapters();

    this._logger.debug(`Chapter changed: "${prevTitle}" -> "${chapter.title}" (source=${sourceType})`);
  }

  /**
   * Updates the subchapters list based on current chapter
   * @private
   */
  _updateSubchapters() {
    this._subchapters = [];

    if (!this._currentChapter || !this._journalParser || !this._selectedJournalId) {
      return;
    }

    // Get the chapter structure
    const structure = this._journalParser.extractChapterStructure(this._selectedJournalId);
    if (!structure) {
      return;
    }

    // Find the current chapter node in the structure
    const currentNode = this._findNodeById(structure.chapters, this._currentChapter.id);
    if (!currentNode || !currentNode.children) {
      return;
    }

    // Extract immediate children as subchapters
    for (const child of currentNode.children) {
      this._subchapters.push({
        id: child.id,
        title: child.title,
        level: child.level,
        type: child.type,
        path: `${this._currentChapter.path} > ${child.title}`
      });
    }

    this._logger.debug(`Found ${this._subchapters.length} subchapters`);
  }

  /**
   * Finds a node by ID in the chapter hierarchy
   * @param {Object[]} nodes - Array of chapter nodes
   * @param {string} nodeId - The node ID to find
   * @returns {Object|null} The found node or null
   * @private
   */
  _findNodeById(nodes, nodeId) {
    for (const node of nodes) {
      if (node.id === nodeId) {
        return node;
      }

      if (node.children && node.children.length > 0) {
        const found = this._findNodeById(node.children, nodeId);
        if (found) {
          return found;
        }
      }
    }

    return null;
  }
}
