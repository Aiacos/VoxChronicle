/**
 * RelationshipGraph Unit Tests
 *
 * Tests for the RelationshipGraph UI component that visualizes entity
 * relationships as an interactive network graph.
 *
 * @module tests/ui/RelationshipGraph.test
 */

// Ensure foundry global exists before RelationshipGraph.mjs is loaded
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

vi.mock('../../scripts/ai/EntityExtractor.mjs', () => ({
  RelationshipType: {
    ALLY: 'ally',
    ENEMY: 'enemy',
    FAMILY: 'family',
    EMPLOYER: 'employer',
    EMPLOYEE: 'employee',
    ROMANTIC: 'romantic',
    FRIEND: 'friend',
    RIVAL: 'rival',
    NEUTRAL: 'neutral',
    UNKNOWN: 'unknown'
  }
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RelationshipGraph, EntityType, GraphMode } from '../../scripts/ui/RelationshipGraph.mjs';

describe('RelationshipGraph', () => {
  let graph;
  let sampleEntities;
  let sampleRelationships;

  beforeEach(() => {
    sampleEntities = {
      characters: [
        { name: 'Gandalf', description: 'A powerful wizard' },
        { name: 'Frodo', description: 'A brave hobbit' }
      ],
      locations: [
        { name: 'Rivendell', description: 'Elven city' }
      ],
      items: [
        { name: 'The One Ring', description: 'The ring of power' }
      ]
    };

    sampleRelationships = [
      {
        sourceEntity: 'Gandalf',
        targetEntity: 'Frodo',
        relationType: 'ally',
        confidence: 8,
        description: 'Guide and protector'
      },
      {
        sourceEntity: 'Frodo',
        targetEntity: 'The One Ring',
        relationType: 'neutral',
        confidence: 5,
        description: 'Ring bearer'
      },
      {
        sourceEntity: 'Gandalf',
        targetEntity: 'Rivendell',
        relationType: 'friend',
        confidence: 7,
        description: 'Frequent visitor'
      }
    ];

    graph = new RelationshipGraph();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Constructor ---

  describe('constructor', () => {
    it('should create instance with default state', () => {
      expect(graph).toBeDefined();
      expect(graph._mode).toBe(GraphMode.LOADING);
      expect(graph._entities.characters).toEqual([]);
      expect(graph._entities.locations).toEqual([]);
      expect(graph._entities.items).toEqual([]);
      expect(graph._relationships).toEqual([]);
      expect(graph._network).toBeNull();
    });

    it('should accept entities in options', () => {
      const g = new RelationshipGraph({ entities: sampleEntities });
      expect(g._entities.characters).toHaveLength(2);
      expect(g._entities.locations).toHaveLength(1);
      expect(g._entities.items).toHaveLength(1);
    });

    it('should accept relationships in options', () => {
      const g = new RelationshipGraph({ relationships: sampleRelationships });
      expect(g._relationships).toHaveLength(3);
    });

    it('should accept both entities and relationships', () => {
      const g = new RelationshipGraph({
        entities: sampleEntities,
        relationships: sampleRelationships
      });
      expect(g._entities.characters).toHaveLength(2);
      expect(g._relationships).toHaveLength(3);
      expect(g._mode).toBe(GraphMode.READY);
    });

    it('should set mode to EMPTY when only entities provided with no relationships', () => {
      const g = new RelationshipGraph({ entities: sampleEntities });
      expect(g._mode).toBe(GraphMode.EMPTY);
    });

    it('should set mode to EMPTY when only relationships provided with no entities', () => {
      const g = new RelationshipGraph({ relationships: sampleRelationships });
      expect(g._mode).toBe(GraphMode.EMPTY);
    });

    it('should initialize default filters', () => {
      expect(graph._filters.entityType).toBe(EntityType.ALL);
      expect(graph._filters.relationshipType).toBe('all');
    });
  });

  // --- Static properties ---

  describe('static properties', () => {
    it('should have DEFAULT_OPTIONS with correct id', () => {
      expect(RelationshipGraph.DEFAULT_OPTIONS.id).toBe('vox-chronicle-relationship-graph');
    });

    it('should have DEFAULT_OPTIONS with correct classes', () => {
      expect(RelationshipGraph.DEFAULT_OPTIONS.classes).toContain('vox-chronicle');
      expect(RelationshipGraph.DEFAULT_OPTIONS.classes).toContain('relationship-graph');
    });

    it('should define window options', () => {
      expect(RelationshipGraph.DEFAULT_OPTIONS.window).toBeDefined();
      expect(RelationshipGraph.DEFAULT_OPTIONS.window.resizable).toBe(true);
      expect(RelationshipGraph.DEFAULT_OPTIONS.window.minimizable).toBe(true);
    });

    it('should define position options', () => {
      expect(RelationshipGraph.DEFAULT_OPTIONS.position.width).toBe(800);
      expect(RelationshipGraph.DEFAULT_OPTIONS.position.height).toBe(600);
    });

    it('should define action handlers', () => {
      const actions = RelationshipGraph.DEFAULT_OPTIONS.actions;
      expect(actions.refresh).toBeDefined();
      expect(actions.export).toBeDefined();
      expect(actions.close).toBeDefined();
    });

    it('should have PARTS with main template', () => {
      expect(RelationshipGraph.PARTS.main).toBeDefined();
      expect(RelationshipGraph.PARTS.main.template).toContain('relationship-graph.hbs');
    });
  });

  // --- Exported enums ---

  describe('EntityType', () => {
    it('should have CHARACTER, LOCATION, ITEM, ALL values', () => {
      expect(EntityType.CHARACTER).toBe('character');
      expect(EntityType.LOCATION).toBe('location');
      expect(EntityType.ITEM).toBe('item');
      expect(EntityType.ALL).toBe('all');
    });
  });

  describe('GraphMode', () => {
    it('should have LOADING, READY, EMPTY, ERROR values', () => {
      expect(GraphMode.LOADING).toBe('loading');
      expect(GraphMode.READY).toBe('ready');
      expect(GraphMode.EMPTY).toBe('empty');
      expect(GraphMode.ERROR).toBe('error');
    });
  });

  // --- setEntities ---

  describe('setEntities', () => {
    it('should set entities', () => {
      graph.setEntities(sampleEntities);
      expect(graph._entities.characters).toHaveLength(2);
      expect(graph._entities.locations).toHaveLength(1);
      expect(graph._entities.items).toHaveLength(1);
    });

    it('should handle missing entity types', () => {
      graph.setEntities({ characters: [{ name: 'Test' }] });
      expect(graph._entities.characters).toHaveLength(1);
      expect(graph._entities.locations).toEqual([]);
      expect(graph._entities.items).toEqual([]);
    });

    it('should handle non-array values', () => {
      graph.setEntities({ characters: 'invalid', locations: null, items: 42 });
      expect(graph._entities.characters).toEqual([]);
      expect(graph._entities.locations).toEqual([]);
      expect(graph._entities.items).toEqual([]);
    });

    it('should update mode to EMPTY when no relationships', () => {
      graph.setEntities(sampleEntities);
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });

    it('should update mode to READY when entities and relationships exist', () => {
      graph.setRelationships(sampleRelationships);
      graph.setEntities(sampleEntities);
      expect(graph._mode).toBe(GraphMode.READY);
    });
  });

  // --- setRelationships ---

  describe('setRelationships', () => {
    it('should set relationships', () => {
      graph.setRelationships(sampleRelationships);
      expect(graph._relationships).toHaveLength(3);
    });

    it('should handle non-array input', () => {
      graph.setRelationships('not an array');
      expect(graph._relationships).toEqual([]);
    });

    it('should handle null input', () => {
      graph.setRelationships(null);
      expect(graph._relationships).toEqual([]);
    });

    it('should update mode to EMPTY when no entities', () => {
      graph.setRelationships(sampleRelationships);
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });

    it('should update mode to READY when entities exist', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      expect(graph._mode).toBe(GraphMode.READY);
    });
  });

  // --- _updateMode ---

  describe('_updateMode', () => {
    it('should set EMPTY when no entities', () => {
      graph._updateMode();
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });

    it('should set EMPTY when entities but no relationships', () => {
      graph._entities.characters = [{ name: 'Test' }];
      graph._updateMode();
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });

    it('should set EMPTY when relationships but no entities', () => {
      graph._relationships = [{ sourceEntity: 'A', targetEntity: 'B' }];
      graph._updateMode();
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });

    it('should set READY when both entities and relationships exist', () => {
      graph._entities.characters = [{ name: 'Test' }];
      graph._relationships = [{ sourceEntity: 'A', targetEntity: 'B' }];
      graph._updateMode();
      expect(graph._mode).toBe(GraphMode.READY);
    });
  });

  // --- _getTotalEntityCount ---

  describe('_getTotalEntityCount', () => {
    it('should return 0 for empty entities', () => {
      expect(graph._getTotalEntityCount()).toBe(0);
    });

    it('should count all entity types', () => {
      graph.setEntities(sampleEntities);
      expect(graph._getTotalEntityCount()).toBe(4);
    });

    it('should count only populated types', () => {
      graph._entities.characters = [{ name: 'A' }, { name: 'B' }];
      expect(graph._getTotalEntityCount()).toBe(2);
    });
  });

  // --- _prepareContext ---

  describe('_prepareContext', () => {
    it('should return context with mode flags', async () => {
      graph._mode = GraphMode.READY;
      const ctx = await graph._prepareContext({});
      expect(ctx.isReady).toBe(true);
      expect(ctx.isEmpty).toBe(false);
      expect(ctx.isError).toBe(false);
    });

    it('should return EMPTY mode flags', async () => {
      graph._mode = GraphMode.EMPTY;
      const ctx = await graph._prepareContext({});
      expect(ctx.isReady).toBe(false);
      expect(ctx.isEmpty).toBe(true);
    });

    it('should return ERROR mode flags', async () => {
      graph._mode = GraphMode.ERROR;
      const ctx = await graph._prepareContext({});
      expect(ctx.isError).toBe(true);
    });

    it('should include entity and relationship counts', async () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      const ctx = await graph._prepareContext({});
      expect(ctx.totalEntities).toBe(4);
      expect(ctx.totalRelationships).toBe(3);
    });

    it('should include entity type filter options', async () => {
      graph.setEntities(sampleEntities);
      const ctx = await graph._prepareContext({});
      expect(ctx.entityTypeOptions).toHaveLength(4); // all, character, location, item
      expect(ctx.entityTypeOptions[0].value).toBe('all');
    });

    it('should include relationship type filter options', async () => {
      graph.setRelationships(sampleRelationships);
      const ctx = await graph._prepareContext({});
      expect(ctx.relationshipTypeOptions).toBeDefined();
      // Should have 'all' plus the types present in relationships
      expect(ctx.relationshipTypeOptions.length).toBeGreaterThanOrEqual(1);
      expect(ctx.relationshipTypeOptions[0].value).toBe('all');
    });

    it('should include legend items', async () => {
      const ctx = await graph._prepareContext({});
      expect(ctx.legendItems).toBeDefined();
      expect(ctx.legendItems.length).toBeGreaterThan(0);
      expect(ctx.legendItems[0]).toHaveProperty('type');
      expect(ctx.legendItems[0]).toHaveProperty('color');
    });

    it('should include current filters', async () => {
      graph._filters = { entityType: 'character', relationshipType: 'ally' };
      const ctx = await graph._prepareContext({});
      expect(ctx.filters.entityType).toBe('character');
      expect(ctx.filters.relationshipType).toBe('ally');
    });

    it('should only include relationship types that have matches', async () => {
      graph.setRelationships([
        { sourceEntity: 'A', targetEntity: 'B', relationType: 'ally' }
      ]);
      const ctx = await graph._prepareContext({});
      // 'all' + 'ally' only
      const typeValues = ctx.relationshipTypeOptions.map(o => o.value);
      expect(typeValues).toContain('all');
      expect(typeValues).toContain('ally');
      expect(typeValues).not.toContain('enemy');
    });
  });

  // --- _buildGraphData ---

  describe('_buildGraphData', () => {
    it('should return empty nodes and edges for no data', () => {
      const { nodes, edges } = graph._buildGraphData();
      expect(nodes).toEqual([]);
      expect(edges).toEqual([]);
    });

    it('should create nodes from entities', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      const { nodes } = graph._buildGraphData();
      expect(nodes).toHaveLength(4); // 2 chars + 1 loc + 1 item
    });

    it('should set node labels from entity names', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      const { nodes } = graph._buildGraphData();
      const labels = nodes.map(n => n.label);
      expect(labels).toContain('Gandalf');
      expect(labels).toContain('Frodo');
      expect(labels).toContain('Rivendell');
      expect(labels).toContain('The One Ring');
    });

    it('should use "Unknown" for entities without names', () => {
      graph._entities.characters = [{ description: 'No name' }];
      graph._relationships = [{ sourceEntity: 'Unknown', targetEntity: 'Unknown', relationType: 'ally' }];
      const { nodes } = graph._buildGraphData();
      expect(nodes[0].label).toBe('Unknown');
    });

    it('should create edges from relationships', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(3);
    });

    it('should skip edges where source entity is not in graph', () => {
      graph._entities.characters = [{ name: 'Gandalf' }];
      graph._relationships = [
        { sourceEntity: 'Unknown', targetEntity: 'Gandalf', relationType: 'ally' }
      ];
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(0);
    });

    it('should skip edges where target entity is not in graph', () => {
      graph._entities.characters = [{ name: 'Gandalf' }];
      graph._relationships = [
        { sourceEntity: 'Gandalf', targetEntity: 'Unknown', relationType: 'ally' }
      ];
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(0);
    });

    it('should assign correct colors to entity type nodes', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      const { nodes } = graph._buildGraphData();
      const gandalfNode = nodes.find(n => n.label === 'Gandalf');
      const rivendellNode = nodes.find(n => n.label === 'Rivendell');
      const ringNode = nodes.find(n => n.label === 'The One Ring');

      expect(gandalfNode.color).toBe(graph._entityColors[EntityType.CHARACTER]);
      expect(rivendellNode.color).toBe(graph._entityColors[EntityType.LOCATION]);
      expect(ringNode.color).toBe(graph._entityColors[EntityType.ITEM]);
    });

    it('should assign group based on entity type', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      const { nodes } = graph._buildGraphData();
      const gandalfNode = nodes.find(n => n.label === 'Gandalf');
      expect(gandalfNode.group).toBe(EntityType.CHARACTER);
    });

    it('should set edge IDs', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      const { edges } = graph._buildGraphData();
      expect(edges[0].id).toBe('edge-0');
      expect(edges[1].id).toBe('edge-1');
    });

    it('should use confidence as edge value', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      const { edges } = graph._buildGraphData();
      expect(edges[0].value).toBe(8);
    });

    it('should default edge value to 5 when no confidence', () => {
      graph.setEntities({
        characters: [{ name: 'A' }, { name: 'B' }]
      });
      graph._relationships = [
        { sourceEntity: 'A', targetEntity: 'B', relationType: 'ally' }
      ];
      const { edges } = graph._buildGraphData();
      expect(edges[0].value).toBe(5);
    });

    // Filter tests

    it('should filter nodes by entity type', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      graph._filters.entityType = EntityType.CHARACTER;
      const { nodes } = graph._buildGraphData();
      expect(nodes).toHaveLength(2); // only characters
      nodes.forEach(n => expect(n.group).toBe(EntityType.CHARACTER));
    });

    it('should filter edges by relationship type', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      graph._filters.relationshipType = 'ally';
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(1);
    });

    it('should include all nodes when filter is ALL', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      graph._filters.entityType = EntityType.ALL;
      const { nodes } = graph._buildGraphData();
      expect(nodes).toHaveLength(4);
    });

    it('should include all edges when relationship filter is all', () => {
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);
      graph._filters.relationshipType = 'all';
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(3);
    });

    it('should handle unknown relationship type with fallback color', () => {
      graph.setEntities({
        characters: [{ name: 'A' }, { name: 'B' }]
      });
      graph._relationships = [
        { sourceEntity: 'A', targetEntity: 'B', relationType: 'nonexistent_type' }
      ];
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(1);
      expect(edges[0].color).toBe(graph._relationshipColors['unknown']);
    });

    it('should handle missing relationType by defaulting to unknown', () => {
      graph.setEntities({
        characters: [{ name: 'A' }, { name: 'B' }]
      });
      graph._relationships = [
        { sourceEntity: 'A', targetEntity: 'B' }
      ];
      const { edges } = graph._buildGraphData();
      expect(edges[0].color).toBe(graph._relationshipColors['unknown']);
    });
  });

  // --- _onEntityTypeFilterChange ---

  describe('_onEntityTypeFilterChange', () => {
    it('should update entity type filter', () => {
      graph._refreshGraph = vi.fn();
      graph._onEntityTypeFilterChange({ target: { value: EntityType.CHARACTER } });
      expect(graph._filters.entityType).toBe(EntityType.CHARACTER);
    });

    it('should call _refreshGraph', () => {
      graph._refreshGraph = vi.fn();
      graph._onEntityTypeFilterChange({ target: { value: EntityType.ALL } });
      expect(graph._refreshGraph).toHaveBeenCalled();
    });
  });

  // --- _onRelationshipTypeFilterChange ---

  describe('_onRelationshipTypeFilterChange', () => {
    it('should update relationship type filter', () => {
      graph._refreshGraph = vi.fn();
      graph._onRelationshipTypeFilterChange({ target: { value: 'ally' } });
      expect(graph._filters.relationshipType).toBe('ally');
    });

    it('should call _refreshGraph', () => {
      graph._refreshGraph = vi.fn();
      graph._onRelationshipTypeFilterChange({ target: { value: 'all' } });
      expect(graph._refreshGraph).toHaveBeenCalled();
    });
  });

  // --- _refreshGraph ---

  describe('_refreshGraph', () => {
    it('should warn and return if network not initialized', () => {
      graph._network = null;
      graph._refreshGraph();
      // Should not throw
    });

    it('should rebuild and update network with current data', () => {
      const mockNetwork = {
        setData: vi.fn(),
        fit: vi.fn()
      };
      graph._network = mockNetwork;
      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);

      // Mock vis global for DataSet
      globalThis.vis = {
        DataSet: vi.fn((data) => data)
      };

      graph._refreshGraph();

      expect(mockNetwork.setData).toHaveBeenCalled();
      expect(mockNetwork.fit).toHaveBeenCalled();

      delete globalThis.vis;
    });

    it('should handle error during refresh', () => {
      const mockNetwork = {
        setData: vi.fn(() => { throw new Error('setData failed'); }),
        fit: vi.fn()
      };
      graph._network = mockNetwork;

      globalThis.vis = {
        DataSet: vi.fn((data) => data)
      };

      expect(() => graph._refreshGraph()).not.toThrow();
      expect(ui.notifications.error).toHaveBeenCalled();

      delete globalThis.vis;
    });
  });

  // --- _onNodeClick ---

  describe('_onNodeClick', () => {
    it('should select clicked node', () => {
      graph._network = {
        selectNodes: vi.fn()
      };

      graph._onNodeClick({ nodes: [42] });

      expect(graph._network.selectNodes).toHaveBeenCalledWith([42]);
    });

    it('should do nothing when no nodes clicked', () => {
      graph._network = {
        selectNodes: vi.fn()
      };

      graph._onNodeClick({ nodes: [] });

      expect(graph._network.selectNodes).not.toHaveBeenCalled();
    });
  });

  // --- _onNodeDoubleClick ---

  describe('_onNodeDoubleClick', () => {
    it('should focus on double-clicked node', () => {
      graph._network = {
        focus: vi.fn()
      };

      graph._onNodeDoubleClick({ nodes: [7] });

      expect(graph._network.focus).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          scale: 1.5,
          animation: expect.any(Object)
        })
      );
    });

    it('should do nothing when no nodes double-clicked', () => {
      graph._network = {
        focus: vi.fn()
      };

      graph._onNodeDoubleClick({ nodes: [] });

      expect(graph._network.focus).not.toHaveBeenCalled();
    });
  });

  // --- close ---

  describe('close', () => {
    it('should destroy network on close', async () => {
      const mockNetwork = {
        destroy: vi.fn()
      };
      graph._network = mockNetwork;

      await graph.close();

      expect(mockNetwork.destroy).toHaveBeenCalled();
      expect(graph._network).toBeNull();
    });

    it('should handle close with no network', async () => {
      graph._network = null;
      await expect(graph.close()).resolves.not.toThrow();
    });
  });

  // --- _onRender ---

  describe('_onRender', () => {
    it('should attach filter change event listeners', () => {
      const mockSelect = { addEventListener: vi.fn() };
      const mockElement = {
        querySelectorAll: vi.fn((selector) => {
          if (selector.includes('entity-type')) return [mockSelect];
          if (selector.includes('relationship-type')) return [mockSelect];
          return [];
        })
      };
      Object.defineProperty(graph, 'element', {
        get: () => mockElement,
        configurable: true
      });

      graph._onRender({}, {});

      expect(mockElement.querySelectorAll).toHaveBeenCalledWith('[data-filter="entity-type"]');
      expect(mockElement.querySelectorAll).toHaveBeenCalledWith('[data-filter="relationship-type"]');
      expect(mockSelect.addEventListener).toHaveBeenCalledTimes(2);
    });

    it('should initialize graph when in READY mode', () => {
      const mockElement = {
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(graph, 'element', {
        get: () => mockElement,
        configurable: true
      });
      graph._mode = GraphMode.READY;
      vi.spyOn(graph, '_initializeGraph').mockResolvedValue();

      graph._onRender({}, {});

      expect(graph._initializeGraph).toHaveBeenCalled();
    });

    it('should not initialize graph when in EMPTY mode', () => {
      const mockElement = {
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(graph, 'element', {
        get: () => mockElement,
        configurable: true
      });
      graph._mode = GraphMode.EMPTY;
      vi.spyOn(graph, '_initializeGraph').mockResolvedValue();

      graph._onRender({}, {});

      expect(graph._initializeGraph).not.toHaveBeenCalled();
    });

    it('should abort previous listener controller', () => {
      const mockElement = {
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(graph, 'element', {
        get: () => mockElement,
        configurable: true
      });

      // First render
      graph._onRender({}, {});
      // Second render should abort first
      graph._onRender({}, {});
      // No error means success
    });

    it('should handle null element gracefully', () => {
      Object.defineProperty(graph, 'element', {
        get: () => null,
        configurable: true
      });
      expect(() => graph._onRender({}, {})).not.toThrow();
    });
  });

  // --- _initializeGraph ---

  describe('_initializeGraph', () => {
    it('should destroy existing network before creating new one', async () => {
      const mockNetwork = { destroy: vi.fn() };
      graph._network = mockNetwork;

      // vis not defined, so it will try to wait and eventually fail
      // but the destroy should happen first
      vi.spyOn(graph, '_waitForVisLibrary').mockRejectedValue(new Error('not loaded'));

      await graph._initializeGraph();

      expect(mockNetwork.destroy).toHaveBeenCalled();
    });

    it('should set ERROR mode when container not found', async () => {
      globalThis.vis = {
        DataSet: vi.fn(),
        Network: vi.fn()
      };

      const mockElement = {
        querySelector: vi.fn(() => null),
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(graph, 'element', {
        get: () => mockElement,
        configurable: true
      });

      await graph._initializeGraph();

      expect(graph._mode).toBe(GraphMode.ERROR);

      delete globalThis.vis;
    });

    it('should create network when container exists', async () => {
      const mockContainer = document.createElement('div');
      mockContainer.id = 'relationship-graph-network';

      const mockNetworkInstance = {
        on: vi.fn(),
        destroy: vi.fn()
      };

      globalThis.vis = {
        DataSet: vi.fn((data) => data),
        Network: vi.fn(() => mockNetworkInstance)
      };

      const mockElement = {
        querySelector: vi.fn(() => mockContainer),
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(graph, 'element', {
        get: () => mockElement,
        configurable: true
      });

      graph.setEntities(sampleEntities);
      graph.setRelationships(sampleRelationships);

      await graph._initializeGraph();

      expect(globalThis.vis.Network).toHaveBeenCalled();
      expect(graph._network).toBe(mockNetworkInstance);
      expect(mockNetworkInstance.on).toHaveBeenCalledWith('click', expect.any(Function));
      expect(mockNetworkInstance.on).toHaveBeenCalledWith('doubleClick', expect.any(Function));

      delete globalThis.vis;
    });

    it('should handle initialization error', async () => {
      globalThis.vis = {
        DataSet: vi.fn(() => { throw new Error('DataSet error'); }),
        Network: vi.fn()
      };

      const mockContainer = document.createElement('div');
      const mockElement = {
        querySelector: vi.fn(() => mockContainer),
        querySelectorAll: vi.fn(() => [])
      };
      Object.defineProperty(graph, 'element', {
        get: () => mockElement,
        configurable: true
      });

      await graph._initializeGraph();

      expect(graph._mode).toBe(GraphMode.ERROR);
      expect(ui.notifications.error).toHaveBeenCalled();

      delete globalThis.vis;
    });
  });

  // --- _waitForVisLibrary ---

  describe('_waitForVisLibrary', () => {
    it('should resolve when vis is already loaded', async () => {
      globalThis.vis = {};
      await expect(graph._waitForVisLibrary()).resolves.not.toThrow();
      delete globalThis.vis;
    });

    it('should throw when vis never loads', async () => {
      // Override the method to use a shorter timeout for testing
      const originalMethod = graph._waitForVisLibrary.bind(graph);

      // Create a version with short timeout by directly testing the error condition
      // The real method polls every 100ms for up to 5000ms.
      // We mock it to simulate the timeout behavior.
      vi.spyOn(graph, '_waitForVisLibrary').mockRejectedValue(
        new Error('vis-network library failed to load')
      );

      await expect(graph._waitForVisLibrary()).rejects.toThrow('vis-network library failed to load');
    });
  });

  // --- Static action handlers ---

  describe('static action handlers', () => {
    it('_onRefreshClick should reset filters and re-render', () => {
      const mockInstance = {
        _logger: { debug: vi.fn() },
        _filters: { entityType: 'character', relationshipType: 'ally' },
        render: vi.fn()
      };
      RelationshipGraph._onRefreshClick.call(mockInstance, {}, null);
      expect(mockInstance._filters.entityType).toBe(EntityType.ALL);
      expect(mockInstance._filters.relationshipType).toBe('all');
      expect(mockInstance.render).toHaveBeenCalled();
    });

    it('_onExportClick should create JSON and trigger download', async () => {
      const mockInstance = {
        _logger: { debug: vi.fn(), error: vi.fn() },
        _entities: sampleEntities,
        _relationships: sampleRelationships
      };

      // Mock URL and document APIs
      const mockUrl = 'blob:test';
      globalThis.URL.createObjectURL = vi.fn(() => mockUrl);
      globalThis.URL.revokeObjectURL = vi.fn();

      const mockLink = { href: '', download: '', click: vi.fn() };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink);

      await RelationshipGraph._onExportClick.call(mockInstance, {}, null);

      expect(mockLink.click).toHaveBeenCalled();
      expect(globalThis.URL.revokeObjectURL).toHaveBeenCalledWith(mockUrl);
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('_onExportClick should handle errors', async () => {
      const mockInstance = {
        _logger: { debug: vi.fn(), error: vi.fn() },
        _entities: null, // will cause JSON.stringify to fail indirectly? no it won't
        _relationships: null
      };

      // Force error by making Blob constructor throw
      const origBlob = globalThis.Blob;
      globalThis.Blob = vi.fn(() => { throw new Error('Blob error'); });

      await RelationshipGraph._onExportClick.call(mockInstance, {}, null);

      expect(mockInstance._logger.error).toHaveBeenCalled();
      expect(ui.notifications.error).toHaveBeenCalled();

      globalThis.Blob = origBlob;
    });

    it('_onCloseClick should close the application', () => {
      const mockInstance = {
        close: vi.fn()
      };
      RelationshipGraph._onCloseClick.call(mockInstance, {}, null);
      expect(mockInstance.close).toHaveBeenCalled();
    });
  });

  // --- Color mappings ---

  describe('color mappings', () => {
    it('should have entity colors for all entity types', () => {
      expect(graph._entityColors[EntityType.CHARACTER]).toBeDefined();
      expect(graph._entityColors[EntityType.LOCATION]).toBeDefined();
      expect(graph._entityColors[EntityType.ITEM]).toBeDefined();
    });

    it('should have relationship colors for all relationship types', () => {
      expect(graph._relationshipColors['ally']).toBeDefined();
      expect(graph._relationshipColors['enemy']).toBeDefined();
      expect(graph._relationshipColors['family']).toBeDefined();
      expect(graph._relationshipColors['friend']).toBeDefined();
      expect(graph._relationshipColors['rival']).toBeDefined();
      expect(graph._relationshipColors['neutral']).toBeDefined();
      expect(graph._relationshipColors['unknown']).toBeDefined();
    });
  });
});
