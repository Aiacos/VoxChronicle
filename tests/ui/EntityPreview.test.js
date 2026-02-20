/**
 * EntityPreview Unit Tests
 *
 * Tests for the EntityPreview UI component that allows reviewing extracted
 * entities before publishing to Kanka.
 *
 * @module tests/ui/EntityPreview.test
 */

// Ensure foundry global exists before EntityPreview.mjs is loaded
// (it reads foundry.applications.api at module scope)
vi.hoisted(() => {
  if (!globalThis.foundry) {
    class MockAppV2 {
      static DEFAULT_OPTIONS = {};
      static PARTS = {};
      constructor() {
        this.rendered = false;
        this._element = null;
      }
      render() { this.rendered = true; return this; }
      close() { this.rendered = false; return Promise.resolve(); }
    }
    globalThis.foundry = {
      applications: {
        api: {
          ApplicationV2: MockAppV2,
          HandlebarsApplicationMixin: (Base) => class extends Base {
            static PARTS = {};
          }
        }
      },
      utils: { mergeObject: (a, b) => ({ ...a, ...b }) }
    };
  }
});

vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: vi.fn(() => ({
      debug: vi.fn(),
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }))
  }
}));

vi.mock('../../scripts/core/Settings.mjs', () => ({
  Settings: {
    getConfigurationStatus: vi.fn(() => ({
      openai: true,
      kanka: true,
      ready: true
    }))
  }
}));

vi.mock('../../scripts/core/VoxChronicle.mjs', () => ({
  VoxChronicle: {
    getInstance: vi.fn(() => ({
      kankaService: {
        createCharacter: vi.fn(() => Promise.resolve({ data: { id: 1, entity_id: 100 } })),
        createLocation: vi.fn(() => Promise.resolve({ data: { id: 2, entity_id: 200 } })),
        createItem: vi.fn(() => Promise.resolve({ data: { id: 3, entity_id: 300 } })),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      },
      imageGenerationService: {
        generatePortrait: vi.fn(() => Promise.resolve('http://example.com/image.png'))
      }
    }))
  }
}));

// Mock the RelationshipGraph import used by EntityPreview.mjs
// Store last-constructed instance for assertion in tests
const _mockRelationshipGraphInstances = [];
vi.mock('../../scripts/ui/RelationshipGraph.mjs', () => {
  class MockRelationshipGraph {
    constructor(options) {
      this._options = options;
      this._renderFn = vi.fn();
      _mockRelationshipGraphInstances.push(this);
    }
    render() { return this._renderFn(); }
    close() { return Promise.resolve(); }
  }
  return { RelationshipGraph: MockRelationshipGraph };
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EntityPreview, EntitySelectionState, PreviewMode } from '../../scripts/ui/EntityPreview.mjs';
import { Settings } from '../../scripts/core/Settings.mjs';
import { VoxChronicle } from '../../scripts/core/VoxChronicle.mjs';

describe('EntityPreview', () => {
  let preview;
  let sampleEntities;
  let sampleRelationships;

  beforeEach(() => {
    // Fresh copies each test to avoid cross-test mutation
    sampleEntities = {
      characters: [
        { name: 'Gandalf', description: 'A wizard', isNPC: true },
        { name: 'Frodo', description: 'A hobbit', isNPC: false }
      ],
      locations: [
        { name: 'Rivendell', description: 'Elven city', type: 'City' }
      ],
      items: [
        { name: 'The One Ring', description: 'A powerful ring', type: 'Artifact' }
      ]
    };

    sampleRelationships = [
      {
        sourceEntity: 'Gandalf',
        targetEntity: 'Frodo',
        relationType: 'ally',
        confidence: 8,
        description: 'Wizard and hobbit friends'
      },
      {
        sourceEntity: 'Frodo',
        targetEntity: 'The One Ring',
        relationType: 'neutral',
        confidence: 5,
        description: 'Ring bearer'
      }
    ];

    preview = new EntityPreview();

    // Clear tracked RelationshipGraph instances
    _mockRelationshipGraphInstances.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Constructor tests ---

  describe('constructor', () => {
    it('should create instance with default state', () => {
      expect(preview).toBeDefined();
      expect(preview._mode).toBe('review');
      expect(preview._entities.characters).toEqual([]);
      expect(preview._entities.locations).toEqual([]);
      expect(preview._entities.items).toEqual([]);
      expect(preview._relationships).toEqual([]);
    });

    it('should accept entities in options', () => {
      const p = new EntityPreview({ entities: sampleEntities });
      expect(p._entities.characters).toHaveLength(2);
      expect(p._entities.locations).toHaveLength(1);
      expect(p._entities.items).toHaveLength(1);
    });

    it('should accept relationships in options', () => {
      const p = new EntityPreview({ relationships: sampleRelationships });
      expect(p._relationships).toHaveLength(2);
    });

    it('should accept onConfirm callback in options', () => {
      const cb = vi.fn();
      const p = new EntityPreview({ onConfirm: cb });
      expect(p._onConfirmCallback).toBe(cb);
    });

    it('should accept onCancel callback in options', () => {
      const cb = vi.fn();
      const p = new EntityPreview({ onCancel: cb });
      expect(p._onCancelCallback).toBe(cb);
    });

    it('should initialize selections when entities are provided', () => {
      const p = new EntityPreview({ entities: sampleEntities });
      expect(p._selections.size).toBe(4); // 2 chars + 1 loc + 1 item
      // All should be selected by default
      for (const value of p._selections.values()) {
        expect(value).toBe(true);
      }
    });

    it('should initialize relationship selections when provided', () => {
      const p = new EntityPreview({
        entities: sampleEntities,
        relationships: sampleRelationships
      });
      expect(p._selections.get('relationship-0')).toBe(true);
      expect(p._selections.get('relationship-1')).toBe(true);
    });
  });

  // --- Static properties ---

  describe('static properties', () => {
    it('should have DEFAULT_OPTIONS with correct id', () => {
      expect(EntityPreview.DEFAULT_OPTIONS.id).toBe('vox-chronicle-entity-preview');
    });

    it('should have DEFAULT_OPTIONS with correct classes', () => {
      expect(EntityPreview.DEFAULT_OPTIONS.classes).toContain('vox-chronicle');
      expect(EntityPreview.DEFAULT_OPTIONS.classes).toContain('entity-preview');
    });

    it('should define action handlers', () => {
      const actions = EntityPreview.DEFAULT_OPTIONS.actions;
      expect(actions['select-all']).toBeDefined();
      expect(actions['deselect-all']).toBeDefined();
      expect(actions['confirm-create']).toBeDefined();
      expect(actions['skip-all']).toBeDefined();
      expect(actions['cancel']).toBeDefined();
      expect(actions['close']).toBeDefined();
      expect(actions['retry']).toBeDefined();
      expect(actions['edit-description']).toBeDefined();
      expect(actions['generate-portrait']).toBeDefined();
      expect(actions['toggle-section']).toBeDefined();
      expect(actions['view-graph']).toBeDefined();
    });

    it('should have PARTS with main template', () => {
      expect(EntityPreview.PARTS.main).toBeDefined();
      expect(EntityPreview.PARTS.main.template).toContain('entity-preview.hbs');
    });
  });

  // --- Exported enums ---

  describe('EntitySelectionState', () => {
    it('should have NONE, SOME, ALL values', () => {
      expect(EntitySelectionState.NONE).toBe('none');
      expect(EntitySelectionState.SOME).toBe('some');
      expect(EntitySelectionState.ALL).toBe('all');
    });
  });

  describe('PreviewMode', () => {
    it('should have REVIEW, CREATING, COMPLETE, ERROR values', () => {
      expect(PreviewMode.REVIEW).toBe('review');
      expect(PreviewMode.CREATING).toBe('creating');
      expect(PreviewMode.COMPLETE).toBe('complete');
      expect(PreviewMode.ERROR).toBe('error');
    });
  });

  // --- setEntities ---

  describe('setEntities', () => {
    it('should set entities and initialize selections', () => {
      preview.setEntities(sampleEntities);
      expect(preview._entities.characters).toHaveLength(2);
      expect(preview._entities.locations).toHaveLength(1);
      expect(preview._entities.items).toHaveLength(1);
      expect(preview._selections.size).toBe(4);
    });

    it('should handle missing entity types gracefully', () => {
      preview.setEntities({ characters: [{ name: 'Test' }] });
      expect(preview._entities.characters).toHaveLength(1);
      expect(preview._entities.locations).toEqual([]);
      expect(preview._entities.items).toEqual([]);
    });

    it('should handle non-array values gracefully', () => {
      preview.setEntities({ characters: 'not-an-array', locations: null, items: undefined });
      expect(preview._entities.characters).toEqual([]);
      expect(preview._entities.locations).toEqual([]);
      expect(preview._entities.items).toEqual([]);
    });

    it('should clear previous selections', () => {
      preview.setEntities(sampleEntities);
      expect(preview._selections.size).toBe(4);

      preview.setEntities({ characters: [{ name: 'Solo' }] });
      expect(preview._selections.size).toBe(1);
    });

    it('should select all entities by default', () => {
      preview.setEntities(sampleEntities);
      for (const selected of preview._selections.values()) {
        expect(selected).toBe(true);
      }
    });
  });

  // --- setRelationships ---

  describe('setRelationships', () => {
    it('should set relationships and initialize selections', () => {
      preview.setRelationships(sampleRelationships);
      expect(preview._relationships).toHaveLength(2);
      expect(preview._selections.get('relationship-0')).toBe(true);
      expect(preview._selections.get('relationship-1')).toBe(true);
    });

    it('should handle non-array input', () => {
      preview.setRelationships('not-an-array');
      expect(preview._relationships).toEqual([]);
    });

    it('should handle null input', () => {
      preview.setRelationships(null);
      expect(preview._relationships).toEqual([]);
    });
  });

  // --- _getTotalEntityCount ---

  describe('_getTotalEntityCount', () => {
    it('should return 0 for empty entities', () => {
      expect(preview._getTotalEntityCount()).toBe(0);
    });

    it('should return correct count', () => {
      preview.setEntities(sampleEntities);
      expect(preview._getTotalEntityCount()).toBe(4);
    });
  });

  // --- _getSelectedCount ---

  describe('_getSelectedCount', () => {
    it('should return 0 for no selections', () => {
      expect(preview._getSelectedCount()).toBe(0);
    });

    it('should return total when all selected', () => {
      preview.setEntities(sampleEntities);
      expect(preview._getSelectedCount()).toBe(4);
    });

    it('should return correct count when some deselected', () => {
      preview.setEntities(sampleEntities);
      preview._selections.set('characters-0', false);
      expect(preview._getSelectedCount()).toBe(3);
    });
  });

  // --- _getSelectionState ---

  describe('_getSelectionState', () => {
    it('should return NONE when no entities selected', () => {
      preview.setEntities(sampleEntities);
      for (const key of preview._selections.keys()) {
        preview._selections.set(key, false);
      }
      expect(preview._getSelectionState()).toBe(EntitySelectionState.NONE);
    });

    it('should return ALL when all entities selected', () => {
      preview.setEntities(sampleEntities);
      expect(preview._getSelectionState()).toBe(EntitySelectionState.ALL);
    });

    it('should return SOME when some entities selected', () => {
      preview.setEntities(sampleEntities);
      preview._selections.set('characters-0', false);
      expect(preview._getSelectionState()).toBe(EntitySelectionState.SOME);
    });
  });

  // --- _getRelationshipTypeLabel ---

  describe('_getRelationshipTypeLabel', () => {
    it('should return localized label for known type', () => {
      const label = preview._getRelationshipTypeLabel('ally');
      expect(label).toBeDefined();
    });

    it('should handle null/undefined type', () => {
      const label = preview._getRelationshipTypeLabel(null);
      // When type is null/undefined, typeKey becomes 'Unknown'
      // game.i18n.localize returns the key itself by default
      expect(label).toContain('Unknown');
    });

    it('should handle empty string type', () => {
      const label = preview._getRelationshipTypeLabel('');
      // When type is empty string, typeKey becomes 'Unknown'
      expect(label).toContain('Unknown');
    });

    it('should capitalize first letter for unknown type', () => {
      const label = preview._getRelationshipTypeLabel('custom');
      // game.i18n.localize returns the key itself; typeKey is 'Custom'
      expect(label).toBe('VOXCHRONICLE.RelationshipGraph.Custom');
    });
  });

  // --- _mapConfidenceToAttitude ---

  describe('_mapConfidenceToAttitude', () => {
    it('should return 0 for null confidence', () => {
      expect(preview._mapConfidenceToAttitude(null)).toBe(0);
    });

    it('should return 0 for undefined confidence', () => {
      expect(preview._mapConfidenceToAttitude(undefined)).toBe(0);
    });

    it('should return 0 for out of range (below 1)', () => {
      expect(preview._mapConfidenceToAttitude(0)).toBe(0);
    });

    it('should return 0 for out of range (above 10)', () => {
      expect(preview._mapConfidenceToAttitude(11)).toBe(0);
    });

    it('should return negative values for low confidence (1-3)', () => {
      expect(preview._mapConfidenceToAttitude(1)).toBeLessThan(0);
      expect(preview._mapConfidenceToAttitude(2)).toBeLessThan(0);
      expect(preview._mapConfidenceToAttitude(3)).toBeLessThan(0);
    });

    it('should return 0 for mid-range confidence (4-7)', () => {
      expect(preview._mapConfidenceToAttitude(4)).toBe(0);
      expect(preview._mapConfidenceToAttitude(5)).toBe(0);
      expect(preview._mapConfidenceToAttitude(6)).toBe(0);
      expect(preview._mapConfidenceToAttitude(7)).toBe(0);
    });

    it('should return positive values for high confidence (8-10)', () => {
      expect(preview._mapConfidenceToAttitude(8)).toBeGreaterThan(0);
      expect(preview._mapConfidenceToAttitude(9)).toBeGreaterThan(0);
      expect(preview._mapConfidenceToAttitude(10)).toBeGreaterThan(0);
    });
  });

  // --- _batchedRender ---

  describe('_batchedRender', () => {
    it('should render immediately when time threshold exceeded', () => {
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._lastRenderTime = 0; // Long time ago
      preview._batchedRender();
      expect(preview.render).toHaveBeenCalled();
    });

    it('should render immediately when batch count threshold exceeded', () => {
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._lastRenderTime = Date.now(); // recent
      preview._renderBatchCounter = 2; // Will become 3 on increment
      preview._batchedRender();
      expect(preview.render).toHaveBeenCalled();
    });

    it('should schedule deferred render when below thresholds', () => {
      vi.useFakeTimers();
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._lastRenderTime = Date.now(); // recent
      preview._renderBatchCounter = 0;
      preview._batchedRender();
      expect(preview._pendingRender).toBe(true);
      expect(preview._renderTimeout).not.toBeNull();
      vi.useRealTimers();
    });

    it('should not schedule multiple deferred renders', () => {
      vi.useFakeTimers();
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;
      preview._batchedRender();
      const firstTimeout = preview._renderTimeout;
      preview._batchedRender();
      // Should not have changed since _pendingRender is already true
      expect(preview._renderTimeout).toBe(firstTimeout);
      vi.useRealTimers();
    });

    it('should reset batch counter after immediate render', () => {
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._lastRenderTime = 0;
      preview._renderBatchCounter = 5;
      preview._batchedRender();
      expect(preview._renderBatchCounter).toBe(0);
    });

    it('should execute deferred render after timeout elapses', () => {
      vi.useFakeTimers();
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._lastRenderTime = Date.now(); // recent, so below time threshold
      preview._renderBatchCounter = 0; // below count threshold

      preview._batchedRender();

      // Render should NOT have been called yet
      expect(preview.render).not.toHaveBeenCalled();
      expect(preview._pendingRender).toBe(true);

      // Advance past the RENDER_BATCH_INTERVAL_MS (500ms)
      vi.advanceTimersByTime(500);

      // Deferred render should now have fired
      expect(preview.render).toHaveBeenCalledTimes(1);
      expect(preview._pendingRender).toBe(false);
      expect(preview._renderTimeout).toBeNull();
      expect(preview._renderBatchCounter).toBe(0);

      vi.useRealTimers();
    });

    it('should clear deferred render when immediate render fires', () => {
      vi.useFakeTimers();
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;

      // Schedule a deferred render
      preview._batchedRender();
      expect(preview._pendingRender).toBe(true);
      const timeoutId = preview._renderTimeout;

      // Force time threshold to trigger immediate render
      preview._lastRenderTime = 0;
      preview._batchedRender();

      // Deferred render should be cleared
      expect(preview._pendingRender).toBe(false);
      expect(preview._renderTimeout).toBeNull();

      vi.useRealTimers();
    });
  });

  // --- _flushRender ---

  describe('_flushRender', () => {
    it('should force immediate render', () => {
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._flushRender();
      expect(preview.render).toHaveBeenCalled();
    });

    it('should clear pending timeout', () => {
      vi.useFakeTimers();
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._renderTimeout = setTimeout(() => {}, 1000);
      preview._pendingRender = true;
      preview._flushRender();
      expect(preview._renderTimeout).toBeNull();
      expect(preview._pendingRender).toBe(false);
      vi.useRealTimers();
    });

    it('should reset batch counter', () => {
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._renderBatchCounter = 5;
      preview._flushRender();
      expect(preview._renderBatchCounter).toBe(0);
    });
  });

  // --- _prepareContext ---

  describe('_prepareContext', () => {
    it('should return context with mode flags', async () => {
      const ctx = await preview._prepareContext();
      expect(ctx.isReview).toBe(true);
      expect(ctx.isCreating).toBe(false);
      expect(ctx.isComplete).toBe(false);
      expect(ctx.isError).toBe(false);
    });

    it('should include entity lists', async () => {
      preview.setEntities(sampleEntities);
      const ctx = await preview._prepareContext();
      expect(ctx.characters).toHaveLength(2);
      expect(ctx.locations).toHaveLength(1);
      expect(ctx.items).toHaveLength(1);
      expect(ctx.hasEntities).toBe(true);
    });

    it('should include entity counts', async () => {
      preview.setEntities(sampleEntities);
      const ctx = await preview._prepareContext();
      expect(ctx.totalCount).toBe(4);
      expect(ctx.selectedCount).toBe(4);
    });

    it('should include selection state', async () => {
      preview.setEntities(sampleEntities);
      const ctx = await preview._prepareContext();
      expect(ctx.isAllSelected).toBe(true);
      expect(ctx.isNoneSelected).toBe(false);
    });

    it('should include progress data', async () => {
      preview._mode = 'creating';
      preview._progress = { current: 2, total: 4, message: 'Working...' };
      const ctx = await preview._prepareContext();
      expect(ctx.progress.percent).toBe(50);
      expect(ctx.hasProgress).toBe(true);
    });

    it('should calculate 0% progress when total is 0', async () => {
      preview._progress = { current: 0, total: 0, message: '' };
      const ctx = await preview._prepareContext();
      expect(ctx.progress.percent).toBe(0);
    });

    it('should include results data', async () => {
      preview._mode = 'complete';
      preview._results = { created: [{ name: 'Test' }], failed: [] };
      const ctx = await preview._prepareContext();
      expect(ctx.hasResults).toBe(true);
      expect(ctx.createdCount).toBe(1);
      expect(ctx.failedCount).toBe(0);
    });

    it('should include config status', async () => {
      const ctx = await preview._prepareContext();
      expect(ctx.isKankaConfigured).toBe(true);
    });

    it('should include i18n strings', async () => {
      const ctx = await preview._prepareContext();
      expect(ctx.i18n).toBeDefined();
      expect(ctx.i18n.title).toBeDefined();
      expect(ctx.i18n.selectAll).toBeDefined();
      expect(ctx.i18n.cancel).toBeDefined();
    });

    it('should include relationship data', async () => {
      preview.setEntities(sampleEntities);
      preview.setRelationships(sampleRelationships);
      const ctx = await preview._prepareContext();
      expect(ctx.relationships).toHaveLength(2);
      expect(ctx.hasRelationships).toBe(true);
    });

    it('should tag characters with NPC/PC type labels', async () => {
      preview.setEntities(sampleEntities);
      const ctx = await preview._prepareContext();
      // Gandalf is NPC, Frodo is PC
      expect(ctx.characters[0].typeLabel).toBeDefined();
      expect(ctx.characters[1].typeLabel).toBeDefined();
    });

    it('should include entity keys in context', async () => {
      preview.setEntities(sampleEntities);
      const ctx = await preview._prepareContext();
      expect(ctx.characters[0].key).toBe('characters-0');
      expect(ctx.locations[0].key).toBe('locations-0');
      expect(ctx.items[0].key).toBe('items-0');
    });

    it('should include image loading state', async () => {
      preview.setEntities(sampleEntities);
      preview._imageLoadingStates.set('characters-0', true);
      const ctx = await preview._prepareContext();
      expect(ctx.characters[0].isGeneratingImage).toBe(true);
      expect(ctx.characters[1].isGeneratingImage).toBe(false);
    });
  });

  // --- Event handlers ---

  describe('_onToggleEntity', () => {
    it('should toggle entity selection', () => {
      preview.setEntities(sampleEntities);
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const mockEvent = {
        currentTarget: {
          dataset: { entityKey: 'characters-0' },
          checked: false
        }
      };

      preview._onToggleEntity(mockEvent);
      expect(preview._selections.get('characters-0')).toBe(false);
    });

    it('should call render after toggle', () => {
      preview.setEntities(sampleEntities);
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      preview._onToggleEntity({
        currentTarget: {
          dataset: { entityKey: 'characters-0' },
          checked: true
        }
      });

      expect(preview.render).toHaveBeenCalled();
    });

    it('should not toggle if no key present', () => {
      preview.setEntities(sampleEntities);
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      preview._onToggleEntity({
        currentTarget: { dataset: {}, checked: false }
      });

      expect(preview.render).not.toHaveBeenCalled();
    });
  });

  describe('_onSelectAll', () => {
    it('should select all entities', () => {
      preview.setEntities(sampleEntities);
      // Deselect one first
      preview._selections.set('characters-0', false);
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      preview._onSelectAll({ preventDefault: vi.fn() });

      for (const value of preview._selections.values()) {
        expect(value).toBe(true);
      }
    });
  });

  describe('_onDeselectAll', () => {
    it('should deselect all entities', () => {
      preview.setEntities(sampleEntities);
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      preview._onDeselectAll({ preventDefault: vi.fn() });

      for (const value of preview._selections.values()) {
        expect(value).toBe(false);
      }
    });
  });

  describe('_onSkipAll', () => {
    it('should call cancel callback with skipped flag', () => {
      const cb = vi.fn();
      preview._onCancelCallback = cb;
      vi.spyOn(preview, 'close').mockImplementation(() => Promise.resolve());

      preview._onSkipAll({ preventDefault: vi.fn() });

      expect(cb).toHaveBeenCalledWith({ skipped: true });
    });

    it('should close the preview', () => {
      vi.spyOn(preview, 'close').mockImplementation(() => Promise.resolve());
      preview._onSkipAll({ preventDefault: vi.fn() });
      expect(preview.close).toHaveBeenCalled();
    });

    it('should not throw if no cancel callback', () => {
      vi.spyOn(preview, 'close').mockImplementation(() => Promise.resolve());
      expect(() => {
        preview._onSkipAll({ preventDefault: vi.fn() });
      }).not.toThrow();
    });
  });

  describe('_onCancel', () => {
    it('should call cancel callback with cancelled flag', () => {
      const cb = vi.fn();
      preview._onCancelCallback = cb;
      vi.spyOn(preview, 'close').mockImplementation(() => Promise.resolve());

      preview._onCancel({ preventDefault: vi.fn() });

      expect(cb).toHaveBeenCalledWith({ cancelled: true });
    });

    it('should close the preview', () => {
      vi.spyOn(preview, 'close').mockImplementation(() => Promise.resolve());
      preview._onCancel({ preventDefault: vi.fn() });
      expect(preview.close).toHaveBeenCalled();
    });
  });

  describe('_onClose', () => {
    it('should close the preview', () => {
      vi.spyOn(preview, 'close').mockImplementation(() => Promise.resolve());
      preview._onClose({ preventDefault: vi.fn() });
      expect(preview.close).toHaveBeenCalled();
    });
  });

  describe('_onRetry', () => {
    it('should reset to review mode', () => {
      preview._mode = 'error';
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      preview._onRetry({ preventDefault: vi.fn() });

      expect(preview._mode).toBe('review');
    });

    it('should reset results', () => {
      preview._results = { created: [{ name: 'Test' }], failed: [{ name: 'Failed' }] };
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      preview._onRetry({ preventDefault: vi.fn() });

      expect(preview._results.created).toEqual([]);
      expect(preview._results.failed).toEqual([]);
    });

    it('should call render', () => {
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview._onRetry({ preventDefault: vi.fn() });
      expect(preview.render).toHaveBeenCalled();
    });
  });

  describe('_onEditDescription', () => {
    it('should do nothing if entity type is missing', async () => {
      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityIndex: '0' } }
      };
      await preview._onEditDescription(event);
      // No error expected
    });

    it('should do nothing if entity index is NaN', async () => {
      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: 'abc' } }
      };
      await preview._onEditDescription(event);
      // No error expected
    });

    it('should do nothing if entity not found', async () => {
      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: '99' } }
      };
      await preview._onEditDescription(event);
      // No error expected
    });

    it('should use target parameter if provided', async () => {
      preview.setEntities(sampleEntities);
      vi.spyOn(preview, '_showEditDialog').mockResolvedValue(null);

      const event = { preventDefault: vi.fn(), currentTarget: { dataset: {} } };
      const target = { dataset: { entityType: 'characters', entityIndex: '0' } };

      await preview._onEditDescription(event, target);
      expect(preview._showEditDialog).toHaveBeenCalledWith('Gandalf', 'A wizard');
    });

    it('should update description when dialog returns new value', async () => {
      preview.setEntities(sampleEntities);
      vi.spyOn(preview, '_showEditDialog').mockResolvedValue('Updated description');
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: '0' } }
      };

      await preview._onEditDescription(event);
      expect(preview._entities.characters[0].description).toBe('Updated description');
      expect(preview.render).toHaveBeenCalled();
    });

    it('should not update if dialog returns null', async () => {
      preview.setEntities(sampleEntities);
      vi.spyOn(preview, '_showEditDialog').mockResolvedValue(null);
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: '0' } }
      };

      await preview._onEditDescription(event);
      expect(preview._entities.characters[0].description).toBe('A wizard');
      expect(preview.render).not.toHaveBeenCalled();
    });

    it('should not update if dialog returns same value', async () => {
      preview.setEntities(sampleEntities);
      vi.spyOn(preview, '_showEditDialog').mockResolvedValue('A wizard');
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: '0' } }
      };

      await preview._onEditDescription(event);
      // The source code checks (newDescription !== null && newDescription !== entity.description)
      // Same value means no update, no render
      expect(preview._entities.characters[0].description).toBe('A wizard');
    });
  });

  describe('_onGeneratePortrait', () => {
    it('should do nothing if entityType missing', async () => {
      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityIndex: '0' } }
      };
      await preview._onGeneratePortrait(event);
    });

    it('should do nothing if entityIndex is NaN', async () => {
      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: 'abc' } }
      };
      await preview._onGeneratePortrait(event);
    });

    it('should warn if OpenAI is not configured', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: false, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: '0' } }
      };

      await preview._onGeneratePortrait(event);
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should set loading state and generate portrait', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: '0' } }
      };

      await preview._onGeneratePortrait(event);

      expect(preview._entities.characters[0].imageUrl).toBe('http://example.com/image.png');
      expect(preview._imageLoadingStates.get('characters-0')).toBe(false);
    });

    it('should handle image generation error', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      VoxChronicle.getInstance.mockReturnValue({
        imageGenerationService: {
          generatePortrait: vi.fn(() => Promise.reject(new Error('API error')))
        }
      });
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: '0' } }
      };

      await preview._onGeneratePortrait(event);

      expect(ui.notifications.error).toHaveBeenCalled();
      expect(preview._imageLoadingStates.get('characters-0')).toBe(false);
    });

    it('should throw if image service is not available', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      VoxChronicle.getInstance.mockReturnValue({
        imageGenerationService: null
      });
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const event = {
        preventDefault: vi.fn(),
        currentTarget: { dataset: { entityType: 'characters', entityIndex: '0' } }
      };

      await preview._onGeneratePortrait(event);
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should use target parameter if provided', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      const event = { preventDefault: vi.fn(), currentTarget: { dataset: {} } };
      const target = { dataset: { entityType: 'characters', entityIndex: '0' } };

      await preview._onGeneratePortrait(event, target);
      expect(preview._entities.characters[0].imageUrl).toBeDefined();
    });
  });

  describe('_onToggleSection', () => {
    it('should toggle collapsed class on section', () => {
      const section = {
        classList: { toggle: vi.fn() }
      };
      const header = {
        closest: vi.fn(() => section)
      };

      preview._onToggleSection({ preventDefault: vi.fn() }, header);
      expect(section.classList.toggle).toHaveBeenCalledWith('collapsed');
    });

    it('should use event.currentTarget if no target', () => {
      const section = {
        classList: { toggle: vi.fn() }
      };
      const event = {
        preventDefault: vi.fn(),
        currentTarget: { closest: vi.fn(() => section) }
      };

      preview._onToggleSection(event);
      expect(section.classList.toggle).toHaveBeenCalledWith('collapsed');
    });

    it('should handle missing section gracefully', () => {
      const header = { closest: vi.fn(() => null) };
      expect(() => {
        preview._onToggleSection({ preventDefault: vi.fn() }, header);
      }).not.toThrow();
    });
  });

  describe('_onViewGraph', () => {
    it('should create a RelationshipGraph with correct entities and relationships', () => {
      preview.setEntities(sampleEntities);
      preview.setRelationships(sampleRelationships);

      preview._onViewGraph({ preventDefault: vi.fn() });

      expect(_mockRelationshipGraphInstances).toHaveLength(1);
      const graphInstance = _mockRelationshipGraphInstances[0];
      expect(graphInstance._options.entities).toBe(preview._entities);
      expect(graphInstance._options.relationships).toBe(preview._relationships);
    });

    it('should call render(true) on the created graph', () => {
      preview.setEntities(sampleEntities);
      preview.setRelationships(sampleRelationships);

      preview._onViewGraph({ preventDefault: vi.fn() });

      const graphInstance = _mockRelationshipGraphInstances[0];
      expect(graphInstance._renderFn).toHaveBeenCalled();
    });
  });

  // --- _onConfirmCreate ---

  describe('_onConfirmCreate', () => {
    it('should warn if no entities selected', async () => {
      preview.setEntities(sampleEntities);
      for (const key of preview._selections.keys()) {
        preview._selections.set(key, false);
      }
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      await preview._onConfirmCreate({ preventDefault: vi.fn() });

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should warn if Kanka is not configured', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: false });
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      await preview._onConfirmCreate({ preventDefault: vi.fn() });

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should set mode to CREATING and call _createEntitiesInKanka', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      vi.spyOn(preview, '_createEntitiesInKanka').mockResolvedValue();

      await preview._onConfirmCreate({ preventDefault: vi.fn() });

      expect(preview._createEntitiesInKanka).toHaveBeenCalled();
    });

    it('should call onConfirm callback with results on success', async () => {
      preview.setEntities(sampleEntities);
      const cb = vi.fn();
      preview._onConfirmCallback = cb;
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      vi.spyOn(preview, '_createEntitiesInKanka').mockResolvedValue();

      await preview._onConfirmCreate({ preventDefault: vi.fn() });

      expect(cb).toHaveBeenCalledWith(preview._results);
    });

    it('should set mode to ERROR on exception', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      vi.spyOn(preview, '_createEntitiesInKanka').mockRejectedValue(new Error('fail'));

      await preview._onConfirmCreate({ preventDefault: vi.fn() });

      expect(preview._mode).toBe('error');
    });

    it('should set mode to COMPLETE on success with no failures', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      vi.spyOn(preview, '_createEntitiesInKanka').mockImplementation(async () => {
        preview._results.created = [{ name: 'Test' }];
        preview._results.failed = [];
      });

      await preview._onConfirmCreate({ preventDefault: vi.fn() });

      expect(preview._mode).toBe('complete');
    });

    it('should set mode to ERROR when all fail', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      vi.spyOn(preview, '_createEntitiesInKanka').mockImplementation(async () => {
        preview._results.created = [];
        preview._results.failed = [{ name: 'Failed' }];
      });

      await preview._onConfirmCreate({ preventDefault: vi.fn() });

      expect(preview._mode).toBe('error');
    });

    it('should set mode to COMPLETE for partial success', async () => {
      preview.setEntities(sampleEntities);
      Settings.getConfigurationStatus.mockReturnValue({ openai: true, kanka: true });
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      vi.spyOn(preview, '_createEntitiesInKanka').mockImplementation(async () => {
        preview._results.created = [{ name: 'Created' }];
        preview._results.failed = [{ name: 'Failed' }];
      });

      await preview._onConfirmCreate({ preventDefault: vi.fn() });

      expect(preview._mode).toBe('complete');
    });
  });

  // --- getSelectedEntities ---

  describe('getSelectedEntities', () => {
    it('should return empty when nothing set', () => {
      const selected = preview.getSelectedEntities();
      expect(selected.characters).toEqual([]);
      expect(selected.locations).toEqual([]);
      expect(selected.items).toEqual([]);
    });

    it('should return all entities when all selected', () => {
      preview.setEntities(sampleEntities);
      const selected = preview.getSelectedEntities();
      expect(selected.characters).toHaveLength(2);
      expect(selected.locations).toHaveLength(1);
      expect(selected.items).toHaveLength(1);
    });

    it('should return only selected entities', () => {
      preview.setEntities(sampleEntities);
      preview._selections.set('characters-0', false);
      preview._selections.set('items-0', false);

      const selected = preview.getSelectedEntities();
      expect(selected.characters).toHaveLength(1);
      expect(selected.characters[0].name).toBe('Frodo');
      expect(selected.locations).toHaveLength(1);
      expect(selected.items).toHaveLength(0);
    });
  });

  // --- getSelectedRelationships ---

  describe('getSelectedRelationships', () => {
    it('should return empty when no relationships', () => {
      expect(preview.getSelectedRelationships()).toEqual([]);
    });

    it('should return all when all selected', () => {
      preview.setRelationships(sampleRelationships);
      expect(preview.getSelectedRelationships()).toHaveLength(2);
    });

    it('should return only selected relationships', () => {
      preview.setRelationships(sampleRelationships);
      preview._selections.set('relationship-0', false);
      const selected = preview.getSelectedRelationships();
      expect(selected).toHaveLength(1);
      expect(selected[0].sourceEntity).toBe('Frodo');
    });
  });

  // --- getAllEntities ---

  describe('getAllEntities', () => {
    it('should return all entities', () => {
      preview.setEntities(sampleEntities);
      const all = preview.getAllEntities();
      expect(all.characters).toHaveLength(2);
      expect(all.locations).toHaveLength(1);
      expect(all.items).toHaveLength(1);
    });

    it('should return a copy', () => {
      preview.setEntities(sampleEntities);
      const all = preview.getAllEntities();
      all.characters = [];
      expect(preview._entities.characters).toHaveLength(2);
    });
  });

  // --- getAllRelationships ---

  describe('getAllRelationships', () => {
    it('should return all relationships', () => {
      preview.setRelationships(sampleRelationships);
      expect(preview.getAllRelationships()).toHaveLength(2);
    });

    it('should return a copy', () => {
      preview.setRelationships(sampleRelationships);
      const all = preview.getAllRelationships();
      all.push({});
      expect(preview._relationships).toHaveLength(2);
    });
  });

  // --- getResults ---

  describe('getResults', () => {
    it('should return results with created and failed', () => {
      preview._results = { created: [{ name: 'A' }], failed: [{ name: 'B' }] };
      const results = preview.getResults();
      expect(results.created).toHaveLength(1);
      expect(results.failed).toHaveLength(1);
    });

    it('should return a shallow copy of the results object', () => {
      preview._results = { created: [{ name: 'A' }], failed: [] };
      const results = preview.getResults();
      // Shallow copy: changing the top-level property doesn't affect original
      results.newProp = 'test';
      expect(preview._results.newProp).toBeUndefined();
    });
  });

  // --- reset ---

  describe('reset', () => {
    it('should reset all state', () => {
      preview.setEntities(sampleEntities);
      preview.setRelationships(sampleRelationships);
      preview._mode = 'complete';
      preview._progress = { current: 5, total: 5, message: 'Done' };
      preview._results = { created: [{ name: 'A' }], failed: [] };
      preview._imageLoadingStates.set('characters-0', true);
      vi.spyOn(preview, 'render').mockImplementation(() => {});

      preview.reset();

      expect(preview._entities.characters).toEqual([]);
      expect(preview._entities.locations).toEqual([]);
      expect(preview._entities.items).toEqual([]);
      expect(preview._relationships).toEqual([]);
      expect(preview._selections.size).toBe(0);
      expect(preview._imageLoadingStates.size).toBe(0);
      expect(preview._mode).toBe('review');
      expect(preview._progress.current).toBe(0);
      expect(preview._results.created).toEqual([]);
    });

    it('should call render', () => {
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      preview.reset();
      expect(preview.render).toHaveBeenCalled();
    });
  });

  // --- close ---

  describe('close', () => {
    it('should clear pending render timeout', async () => {
      vi.useFakeTimers();
      preview._renderTimeout = setTimeout(() => {}, 5000);
      preview._pendingRender = true;

      await preview.close();

      expect(preview._renderTimeout).toBeNull();
      expect(preview._pendingRender).toBe(false);
      vi.useRealTimers();
    });

    it('should not throw if no pending timeout', async () => {
      await expect(preview.close()).resolves.not.toThrow();
    });
  });

  // --- static show ---

  describe('static show', () => {
    it('should return a promise', () => {
      const result = EntityPreview.show(sampleEntities);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  // --- _onRender ---

  describe('_onRender', () => {
    it('should attach change listeners to checkboxes', () => {
      const mockCheckbox = {
        addEventListener: vi.fn()
      };
      const mockElement = {
        querySelectorAll: vi.fn(() => [mockCheckbox])
      };
      // The vi.hoisted mock doesn't define a getter for `element`,
      // so we define it on the instance via Object.defineProperty
      Object.defineProperty(preview, 'element', {
        get: () => mockElement,
        configurable: true
      });

      preview._onRender({}, {});

      expect(mockElement.querySelectorAll).toHaveBeenCalledWith(
        'input[type="checkbox"][data-entity-key]'
      );
      expect(mockCheckbox.addEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should abort previous listeners before adding new ones', () => {
      const mockElement = {
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(preview, 'element', {
        get: () => mockElement,
        configurable: true
      });

      // First render
      preview._onRender({}, {});

      // Second render - should abort previous controller
      preview._onRender({}, {});
      // No error means old controller was aborted cleanly
    });

    it('should handle null element gracefully', () => {
      Object.defineProperty(preview, 'element', {
        get: () => null,
        configurable: true
      });

      expect(() => preview._onRender({}, {})).not.toThrow();
    });
  });

  // --- _createEntitiesInKanka ---

  describe('_createEntitiesInKanka', () => {
    it('should throw if kankaService is not available', async () => {
      VoxChronicle.getInstance.mockReturnValue({ kankaService: null });
      vi.spyOn(preview, 'render').mockImplementation(() => {});
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await expect(
        preview._createEntitiesInKanka({ characters: [], locations: [], items: [] })
      ).rejects.toThrow('Kanka service not available');
    });

    it('should handle character creation failure gracefully', async () => {
      const mockKanka = {
        createCharacter: vi.fn(() => Promise.reject(new Error('API fail'))),
        createLocation: vi.fn(() => Promise.resolve({ data: { id: 2, entity_id: 200 } })),
        createItem: vi.fn(() => Promise.resolve({ data: { id: 3, entity_id: 300 } })),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      VoxChronicle.getInstance.mockReturnValue({ kankaService: mockKanka });
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await preview._createEntitiesInKanka({
        characters: [{ name: 'FailChar', description: 'test' }],
        locations: [],
        items: []
      });

      expect(preview._results.failed).toHaveLength(1);
      expect(preview._results.failed[0].name).toBe('FailChar');
    });

    it('should successfully create characters, locations, and items', async () => {
      const mockKanka = {
        createCharacter: vi.fn(() => Promise.resolve({ data: { id: 10, entity_id: 100 } })),
        createLocation: vi.fn(() => Promise.resolve({ data: { id: 20, entity_id: 200 } })),
        createItem: vi.fn(() => Promise.resolve({ data: { id: 30, entity_id: 300 } })),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      VoxChronicle.getInstance.mockReturnValue({ kankaService: mockKanka });
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await preview._createEntitiesInKanka({
        characters: [
          { name: 'Gandalf', description: 'A wizard', isNPC: true },
          { name: 'Frodo', description: 'A hobbit', isNPC: false }
        ],
        locations: [
          { name: 'Rivendell', description: 'Elven city', type: 'City' }
        ],
        items: [
          { name: 'The One Ring', description: 'A powerful ring', type: 'Artifact' }
        ]
      });

      expect(preview._results.created).toHaveLength(4);
      expect(preview._results.failed).toHaveLength(0);

      // Verify character results
      const charResults = preview._results.created.filter((r) => r.type === 'character');
      expect(charResults).toHaveLength(2);
      expect(charResults[0]).toEqual({
        type: 'character',
        name: 'Gandalf',
        kankaId: 10,
        entityId: 100
      });
      expect(charResults[1]).toEqual({
        type: 'character',
        name: 'Frodo',
        kankaId: 10,
        entityId: 100
      });

      // Verify location result
      const locResults = preview._results.created.filter((r) => r.type === 'location');
      expect(locResults).toHaveLength(1);
      expect(locResults[0]).toEqual({
        type: 'location',
        name: 'Rivendell',
        kankaId: 20,
        entityId: 200
      });

      // Verify item result
      const itemResults = preview._results.created.filter((r) => r.type === 'item');
      expect(itemResults).toHaveLength(1);
      expect(itemResults[0]).toEqual({
        type: 'item',
        name: 'The One Ring',
        kankaId: 30,
        entityId: 300
      });
    });

    it('should populate entityNameToId mapping for created entities', async () => {
      // Use distinct entity_id values per call to verify each mapping
      let charCallCount = 0;
      const mockKanka = {
        createCharacter: vi.fn(() => {
          charCallCount++;
          return Promise.resolve({ data: { id: charCallCount, entity_id: charCallCount * 100 } });
        }),
        createLocation: vi.fn(() => Promise.resolve({ data: { id: 20, entity_id: 200 } })),
        createItem: vi.fn(() => Promise.resolve({ data: { id: 30, entity_id: 300 } })),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      VoxChronicle.getInstance.mockReturnValue({ kankaService: mockKanka });

      // Set up relationships that reference these entities to verify entityNameToId was populated
      preview.setRelationships([{
        sourceEntity: 'Gandalf',
        targetEntity: 'Rivendell',
        relationType: 'resides_in',
        confidence: 7
      }]);
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await preview._createEntitiesInKanka({
        characters: [{ name: 'Gandalf', description: 'A wizard', isNPC: true }],
        locations: [{ name: 'Rivendell', description: 'Elven city', type: 'City' }],
        items: []
      });

      // Verify batchCreateRelations was called (proving entityNameToId was populated)
      expect(mockKanka.batchCreateRelations).toHaveBeenCalled();
      const [sourceEntityId, relations] = mockKanka.batchCreateRelations.mock.calls[0];
      expect(sourceEntityId).toBe(100); // Gandalf's entity_id
      expect(relations[0].target_id).toBe(200); // Rivendell's entity_id
    });

    it('should handle location creation failure gracefully', async () => {
      const mockKanka = {
        createCharacter: vi.fn(() => Promise.resolve({ data: { id: 1, entity_id: 100 } })),
        createLocation: vi.fn(() => Promise.reject(new Error('Location API fail'))),
        createItem: vi.fn(() => Promise.resolve({ data: { id: 3, entity_id: 300 } })),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      VoxChronicle.getInstance.mockReturnValue({ kankaService: mockKanka });
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await preview._createEntitiesInKanka({
        characters: [],
        locations: [{ name: 'FailLocation', description: 'test', type: 'City' }],
        items: []
      });

      expect(preview._results.failed).toHaveLength(1);
      expect(preview._results.failed[0]).toEqual({
        type: 'location',
        name: 'FailLocation',
        error: 'Location API fail'
      });
      expect(preview._results.created).toHaveLength(0);
    });

    it('should handle item creation failure gracefully', async () => {
      const mockKanka = {
        createCharacter: vi.fn(() => Promise.resolve({ data: { id: 1, entity_id: 100 } })),
        createLocation: vi.fn(() => Promise.resolve({ data: { id: 2, entity_id: 200 } })),
        createItem: vi.fn(() => Promise.reject(new Error('Item API fail'))),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      VoxChronicle.getInstance.mockReturnValue({ kankaService: mockKanka });
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await preview._createEntitiesInKanka({
        characters: [],
        locations: [],
        items: [{ name: 'FailItem', description: 'test', type: 'Artifact' }]
      });

      expect(preview._results.failed).toHaveLength(1);
      expect(preview._results.failed[0]).toEqual({
        type: 'item',
        name: 'FailItem',
        error: 'Item API fail'
      });
      expect(preview._results.created).toHaveLength(0);
    });

    it('should show info notification when entities are created', async () => {
      const mockKanka = {
        createCharacter: vi.fn(() => Promise.resolve({ data: { id: 1, entity_id: 100 } })),
        createLocation: vi.fn(() => Promise.resolve({ data: { id: 2, entity_id: 200 } })),
        createItem: vi.fn(() => Promise.resolve({ data: { id: 3, entity_id: 300 } })),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      VoxChronicle.getInstance.mockReturnValue({ kankaService: mockKanka });
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await preview._createEntitiesInKanka({
        characters: [{ name: 'Gandalf', description: 'test' }],
        locations: [],
        items: []
      });

      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should show warn notification when some entities fail', async () => {
      const mockKanka = {
        createCharacter: vi.fn(() => Promise.resolve({ data: { id: 1, entity_id: 100 } })),
        createLocation: vi.fn(() => Promise.reject(new Error('fail'))),
        createItem: vi.fn(() => Promise.resolve({ data: { id: 3, entity_id: 300 } })),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      VoxChronicle.getInstance.mockReturnValue({ kankaService: mockKanka });
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await preview._createEntitiesInKanka({
        characters: [{ name: 'Gandalf', description: 'test' }],
        locations: [{ name: 'FailLoc', description: 'test', type: 'City' }],
        items: []
      });

      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should increment progress.current for each entity regardless of success or failure', async () => {
      const mockKanka = {
        createCharacter: vi.fn(() => Promise.resolve({ data: { id: 1, entity_id: 100 } })),
        createLocation: vi.fn(() => Promise.reject(new Error('fail'))),
        createItem: vi.fn(() => Promise.resolve({ data: { id: 3, entity_id: 300 } })),
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      VoxChronicle.getInstance.mockReturnValue({ kankaService: mockKanka });
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});
      vi.spyOn(preview, '_flushRender').mockImplementation(() => {});

      await preview._createEntitiesInKanka({
        characters: [{ name: 'Gandalf', description: 'test' }],
        locations: [{ name: 'FailLoc', description: 'test', type: 'City' }],
        items: [{ name: 'Ring', description: 'test', type: 'Artifact' }]
      });

      expect(preview._progress.current).toBe(3);
    });
  });

  // --- _createRelationshipsInKanka ---

  describe('_createRelationshipsInKanka', () => {
    it('should skip relationships with missing entities', async () => {
      preview.setRelationships(sampleRelationships);
      const mockKanka = {
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});

      // Empty entity map means no entities were created
      const entityNameToId = new Map();
      await preview._createRelationshipsInKanka(entityNameToId, mockKanka);

      expect(mockKanka.batchCreateRelations).not.toHaveBeenCalled();
    });

    it('should do nothing if no relationships selected', async () => {
      // No relationships set
      const mockKanka = {
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});

      await preview._createRelationshipsInKanka(new Map(), mockKanka);

      expect(mockKanka.batchCreateRelations).not.toHaveBeenCalled();
    });

    it('should create relationships when entities exist', async () => {
      preview.setRelationships(sampleRelationships);
      const mockKanka = {
        batchCreateRelations: vi.fn(() => Promise.resolve([{ id: 1 }]))
      };
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});

      const entityNameToId = new Map([
        ['gandalf', 100],
        ['frodo', 200],
        ['the one ring', 300]
      ]);

      await preview._createRelationshipsInKanka(entityNameToId, mockKanka);

      expect(mockKanka.batchCreateRelations).toHaveBeenCalled();
    });

    it('should handle batch creation errors', async () => {
      preview.setRelationships(sampleRelationships);
      const mockKanka = {
        batchCreateRelations: vi.fn(() => Promise.reject(new Error('batch fail')))
      };
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});

      const entityNameToId = new Map([
        ['gandalf', 100],
        ['frodo', 200],
        ['the one ring', 300]
      ]);

      // Should not throw
      await expect(
        preview._createRelationshipsInKanka(entityNameToId, mockKanka)
      ).resolves.not.toThrow();
    });

    it('should count partial successes and failures from batchCreateRelations', async () => {
      preview.setRelationships([
        {
          sourceEntity: 'Gandalf',
          targetEntity: 'Frodo',
          relationType: 'ally',
          confidence: 8
        },
        {
          sourceEntity: 'Gandalf',
          targetEntity: 'The One Ring',
          relationType: 'possesses',
          confidence: 5
        }
      ]);
      const mockKanka = {
        batchCreateRelations: vi.fn(() => Promise.resolve([
          { id: 1 },
          { _error: 'Target not found', relation: 'possesses' }
        ]))
      };
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});

      const entityNameToId = new Map([
        ['gandalf', 100],
        ['frodo', 200],
        ['the one ring', 300]
      ]);

      await preview._createRelationshipsInKanka(entityNameToId, mockKanka);

      // 1 success notification + 1 failure notification
      expect(ui.notifications.info).toHaveBeenCalled();
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should count all relations as failed when batchCreateRelations throws', async () => {
      preview.setRelationships([
        {
          sourceEntity: 'Gandalf',
          targetEntity: 'Frodo',
          relationType: 'ally',
          confidence: 8
        }
      ]);
      const mockKanka = {
        batchCreateRelations: vi.fn(() => Promise.reject(new Error('network error')))
      };
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});

      const entityNameToId = new Map([
        ['gandalf', 100],
        ['frodo', 200]
      ]);

      await preview._createRelationshipsInKanka(entityNameToId, mockKanka);

      // Should show warn for failed relationships
      expect(ui.notifications.warn).toHaveBeenCalled();
    });

    it('should skip relationships where only source entity exists', async () => {
      preview.setRelationships([{
        sourceEntity: 'Gandalf',
        targetEntity: 'NonExistent',
        relationType: 'ally',
        confidence: 8
      }]);
      const mockKanka = {
        batchCreateRelations: vi.fn(() => Promise.resolve([]))
      };
      vi.spyOn(preview, '_batchedRender').mockImplementation(() => {});

      const entityNameToId = new Map([['gandalf', 100]]);

      await preview._createRelationshipsInKanka(entityNameToId, mockKanka);

      expect(mockKanka.batchCreateRelations).not.toHaveBeenCalled();
    });
  });

  // --- Static action handler delegation ---

  describe('static action handlers', () => {
    it('_onSelectAllAction should call _onSelectAll', () => {
      const mockInstance = {
        _onSelectAll: vi.fn()
      };
      const event = { preventDefault: vi.fn() };
      EntityPreview._onSelectAllAction.call(mockInstance, event, null);
      expect(mockInstance._onSelectAll).toHaveBeenCalledWith(event);
    });

    it('_onDeselectAllAction should call _onDeselectAll', () => {
      const mockInstance = {
        _onDeselectAll: vi.fn()
      };
      const event = { preventDefault: vi.fn() };
      EntityPreview._onDeselectAllAction.call(mockInstance, event, null);
      expect(mockInstance._onDeselectAll).toHaveBeenCalledWith(event);
    });

    it('_onConfirmCreateAction should call _onConfirmCreate', async () => {
      const mockInstance = {
        _onConfirmCreate: vi.fn(() => Promise.resolve())
      };
      const event = { preventDefault: vi.fn() };
      await EntityPreview._onConfirmCreateAction.call(mockInstance, event, null);
      expect(mockInstance._onConfirmCreate).toHaveBeenCalledWith(event);
    });

    it('_onSkipAllAction should call _onSkipAll', () => {
      const mockInstance = {
        _onSkipAll: vi.fn()
      };
      EntityPreview._onSkipAllAction.call(mockInstance, {}, null);
      expect(mockInstance._onSkipAll).toHaveBeenCalled();
    });

    it('_onCancelAction should call _onCancel', () => {
      const mockInstance = {
        _onCancel: vi.fn()
      };
      EntityPreview._onCancelAction.call(mockInstance, {}, null);
      expect(mockInstance._onCancel).toHaveBeenCalled();
    });

    it('_onCloseAction should call _onClose', () => {
      const mockInstance = {
        _onClose: vi.fn()
      };
      EntityPreview._onCloseAction.call(mockInstance, {}, null);
      expect(mockInstance._onClose).toHaveBeenCalled();
    });

    it('_onRetryAction should call _onRetry', () => {
      const mockInstance = {
        _onRetry: vi.fn()
      };
      EntityPreview._onRetryAction.call(mockInstance, {}, null);
      expect(mockInstance._onRetry).toHaveBeenCalled();
    });

    it('_onEditDescriptionAction should call _onEditDescription', async () => {
      const mockInstance = {
        _onEditDescription: vi.fn(() => Promise.resolve())
      };
      const event = {};
      const target = {};
      await EntityPreview._onEditDescriptionAction.call(mockInstance, event, target);
      expect(mockInstance._onEditDescription).toHaveBeenCalledWith(event, target);
    });

    it('_onGeneratePortraitAction should call _onGeneratePortrait', async () => {
      const mockInstance = {
        _onGeneratePortrait: vi.fn(() => Promise.resolve())
      };
      const event = {};
      const target = {};
      await EntityPreview._onGeneratePortraitAction.call(mockInstance, event, target);
      expect(mockInstance._onGeneratePortrait).toHaveBeenCalledWith(event, target);
    });

    it('_onToggleSectionAction should call _onToggleSection', () => {
      const mockInstance = {
        _onToggleSection: vi.fn()
      };
      const event = {};
      const target = {};
      EntityPreview._onToggleSectionAction.call(mockInstance, event, target);
      expect(mockInstance._onToggleSection).toHaveBeenCalledWith(event, target);
    });

    it('_onViewGraphAction should call _onViewGraph', () => {
      const mockInstance = {
        _onViewGraph: vi.fn()
      };
      EntityPreview._onViewGraphAction.call(mockInstance, {}, null);
      expect(mockInstance._onViewGraph).toHaveBeenCalled();
    });
  });
});
