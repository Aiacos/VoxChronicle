/**
 * EntityPreview Unit Tests
 *
 * Tests for the EntityPreview UI component.
 * Covers entity selection, preview modes, Kanka integration,
 * relationship handling, image generation, and event handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  createMockApplicationV2,
  createMockHandlebarsApplicationMixin
} from '../helpers/foundry-mock.js';

// Mock Logger before importing EntityPreview
vi.mock('../../scripts/utils/Logger.mjs', () => ({
  Logger: {
    createChild: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }),
    debug: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    LOG: 2,
    WARN: 3,
    ERROR: 4,
    NONE: 5
  }
}));

// Mock MODULE_ID
vi.mock('../../scripts/main.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));
vi.mock('../../scripts/constants.mjs', () => ({
  MODULE_ID: 'vox-chronicle'
}));

// Create shared mock instances
const mockKankaService = {
  createCharacter: vi.fn().mockResolvedValue({
    data: { id: 1, entity_id: 101 }
  }),
  createLocation: vi.fn().mockResolvedValue({
    data: { id: 2, entity_id: 102 }
  }),
  createItem: vi.fn().mockResolvedValue({
    data: { id: 3, entity_id: 103 }
  }),
  batchCreateRelations: vi.fn().mockResolvedValue([{ id: 1, target_id: 102, relation: 'ally' }])
};

const mockImageGenerationService = {
  generatePortrait: vi.fn().mockResolvedValue('https://example.com/image.png')
};

const mockVoxChronicleInstance = {
  kankaService: mockKankaService,
  imageGenerationService: mockImageGenerationService
};

// Mock VoxChronicle
vi.mock('../../scripts/core/VoxChronicle.mjs', () => ({
  VoxChronicle: {
    getInstance: () => mockVoxChronicleInstance
  }
}));

// Mock Settings
const mockSettings = {
  getConfigurationStatus: vi.fn().mockReturnValue({
    ready: true,
    openai: true,
    kanka: true
  })
};

vi.mock('../../scripts/core/Settings.mjs', () => ({
  Settings: mockSettings
}));

// Mock RelationshipGraph
const MockRelationshipGraph = vi.fn();
MockRelationshipGraph.prototype.render = vi.fn();

vi.mock('../../scripts/ui/RelationshipGraph.mjs', () => ({
  RelationshipGraph: MockRelationshipGraph
}));

// Set up DOM and globals before any test runs
setupEnvironment();

function setupEnvironment() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  // Set up ApplicationV2 + HandlebarsApplicationMixin (must be on foundry.applications.api)
  const MockAppV2 = createMockApplicationV2();
  const MockHAM = createMockHandlebarsApplicationMixin();
  global.ApplicationV2 = MockAppV2;
  global.HandlebarsApplicationMixin = MockHAM;
  global.foundry = {
    utils: {
      mergeObject: (original, other) => ({ ...original, ...other }),
      deepClone: (obj) => JSON.parse(JSON.stringify(obj))
    },
    applications: { api: { ApplicationV2: MockAppV2, HandlebarsApplicationMixin: MockHAM } }
  };

  // Set up Dialog mock with native DOM (no jQuery)
  global.Dialog = class MockDialog {
    constructor(config) {
      this.config = config;
    }
    render() {
      // Simulate clicking the save button
      if (this.config.buttons && this.config.buttons.save) {
        setTimeout(() => {
          const mockContainer = document.createElement('div');
          const mockTextarea = document.createElement('textarea');
          mockTextarea.name = 'description';
          mockTextarea.value = 'Updated description';
          mockContainer.appendChild(mockTextarea);
          // Wrap in array to simulate jQuery-like [0] access
          const mockHtml = [mockContainer];
          this.config.buttons.save.callback(mockHtml);
        }, 0);
      }
      return this;
    }
  };
}

// Import after environment is set up
const { EntityPreview, EntitySelectionState, PreviewMode } =
  await import('../../scripts/ui/EntityPreview.mjs');

/**
 * Create mock game object
 */
function createMockGame() {
  return {
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      register: vi.fn()
    },
    i18n: {
      localize: vi.fn((key) => {
        if (typeof key !== 'string') return key;
        // Return localized strings for testing
        const translations = {
          'VOXCHRONICLE.EntityPreview.Title': 'Review Extracted Entities',
          'VOXCHRONICLE.EntityPreview.Description': 'Review entities',
          'VOXCHRONICLE.EntityPreview.Characters': 'Characters',
          'VOXCHRONICLE.EntityPreview.Locations': 'Locations',
          'VOXCHRONICLE.EntityPreview.Items': 'Items',
          'VOXCHRONICLE.EntityPreview.NoEntities': 'No entities selected',
          'VOXCHRONICLE.EntityPreview.Creating': 'Creating entities...',
          'VOXCHRONICLE.Kanka.NotConfigured': 'Kanka not configured',
          'VOXCHRONICLE.ImageGeneration.Generating': 'Generating image...',
          'VOXCHRONICLE.ImageGeneration.GenerationComplete': 'Image generated',
          'VOXCHRONICLE.ImageGeneration.GenerationFailed': 'Image generation failed',
          'VOXCHRONICLE.Errors.ApiKeyMissing': 'API key missing'
        };
        return translations[key] || key;
      }),
      format: vi.fn((key, data) => {
        if (typeof key !== 'string') return key;
        let result = key;
        if (data) {
          Object.entries(data).forEach(([k, v]) => {
            result = result.replace(`{${k}}`, v);
          });
        }
        return result;
      })
    }
  };
}

/**
 * Create mock ui.notifications
 */
function createMockNotifications() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    notify: vi.fn()
  };
}

/**
 * Create mock foundry.utils
 */
function createMockFoundryUtils() {
  return {
    mergeObject: vi.fn((original, other) => ({ ...original, ...other }))
  };
}

describe('EntityPreview', () => {
  let preview;
  let mockGame;
  let mockUi;

  beforeEach(() => {
    // Reset mocks
    mockKankaService.createCharacter.mockClear();
    mockKankaService.createLocation.mockClear();
    mockKankaService.createItem.mockClear();
    mockKankaService.batchCreateRelations.mockClear();
    mockImageGenerationService.generatePortrait.mockClear();
    mockSettings.getConfigurationStatus.mockClear();
    MockRelationshipGraph.mockClear();

    // Set up game object
    mockGame = createMockGame();
    global.game = mockGame;

    // Set up ui.notifications
    mockUi = createMockNotifications();
    global.ui = { notifications: mockUi };

    // Set up foundry.utils
    global.foundry = { utils: createMockFoundryUtils() };

    // Create instance
    preview = new EntityPreview();
  });

  afterEach(() => {
    if (preview && preview.rendered) {
      preview.close();
    }
  });

  describe('Initialization', () => {
    it('should create instance with default state', () => {
      expect(preview).toBeDefined();
      expect(preview._entities).toEqual({
        characters: [],
        locations: [],
        items: []
      });
      expect(preview._relationships).toEqual([]);
      expect(preview._mode).toBe(PreviewMode.REVIEW);
    });

    it('should accept entities in constructor options', () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'A brave hero' }],
        locations: [{ name: 'Castle', description: 'A grand castle' }],
        items: [{ name: 'Sword', description: 'A legendary sword' }]
      };

      const previewWithEntities = new EntityPreview({ entities });

      expect(previewWithEntities._entities.characters).toHaveLength(1);
      expect(previewWithEntities._entities.locations).toHaveLength(1);
      expect(previewWithEntities._entities.items).toHaveLength(1);
    });

    it('should accept relationships in constructor options', () => {
      const relationships = [
        { sourceEntity: 'Hero', targetEntity: 'Castle', relationType: 'resides' }
      ];

      const previewWithRelations = new EntityPreview({ relationships });

      expect(previewWithRelations._relationships).toHaveLength(1);
      expect(previewWithRelations._relationships[0].sourceEntity).toBe('Hero');
    });

    it('should register callbacks from constructor options', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const previewWithCallbacks = new EntityPreview({
        onConfirm,
        onCancel
      });

      expect(previewWithCallbacks._onConfirmCallback).toBe(onConfirm);
      expect(previewWithCallbacks._onCancelCallback).toBe(onCancel);
    });

    it('should have DEFAULT_OPTIONS with actions map', () => {
      expect(EntityPreview.DEFAULT_OPTIONS).toBeDefined();
      expect(EntityPreview.DEFAULT_OPTIONS.id).toBe('vox-chronicle-entity-preview');
      expect(EntityPreview.DEFAULT_OPTIONS.actions).toBeDefined();
      expect(EntityPreview.DEFAULT_OPTIONS.actions['select-all']).toBeDefined();
      expect(EntityPreview.DEFAULT_OPTIONS.actions['confirm-create']).toBeDefined();
      expect(EntityPreview.DEFAULT_OPTIONS.actions['edit-description']).toBeDefined();
    });

    it('should have PARTS with template path', () => {
      expect(EntityPreview.PARTS).toBeDefined();
      expect(EntityPreview.PARTS.main.template).toContain('entity-preview.hbs');
    });
  });

  describe('Entity Management', () => {
    it('should set entities and initialize selections', () => {
      const entities = {
        characters: [
          { name: 'Hero', description: 'Brave' },
          { name: 'Villain', description: 'Evil' }
        ],
        locations: [{ name: 'Castle', description: 'Grand' }],
        items: []
      };

      preview.setEntities(entities);

      expect(preview._entities.characters).toHaveLength(2);
      expect(preview._entities.locations).toHaveLength(1);
      expect(preview._entities.items).toHaveLength(0);

      // All entities should be selected by default
      expect(preview._selections.get('characters-0')).toBe(true);
      expect(preview._selections.get('characters-1')).toBe(true);
      expect(preview._selections.get('locations-0')).toBe(true);
    });

    it('should handle invalid entity data gracefully', () => {
      preview.setEntities({ characters: null, locations: 'invalid', items: undefined });

      expect(preview._entities.characters).toEqual([]);
      expect(preview._entities.locations).toEqual([]);
      expect(preview._entities.items).toEqual([]);
    });

    it('should set relationships and initialize selections', () => {
      const relationships = [
        { sourceEntity: 'Hero', targetEntity: 'Castle', relationType: 'resides' },
        { sourceEntity: 'Hero', targetEntity: 'Villain', relationType: 'enemy' }
      ];

      preview.setRelationships(relationships);

      expect(preview._relationships).toHaveLength(2);
      expect(preview._selections.get('relationship-0')).toBe(true);
      expect(preview._selections.get('relationship-1')).toBe(true);
    });

    it('should get selected entities correctly', () => {
      const entities = {
        characters: [
          { name: 'Hero', description: 'Brave' },
          { name: 'Villain', description: 'Evil' }
        ],
        locations: [{ name: 'Castle', description: 'Grand' }],
        items: [{ name: 'Sword', description: 'Sharp' }]
      };

      preview.setEntities(entities);

      // Deselect one character
      preview._selections.set('characters-1', false);

      const selected = preview.getSelectedEntities();

      expect(selected.characters).toHaveLength(1);
      expect(selected.characters[0].name).toBe('Hero');
      expect(selected.locations).toHaveLength(1);
      expect(selected.items).toHaveLength(1);
    });

    it('should get selected relationships correctly', () => {
      const relationships = [
        { sourceEntity: 'Hero', targetEntity: 'Castle', relationType: 'resides' },
        { sourceEntity: 'Hero', targetEntity: 'Villain', relationType: 'enemy' }
      ];

      preview.setRelationships(relationships);

      // Deselect one relationship
      preview._selections.set('relationship-1', false);

      const selected = preview.getSelectedRelationships();

      expect(selected).toHaveLength(1);
      expect(selected[0].relationType).toBe('resides');
    });

    it('should get all entities including unselected', () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);
      preview._selections.set('characters-0', false);

      const allEntities = preview.getAllEntities();

      expect(allEntities.characters).toHaveLength(1);
    });

    it('should reset preview state', () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);
      preview._mode = PreviewMode.CREATING;
      preview._progress = { current: 1, total: 5, message: 'Creating...' };

      preview.reset();

      expect(preview._entities.characters).toHaveLength(0);
      expect(preview._selections.size).toBe(0);
      expect(preview._mode).toBe(PreviewMode.REVIEW);
      expect(preview._progress.current).toBe(0);
    });
  });

  describe('Selection State', () => {
    beforeEach(() => {
      const entities = {
        characters: [
          { name: 'Hero', description: 'Brave' },
          { name: 'Villain', description: 'Evil' }
        ],
        locations: [{ name: 'Castle', description: 'Grand' }],
        items: []
      };
      preview.setEntities(entities);
    });

    it('should calculate total entity count', () => {
      const count = preview._getTotalEntityCount();
      expect(count).toBe(3);
    });

    it('should calculate selected count', () => {
      preview._selections.set('characters-1', false);
      const count = preview._getSelectedCount();
      expect(count).toBe(2);
    });

    it('should detect ALL selection state', () => {
      const state = preview._getSelectionState();
      expect(state).toBe(EntitySelectionState.ALL);
    });

    it('should detect NONE selection state', () => {
      preview._selections.set('characters-0', false);
      preview._selections.set('characters-1', false);
      preview._selections.set('locations-0', false);

      const state = preview._getSelectionState();
      expect(state).toBe(EntitySelectionState.NONE);
    });

    it('should detect SOME selection state', () => {
      preview._selections.set('characters-1', false);

      const state = preview._getSelectionState();
      expect(state).toBe(EntitySelectionState.SOME);
    });
  });

  describe('Template Data', () => {
    it('should provide correct template data in REVIEW mode', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave', isNPC: false }],
        locations: [{ name: 'Castle', description: 'Grand', type: 'fortress' }],
        items: [{ name: 'Sword', description: 'Sharp', type: 'weapon' }]
      };

      preview.setEntities(entities);

      const data = await preview._prepareContext();

      expect(data.mode).toBe(PreviewMode.REVIEW);
      expect(data.isReview).toBe(true);
      expect(data.hasCharacters).toBe(true);
      expect(data.hasLocations).toBe(true);
      expect(data.hasItems).toBe(true);
      expect(data.totalCount).toBe(3);
      expect(data.selectedCount).toBe(3);
      expect(data.isAllSelected).toBe(true);
      expect(data.isKankaConfigured).toBe(true);
    });

    it('should include character type labels in template data', async () => {
      const entities = {
        characters: [
          { name: 'Hero', description: 'Brave', isNPC: false },
          { name: 'Villain', description: 'Evil', isNPC: true }
        ],
        locations: [],
        items: []
      };

      preview.setEntities(entities);

      const data = await preview._prepareContext();

      expect(data.characters[0].typeLabel).toContain('PC');
      expect(data.characters[1].typeLabel).toContain('NPC');
    });

    it('should include relationships in template data', async () => {
      const relationships = [
        { sourceEntity: 'Hero', targetEntity: 'Castle', relationType: 'resides', confidence: 8 }
      ];

      preview.setRelationships(relationships);

      const data = await preview._prepareContext();

      expect(data.hasRelationships).toBe(true);
      expect(data.relationships).toHaveLength(1);
      expect(data.relationships[0].selected).toBe(true);
    });

    it('should show progress data in CREATING mode', async () => {
      preview._mode = PreviewMode.CREATING;
      preview._progress = { current: 2, total: 5, message: 'Creating entities...' };

      const data = await preview._prepareContext();

      expect(data.isCreating).toBe(true);
      expect(data.hasProgress).toBe(true);
      expect(data.progress.current).toBe(2);
      expect(data.progress.total).toBe(5);
    });

    it('should show results data in COMPLETE mode', async () => {
      preview._mode = PreviewMode.COMPLETE;
      preview._results = {
        created: [
          { type: 'character', name: 'Hero', kankaId: 1 },
          { type: 'location', name: 'Castle', kankaId: 2 }
        ],
        failed: []
      };

      const data = await preview._prepareContext();

      expect(data.isComplete).toBe(true);
      expect(data.hasResults).toBe(true);
      expect(data.createdCount).toBe(2);
      expect(data.failedCount).toBe(0);
    });

    it('should show error data when creation fails', async () => {
      preview._mode = PreviewMode.ERROR;
      preview._results = {
        created: [],
        failed: [{ type: 'character', name: 'Hero', error: 'Network error' }]
      };

      const data = await preview._prepareContext();

      expect(data.isError).toBe(true);
      expect(data.hasResults).toBe(true);
      expect(data.failedCount).toBe(1);
    });
  });

  describe('Entity Creation', () => {
    it('should create entities in Kanka successfully', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave', isNPC: false }],
        locations: [{ name: 'Castle', description: 'Grand', type: 'fortress' }],
        items: [{ name: 'Sword', description: 'Sharp', type: 'weapon' }]
      };

      preview.setEntities(entities);

      await preview._createEntitiesInKanka(preview.getSelectedEntities());

      expect(mockKankaService.createCharacter).toHaveBeenCalledWith({
        name: 'Hero',
        entry: 'Brave',
        type: 'PC'
      });

      expect(mockKankaService.createLocation).toHaveBeenCalledWith({
        name: 'Castle',
        entry: 'Grand',
        type: 'fortress'
      });

      expect(mockKankaService.createItem).toHaveBeenCalledWith({
        name: 'Sword',
        entry: 'Sharp',
        type: 'weapon'
      });

      expect(preview._results.created).toHaveLength(3);
      expect(preview._results.failed).toHaveLength(0);
    });

    it('should handle entity creation failures gracefully', async () => {
      mockKankaService.createCharacter.mockRejectedValueOnce(new Error('API error'));

      const entities = {
        characters: [{ name: 'Hero', description: 'Brave', isNPC: false }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);

      await preview._createEntitiesInKanka(preview.getSelectedEntities());

      expect(preview._results.created).toHaveLength(0);
      expect(preview._results.failed).toHaveLength(1);
      expect(preview._results.failed[0].error).toBe('API error');
    });

    it('should create relationships after entities', async () => {
      const entities = {
        characters: [
          { name: 'Hero', description: 'Brave', isNPC: false },
          { name: 'Villain', description: 'Evil', isNPC: true }
        ],
        locations: [],
        items: []
      };

      const relationships = [
        { sourceEntity: 'Hero', targetEntity: 'Villain', relationType: 'enemy', confidence: 9 }
      ];

      preview.setEntities(entities);
      preview.setRelationships(relationships);

      await preview._createEntitiesInKanka(preview.getSelectedEntities());

      expect(mockKankaService.batchCreateRelations).toHaveBeenCalled();
    });

    it('should skip relationships with missing entities', async () => {
      const entityNameToId = new Map([
        ['hero', 101]
        // 'villain' is missing
      ]);

      const relationships = [
        { sourceEntity: 'Hero', targetEntity: 'Villain', relationType: 'enemy' }
      ];

      preview.setRelationships(relationships);

      await preview._createRelationshipsInKanka(entityNameToId, mockKankaService);

      // Should not call batchCreateRelations since entity is missing
      expect(mockKankaService.batchCreateRelations).not.toHaveBeenCalled();
    });

    it('should map confidence to attitude correctly', () => {
      expect(preview._mapConfidenceToAttitude(1)).toBe(-3);
      expect(preview._mapConfidenceToAttitude(3)).toBe(-1);
      expect(preview._mapConfidenceToAttitude(5)).toBe(0);
      expect(preview._mapConfidenceToAttitude(8)).toBe(1);
      expect(preview._mapConfidenceToAttitude(10)).toBe(3);
    });

    it('should handle invalid confidence values', () => {
      expect(preview._mapConfidenceToAttitude(0)).toBe(0);
      expect(preview._mapConfidenceToAttitude(11)).toBe(0);
      expect(preview._mapConfidenceToAttitude(null)).toBe(0);
      expect(preview._mapConfidenceToAttitude(undefined)).toBe(0);
    });
  });

  describe('Event Handlers', () => {
    it('should toggle entity selection', () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);
      preview.render = vi.fn();

      const mockEvent = {
        currentTarget: {
          checked: false,
          dataset: { entityKey: 'characters-0' }
        }
      };

      preview._onToggleEntity(mockEvent);

      expect(preview._selections.get('characters-0')).toBe(false);
      expect(preview.render).toHaveBeenCalled();
    });

    it('should select all entities', () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [{ name: 'Castle', description: 'Grand' }],
        items: []
      };

      preview.setEntities(entities);
      preview._selections.set('characters-0', false);
      preview.render = vi.fn();

      const mockEvent = { preventDefault: vi.fn() };

      preview._onSelectAll(mockEvent);

      expect(preview._selections.get('characters-0')).toBe(true);
      expect(preview._selections.get('locations-0')).toBe(true);
      expect(preview.render).toHaveBeenCalled();
    });

    it('should deselect all entities', () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [{ name: 'Castle', description: 'Grand' }],
        items: []
      };

      preview.setEntities(entities);
      preview.render = vi.fn();

      const mockEvent = { preventDefault: vi.fn() };

      preview._onDeselectAll(mockEvent);

      expect(preview._selections.get('characters-0')).toBe(false);
      expect(preview._selections.get('locations-0')).toBe(false);
      expect(preview.render).toHaveBeenCalled();
    });

    it('should warn when confirming with no selection', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);
      preview._selections.set('characters-0', false);

      const mockEvent = { preventDefault: vi.fn() };

      await preview._onConfirmCreate(mockEvent);

      expect(mockUi.warn).toHaveBeenCalled();
    });

    it('should warn when Kanka is not configured', async () => {
      mockSettings.getConfigurationStatus.mockReturnValueOnce({
        ready: true,
        openai: true,
        kanka: false
      });

      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);

      const mockEvent = { preventDefault: vi.fn() };

      await preview._onConfirmCreate(mockEvent);

      expect(mockUi.warn).toHaveBeenCalled();
    });

    it('should call cancel callback on skip', () => {
      const onCancel = vi.fn();
      preview._onCancelCallback = onCancel;
      preview.close = vi.fn();

      const mockEvent = { preventDefault: vi.fn() };

      preview._onSkipAll(mockEvent);

      expect(onCancel).toHaveBeenCalledWith({ skipped: true });
      expect(preview.close).toHaveBeenCalled();
    });

    it('should call cancel callback on cancel', () => {
      const onCancel = vi.fn();
      preview._onCancelCallback = onCancel;
      preview.close = vi.fn();

      const mockEvent = { preventDefault: vi.fn() };

      preview._onCancel(mockEvent);

      expect(onCancel).toHaveBeenCalledWith({ cancelled: true });
      expect(preview.close).toHaveBeenCalled();
    });

    it('should reset to review mode on retry', () => {
      preview._mode = PreviewMode.ERROR;
      preview._results = {
        created: [],
        failed: [{ type: 'character', name: 'Hero', error: 'Error' }]
      };
      preview.render = vi.fn();

      const mockEvent = { preventDefault: vi.fn() };

      preview._onRetry(mockEvent);

      expect(preview._mode).toBe(PreviewMode.REVIEW);
      expect(preview._results.failed).toHaveLength(0);
      expect(preview.render).toHaveBeenCalled();
    });

    it('should toggle section collapse', () => {
      const mockSection = {
        classList: {
          toggle: vi.fn()
        }
      };

      const mockTarget = {
        closest: vi.fn(() => mockSection)
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        currentTarget: mockTarget
      };

      preview._onToggleSection(mockEvent, mockTarget);

      expect(mockSection.classList.toggle).toHaveBeenCalledWith('collapsed');
    });

    it('should open relationship graph', () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      const relationships = [
        { sourceEntity: 'Hero', targetEntity: 'Castle', relationType: 'resides' }
      ];

      preview.setEntities(entities);
      preview.setRelationships(relationships);

      const mockEvent = { preventDefault: vi.fn() };

      preview._onViewGraph(mockEvent);

      expect(MockRelationshipGraph).toHaveBeenCalledWith({
        entities: preview._entities,
        relationships: preview._relationships
      });

      expect(MockRelationshipGraph.mock.results[0].value.render).toHaveBeenCalled();
    });

    it('should dispatch static action handlers to instance methods', () => {
      preview._onSelectAll = vi.fn();
      preview._onDeselectAll = vi.fn();
      preview._onClose = vi.fn();

      EntityPreview._onSelectAllAction.call(preview, { preventDefault: vi.fn() }, null);
      expect(preview._onSelectAll).toHaveBeenCalled();

      EntityPreview._onDeselectAllAction.call(preview, { preventDefault: vi.fn() }, null);
      expect(preview._onDeselectAll).toHaveBeenCalled();

      EntityPreview._onCloseAction.call(preview, { preventDefault: vi.fn() }, null);
      expect(preview._onClose).toHaveBeenCalled();
    });
  });

  describe('Image Generation', () => {
    it('should generate portrait for entity', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave warrior' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);
      preview.render = vi.fn();

      const mockTarget = {
        dataset: {
          entityType: 'characters',
          entityIndex: '0'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        currentTarget: mockTarget
      };

      await preview._onGeneratePortrait(mockEvent, mockTarget);

      expect(mockImageGenerationService.generatePortrait).toHaveBeenCalledWith(
        'character',
        'Brave warrior'
      );

      expect(preview._entities.characters[0].imageUrl).toBe('https://example.com/image.png');
      expect(mockUi.info).toHaveBeenCalledWith('Image generated');
    });

    it('should warn when OpenAI is not configured', async () => {
      mockSettings.getConfigurationStatus.mockReturnValueOnce({
        ready: true,
        openai: false,
        kanka: true
      });

      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);

      const mockTarget = {
        dataset: {
          entityType: 'characters',
          entityIndex: '0'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        currentTarget: mockTarget
      };

      await preview._onGeneratePortrait(mockEvent, mockTarget);

      expect(mockUi.warn).toHaveBeenCalled();
      expect(mockImageGenerationService.generatePortrait).not.toHaveBeenCalled();
    });

    it('should handle image generation failure', async () => {
      mockImageGenerationService.generatePortrait.mockRejectedValueOnce(new Error('API error'));

      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);
      preview.render = vi.fn();

      const mockTarget = {
        dataset: {
          entityType: 'characters',
          entityIndex: '0'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        currentTarget: mockTarget
      };

      await preview._onGeneratePortrait(mockEvent, mockTarget);

      expect(mockUi.error).toHaveBeenCalled();
      expect(preview._entities.characters[0].imageUrl).toBeUndefined();
    });

    it('should set loading state during image generation', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);
      preview.render = vi.fn();

      // Make generatePortrait take some time
      mockImageGenerationService.generatePortrait.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('url'), 10))
      );

      const mockTarget = {
        dataset: {
          entityType: 'characters',
          entityIndex: '0'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        currentTarget: mockTarget
      };

      const promise = preview._onGeneratePortrait(mockEvent, mockTarget);

      // Should have set loading state
      expect(preview._imageLoadingStates.get('characters-0')).toBe(true);

      await promise;

      // Should have cleared loading state
      expect(preview._imageLoadingStates.get('characters-0')).toBe(false);
    });

    it('should map entity type to image type correctly', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [{ name: 'Castle', description: 'Grand' }],
        items: [{ name: 'Sword', description: 'Sharp' }]
      };

      preview.setEntities(entities);
      preview.render = vi.fn();

      // Test character
      await preview._onGeneratePortrait(
        { preventDefault: vi.fn(), currentTarget: { dataset: { entityType: 'characters', entityIndex: '0' } } },
        { dataset: { entityType: 'characters', entityIndex: '0' } }
      );
      expect(mockImageGenerationService.generatePortrait).toHaveBeenCalledWith(
        'character',
        'Brave'
      );

      // Test location
      await preview._onGeneratePortrait(
        { preventDefault: vi.fn(), currentTarget: { dataset: { entityType: 'locations', entityIndex: '0' } } },
        { dataset: { entityType: 'locations', entityIndex: '0' } }
      );
      expect(mockImageGenerationService.generatePortrait).toHaveBeenCalledWith('location', 'Grand');

      // Test item
      await preview._onGeneratePortrait(
        { preventDefault: vi.fn(), currentTarget: { dataset: { entityType: 'items', entityIndex: '0' } } },
        { dataset: { entityType: 'items', entityIndex: '0' } }
      );
      expect(mockImageGenerationService.generatePortrait).toHaveBeenCalledWith('item', 'Sharp');
    });
  });

  describe('Edit Description', () => {
    it('should show edit dialog for entity', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Original description' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);
      preview.render = vi.fn();

      const mockTarget = {
        dataset: {
          entityType: 'characters',
          entityIndex: '0'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        currentTarget: mockTarget
      };

      await preview._onEditDescription(mockEvent, mockTarget);

      // Wait for dialog callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(preview._entities.characters[0].description).toBe('Updated description');
      expect(preview.render).toHaveBeenCalled();
    });

    it('should not update if description unchanged', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Original description' }],
        locations: [],
        items: []
      };

      preview.setEntities(entities);

      const originalDescription = entities.characters[0].description;

      // Mock dialog to return null (cancelled)
      global.Dialog = class MockDialog {
        constructor(config) {
          this.config = config;
        }
        render() {
          setTimeout(() => {
            this.config.buttons.cancel.callback();
          }, 0);
          return this;
        }
      };

      const mockTarget = {
        dataset: {
          entityType: 'characters',
          entityIndex: '0'
        }
      };

      const mockEvent = {
        preventDefault: vi.fn(),
        currentTarget: mockTarget
      };

      await preview._onEditDescription(mockEvent, mockTarget);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(preview._entities.characters[0].description).toBe(originalDescription);
    });
  });

  describe('Static Factory Method', () => {
    it('should create and show preview with static method', async () => {
      const entities = {
        characters: [{ name: 'Hero', description: 'Brave' }],
        locations: [],
        items: []
      };

      // Mock the confirm action
      setTimeout(() => {
        if (mockVoxChronicleInstance.kankaService) {
          // Simulate successful creation
        }
      }, 10);

      const promise = EntityPreview.show(entities);

      // Should be a promise
      expect(promise).toBeInstanceOf(Promise);
    });
  });

  describe('Batched Rendering', () => {
    let preview;
    let renderSpy;

    beforeEach(() => {
      preview = new EntityPreview();
      // Spy on the render method to track calls
      renderSpy = vi.spyOn(preview, 'render');
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('should immediately render when time threshold exceeded', () => {
      vi.useFakeTimers();

      // Set last render time to 600ms ago (exceeds 500ms threshold)
      preview._lastRenderTime = Date.now() - 600;

      preview._batchedRender();

      // Should render immediately
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).toHaveBeenCalled();
      expect(preview._renderBatchCounter).toBe(0);
      expect(preview._pendingRender).toBe(false);
    });

    it('should immediately render when count threshold exceeded', () => {
      vi.useFakeTimers();

      // Set batch counter to 2 (next call will reach threshold of 3)
      preview._renderBatchCounter = 2;
      preview._lastRenderTime = Date.now();

      preview._batchedRender();

      // Should render immediately
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).toHaveBeenCalled();
      expect(preview._renderBatchCounter).toBe(0);
      expect(preview._pendingRender).toBe(false);
    });

    it('should defer render when both thresholds not met', () => {
      vi.useFakeTimers();

      // Set last render time to just now (0ms ago)
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;

      preview._batchedRender();

      // Should NOT render immediately
      expect(renderSpy).not.toHaveBeenCalled();
      expect(preview._pendingRender).toBe(true);
      expect(preview._renderTimeout).not.toBeNull();

      // Advance time to trigger deferred render
      vi.advanceTimersByTime(500);

      // Now should have rendered
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).toHaveBeenCalled();
      expect(preview._pendingRender).toBe(false);
      expect(preview._renderBatchCounter).toBe(0);
    });

    it('should coalesce multiple deferred renders into single render', () => {
      vi.useFakeTimers();

      // Set last render time to just now
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;

      // Call batchedRender multiple times
      preview._batchedRender(); // First call schedules deferred render
      expect(renderSpy).not.toHaveBeenCalled();

      preview._batchedRender(); // Second call - should not schedule another
      expect(renderSpy).not.toHaveBeenCalled();

      preview._batchedRender(); // Third call - count threshold reached
      expect(renderSpy).toHaveBeenCalledTimes(1); // Renders immediately on threshold

      renderSpy.mockClear();

      // Reset and test time-based coalescing
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;

      preview._batchedRender(); // Schedules deferred render
      preview._batchedRender(); // Should not schedule another (already pending)

      expect(renderSpy).not.toHaveBeenCalled();
      expect(preview._pendingRender).toBe(true);

      // Advance time
      vi.advanceTimersByTime(500);

      // Should have rendered only once despite multiple calls
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(preview._pendingRender).toBe(false);
    });

    it('should force immediate render with _flushRender even when thresholds not met', () => {
      vi.useFakeTimers();

      // Set conditions where normal render would be deferred
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;

      // Schedule a deferred render
      preview._batchedRender();
      expect(renderSpy).not.toHaveBeenCalled();
      expect(preview._pendingRender).toBe(true);

      renderSpy.mockClear();

      // Flush should render immediately and clear pending
      preview._flushRender();

      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(renderSpy).toHaveBeenCalled();
      expect(preview._pendingRender).toBe(false);
      expect(preview._renderTimeout).toBeNull();
      expect(preview._renderBatchCounter).toBe(0);

      // Advance time - deferred render should NOT fire (was cleared)
      vi.advanceTimersByTime(500);
      expect(renderSpy).toHaveBeenCalledTimes(1); // Still only 1 call
    });

    it('should reset batch counter after immediate render', () => {
      vi.useFakeTimers();

      // Build up batch counter
      preview._renderBatchCounter = 2;
      preview._lastRenderTime = Date.now();

      // This should trigger immediate render (reaches count threshold)
      preview._batchedRender();

      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(preview._renderBatchCounter).toBe(0);

      renderSpy.mockClear();

      // Now counter is reset, so this should defer
      preview._batchedRender();
      expect(renderSpy).not.toHaveBeenCalled();
      expect(preview._renderBatchCounter).toBe(1);
    });

    it('should update lastRenderTime after render', () => {
      vi.useFakeTimers();

      const startTime = Date.now();
      preview._lastRenderTime = 0;

      preview._batchedRender();

      // Should have updated last render time
      expect(preview._lastRenderTime).toBeGreaterThanOrEqual(startTime);
    });

    it('should clear pending timeout when rendering immediately after deferred', () => {
      vi.useFakeTimers();

      // Schedule a deferred render
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;
      preview._batchedRender();

      expect(preview._pendingRender).toBe(true);
      const timeoutId = preview._renderTimeout;
      expect(timeoutId).not.toBeNull();

      renderSpy.mockClear();

      // Now trigger immediate render (count threshold)
      preview._renderBatchCounter = 2;
      preview._batchedRender();

      // Should have cleared the pending timeout
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(preview._pendingRender).toBe(false);
      expect(preview._renderTimeout).toBeNull();

      // Advance time - deferred render should not fire
      vi.advanceTimersByTime(500);
      expect(renderSpy).toHaveBeenCalledTimes(1); // Still only 1
    });

    it('should batch multiple entity updates into fewer renders - integration test', () => {
      vi.useFakeTimers();

      const entities = {
        characters: [
          { name: 'Hero', description: 'Brave warrior', isNPC: false },
          { name: 'Villain', description: 'Evil sorcerer', isNPC: true },
          { name: 'Merchant', description: 'Traveling trader', isNPC: true }
        ],
        locations: [
          { name: 'Castle', description: 'Grand fortress', type: 'fortress' },
          { name: 'Forest', description: 'Dark woods', type: 'wilderness' }
        ],
        items: [
          { name: 'Sword', description: 'Legendary blade', type: 'weapon' },
          { name: 'Potion', description: 'Healing elixir', type: 'consumable' }
        ]
      };

      preview.setEntities(entities);

      // Reset render spy after setEntities (which triggers render)
      renderSpy.mockClear();

      // Simulate multiple rapid entity selection changes
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;

      // Toggle multiple entities (each would normally trigger a render)
      preview._selections.set('characters-0', false);
      preview._batchedRender();
      expect(renderSpy).not.toHaveBeenCalled(); // Deferred

      preview._selections.set('locations-0', false);
      preview._batchedRender();
      expect(renderSpy).not.toHaveBeenCalled(); // Still deferred (counter = 2)

      preview._selections.set('items-0', false);
      preview._batchedRender();
      expect(renderSpy).toHaveBeenCalledTimes(1); // Threshold reached - immediate render

      renderSpy.mockClear();

      // Test time-based batching with more updates
      preview._lastRenderTime = Date.now();
      preview._renderBatchCounter = 0;

      // More entity updates
      preview._selections.set('characters-1', false);
      preview._batchedRender();
      expect(renderSpy).not.toHaveBeenCalled(); // Deferred

      preview._selections.set('locations-1', false);
      preview._batchedRender();
      expect(renderSpy).not.toHaveBeenCalled(); // Still deferred

      // Advance time to trigger deferred render
      vi.advanceTimersByTime(500);

      // Should have rendered once for all pending updates
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(preview._pendingRender).toBe(false);

      // Verify final selection state
      expect(preview._selections.get('characters-0')).toBe(false);
      expect(preview._selections.get('characters-1')).toBe(false);
      expect(preview._selections.get('locations-0')).toBe(false);
      expect(preview._selections.get('locations-1')).toBe(false);
      expect(preview._selections.get('items-0')).toBe(false);

      // Total: 5 entity updates resulted in only 2 renders (batched)
      // Without batching, this would have been 5 renders
    });
  });

  describe('Enums', () => {
    it('should export EntitySelectionState enum', () => {
      expect(EntitySelectionState.NONE).toBe('none');
      expect(EntitySelectionState.SOME).toBe('some');
      expect(EntitySelectionState.ALL).toBe('all');
    });

    it('should export PreviewMode enum', () => {
      expect(PreviewMode.REVIEW).toBe('review');
      expect(PreviewMode.CREATING).toBe('creating');
      expect(PreviewMode.COMPLETE).toBe('complete');
      expect(PreviewMode.ERROR).toBe('error');
    });
  });
});
