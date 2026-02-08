/**
 * RelationshipGraph Unit Tests
 *
 * Tests for the RelationshipGraph UI component.
 * Covers graph initialization, node/edge creation, filtering,
 * event handling, vis-network integration, and export functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { createMockApplication } from '../helpers/foundry-mock.js';

// Mock Logger before importing RelationshipGraph
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

// Set up DOM and globals before any test runs
setupEnvironment();

function setupEnvironment() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  global.document = dom.window.document;
  global.window = dom.window;
  global.navigator = dom.window.navigator;
  global.HTMLElement = dom.window.HTMLElement;
  global.Element = dom.window.Element;

  // Mock jQuery
  const createJQueryMock = (element) => {
    const mock = {
      find: vi.fn(() => mock),
      on: vi.fn(() => mock),
      off: vi.fn(() => mock),
      addClass: vi.fn(() => mock),
      removeClass: vi.fn(() => mock),
      toggleClass: vi.fn(() => mock),
      attr: vi.fn(() => mock),
      val: vi.fn(),
      text: vi.fn(),
      html: vi.fn(),
      0: element || document.createElement('div')
    };
    mock[0].getBoundingClientRect = vi.fn(() => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600
    }));
    return mock;
  };

  global.$ = vi.fn((selector) => {
    if (typeof selector === 'string') {
      const element = document.createElement('div');
      return createJQueryMock(element);
    }
    return createJQueryMock(selector);
  });

  // Mock foundry utils
  global.foundry = {
    utils: {
      mergeObject: (original, other) => ({ ...original, ...other }),
      deepClone: (obj) => JSON.parse(JSON.stringify(obj)),
      duplicate: (obj) => JSON.parse(JSON.stringify(obj)),
      isObjectEmpty: (obj) => Object.keys(obj).length === 0,
      randomID: () => Math.random().toString(36).substring(2, 18)
    }
  };

  // Mock game object
  global.game = {
    i18n: {
      localize: vi.fn((key) => key),
      format: vi.fn((key, data) => {
        let result = key;
        Object.entries(data || {}).forEach(([k, v]) => {
          result = result.replace(`{${k}}`, v);
        });
        return result;
      }),
      has: vi.fn(() => true)
    },
    settings: {
      get: vi.fn(),
      set: vi.fn(),
      register: vi.fn()
    },
    users: {
      contents: [],
      get: vi.fn(),
      find: vi.fn()
    }
  };

  // Mock ui notifications
  global.ui = {
    notifications: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }
  };

  // Mock vis-network library
  global.vis = {
    Network: vi.fn(function(container, data, options) {
      this.container = container;
      this.data = data;
      this.options = options;
      this.eventHandlers = {};

      this.on = vi.fn((event, handler) => {
        this.eventHandlers[event] = handler;
      });

      this.setData = vi.fn((newData) => {
        this.data = newData;
      });

      this.fit = vi.fn();
      this.destroy = vi.fn();
      this.selectNodes = vi.fn();
      this.focus = vi.fn();

      // Helper to trigger events in tests
      this.trigger = (event, params) => {
        if (this.eventHandlers[event]) {
          this.eventHandlers[event](params);
        }
      };
    }),
    DataSet: vi.fn(function(data) {
      this.data = data || [];
      this.add = vi.fn((item) => this.data.push(item));
      this.update = vi.fn();
      this.remove = vi.fn();
      this.get = vi.fn(() => this.data);
    })
  };

  // Mock Application base class
  global.Application = createMockApplication();
}

// Import after environment setup
const { RelationshipGraph, EntityType, GraphMode } = await import('../../scripts/ui/RelationshipGraph.mjs');

describe('RelationshipGraph', () => {
  let graph;
  let mockEntities;
  let mockRelationships;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEntities = {
      characters: [
        { name: 'Alice', description: 'A brave warrior' },
        { name: 'Bob', description: 'A wise wizard' }
      ],
      locations: [
        { name: 'Castle', description: 'A grand fortress' },
        { name: 'Forest', description: 'A dark woodland' }
      ],
      items: [
        { name: 'Sword', description: 'A magical blade' }
      ]
    };

    mockRelationships = [
      {
        sourceEntity: 'Alice',
        targetEntity: 'Bob',
        relationType: 'ally',
        description: 'Trusted companion',
        confidence: 8
      },
      {
        sourceEntity: 'Alice',
        targetEntity: 'Castle',
        relationType: 'neutral',
        description: 'Lives there',
        confidence: 9
      },
      {
        sourceEntity: 'Bob',
        targetEntity: 'Forest',
        relationType: 'enemy',
        description: 'Fears the dark',
        confidence: 7
      }
    ];
  });

  afterEach(() => {
    if (graph) {
      graph.close();
      graph = null;
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create a new RelationshipGraph instance', () => {
      graph = new RelationshipGraph();
      expect(graph).toBeDefined();
      expect(graph._entities).toEqual({
        characters: [],
        locations: [],
        items: []
      });
      expect(graph._relationships).toEqual([]);
      expect(graph._mode).toBe(GraphMode.LOADING);
    });

    it('should initialize with provided entities', () => {
      graph = new RelationshipGraph({ entities: mockEntities });
      expect(graph._entities).toEqual(mockEntities);
    });

    it('should initialize with provided relationships', () => {
      graph = new RelationshipGraph({ relationships: mockRelationships });
      expect(graph._relationships).toEqual(mockRelationships);
    });

    it('should initialize with both entities and relationships', () => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
      expect(graph._entities).toEqual(mockEntities);
      expect(graph._relationships).toEqual(mockRelationships);
      expect(graph._mode).toBe(GraphMode.READY);
    });

    it('should set mode to EMPTY when entities are empty', () => {
      graph = new RelationshipGraph({
        entities: { characters: [], locations: [], items: [] },
        relationships: mockRelationships
      });
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });

    it('should set mode to EMPTY when relationships are empty', () => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: []
      });
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });
  });

  describe('defaultOptions', () => {
    it('should return proper default options', () => {
      const options = RelationshipGraph.defaultOptions;
      expect(options.id).toBe('vox-chronicle-relationship-graph');
      expect(options.template).toBe('modules/vox-chronicle/templates/relationship-graph.hbs');
      expect(options.classes).toContain('vox-chronicle');
      expect(options.classes).toContain('relationship-graph');
      expect(options.width).toBe(800);
      expect(options.height).toBe(600);
      expect(options.minimizable).toBe(true);
      expect(options.resizable).toBe(true);
    });

    it('should localize the title', () => {
      const options = RelationshipGraph.defaultOptions;
      expect(game.i18n.localize).toHaveBeenCalledWith('VOXCHRONICLE.RelationshipGraph.Title');
    });
  });

  describe('setEntities', () => {
    beforeEach(() => {
      graph = new RelationshipGraph();
    });

    it('should set entities correctly', () => {
      graph.setEntities(mockEntities);
      expect(graph._entities).toEqual(mockEntities);
    });

    it('should handle missing character array', () => {
      graph.setEntities({ locations: mockEntities.locations });
      expect(graph._entities.characters).toEqual([]);
      expect(graph._entities.locations).toEqual(mockEntities.locations);
    });

    it('should handle null entities gracefully', () => {
      graph.setEntities({ characters: null, locations: null, items: null });
      expect(graph._entities.characters).toEqual([]);
      expect(graph._entities.locations).toEqual([]);
      expect(graph._entities.items).toEqual([]);
    });

    it('should update mode to EMPTY when no entities', () => {
      graph.setRelationships(mockRelationships);
      graph.setEntities({ characters: [], locations: [], items: [] });
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });

    it('should update mode to READY when entities and relationships exist', () => {
      graph.setRelationships(mockRelationships);
      graph.setEntities(mockEntities);
      expect(graph._mode).toBe(GraphMode.READY);
    });
  });

  describe('setRelationships', () => {
    beforeEach(() => {
      graph = new RelationshipGraph();
    });

    it('should set relationships correctly', () => {
      graph.setRelationships(mockRelationships);
      expect(graph._relationships).toEqual(mockRelationships);
    });

    it('should handle null relationships gracefully', () => {
      graph.setRelationships(null);
      expect(graph._relationships).toEqual([]);
    });

    it('should update mode to EMPTY when no relationships', () => {
      graph.setEntities(mockEntities);
      graph.setRelationships([]);
      expect(graph._mode).toBe(GraphMode.EMPTY);
    });

    it('should update mode to READY when entities and relationships exist', () => {
      graph.setEntities(mockEntities);
      graph.setRelationships(mockRelationships);
      expect(graph._mode).toBe(GraphMode.READY);
    });
  });

  describe('_getTotalEntityCount', () => {
    beforeEach(() => {
      graph = new RelationshipGraph();
    });

    it('should return 0 when no entities', () => {
      expect(graph._getTotalEntityCount()).toBe(0);
    });

    it('should count all entities correctly', () => {
      graph.setEntities(mockEntities);
      expect(graph._getTotalEntityCount()).toBe(5); // 2 chars + 2 locs + 1 item
    });

    it('should handle partial entity sets', () => {
      graph.setEntities({ characters: mockEntities.characters, locations: [], items: [] });
      expect(graph._getTotalEntityCount()).toBe(2);
    });
  });

  describe('getData', () => {
    beforeEach(() => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
    });

    it('should return template data with correct mode flags', () => {
      const data = graph.getData();
      expect(data.mode).toBe(GraphMode.READY);
      expect(data.isReady).toBe(true);
      expect(data.isEmpty).toBe(false);
      expect(data.isError).toBe(false);
    });

    it('should include entity and relationship counts', () => {
      const data = graph.getData();
      expect(data.totalEntities).toBe(5);
      expect(data.totalRelationships).toBe(3);
    });

    it('should include entity type filter options', () => {
      const data = graph.getData();
      expect(data.entityTypeOptions).toHaveLength(4);
      expect(data.entityTypeOptions[0].value).toBe(EntityType.ALL);
      expect(data.entityTypeOptions[1].value).toBe(EntityType.CHARACTER);
      expect(data.entityTypeOptions[1].count).toBe(2);
      expect(data.entityTypeOptions[2].value).toBe(EntityType.LOCATION);
      expect(data.entityTypeOptions[2].count).toBe(2);
      expect(data.entityTypeOptions[3].value).toBe(EntityType.ITEM);
      expect(data.entityTypeOptions[3].count).toBe(1);
    });

    it('should include relationship type filter options', () => {
      const data = graph.getData();
      expect(data.relationshipTypeOptions).toContainEqual(
        expect.objectContaining({ value: 'all' })
      );
      // Should include options for ally, neutral, enemy (types in mockRelationships)
      expect(data.relationshipTypeOptions.length).toBeGreaterThan(1);
    });

    it('should include legend items with colors', () => {
      const data = graph.getData();
      expect(data.legendItems).toBeDefined();
      expect(Array.isArray(data.legendItems)).toBe(true);
      expect(data.legendItems.length).toBeGreaterThan(0);
      data.legendItems.forEach(item => {
        expect(item.type).toBeDefined();
        expect(item.label).toBeDefined();
        expect(item.color).toBeDefined();
      });
    });

    it('should include current filter state', () => {
      graph._filters.entityType = EntityType.CHARACTER;
      graph._filters.relationshipType = 'ally';
      const data = graph.getData();
      expect(data.filters.entityType).toBe(EntityType.CHARACTER);
      expect(data.filters.relationshipType).toBe('ally');
    });

    it('should show EMPTY mode when no data', () => {
      graph.setEntities({ characters: [], locations: [], items: [] });
      graph.setRelationships([]);
      const data = graph.getData();
      expect(data.isEmpty).toBe(true);
      expect(data.isReady).toBe(false);
    });
  });

  describe('_buildGraphData', () => {
    beforeEach(() => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
    });

    it('should build nodes from all entities', () => {
      const { nodes, edges } = graph._buildGraphData();
      expect(nodes).toHaveLength(5); // 2 chars + 2 locs + 1 item
    });

    it('should build edges from relationships', () => {
      const { nodes, edges } = graph._buildGraphData();
      expect(edges).toHaveLength(3); // 3 relationships
    });

    it('should assign unique IDs to nodes', () => {
      const { nodes } = graph._buildGraphData();
      const ids = nodes.map(n => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should include entity colors in nodes', () => {
      const { nodes } = graph._buildGraphData();
      const aliceNode = nodes.find(n => n.label === 'Alice');
      expect(aliceNode.color).toBeDefined();
      expect(aliceNode.group).toBe(EntityType.CHARACTER);
    });

    it('should include relationship colors in edges', () => {
      const { edges } = graph._buildGraphData();
      expect(edges[0].color).toBeDefined();
    });

    it('should filter nodes by entity type', () => {
      graph._filters.entityType = EntityType.CHARACTER;
      const { nodes } = graph._buildGraphData();
      expect(nodes).toHaveLength(2); // Only characters
      expect(nodes.every(n => n.group === EntityType.CHARACTER)).toBe(true);
    });

    it('should filter edges by relationship type', () => {
      graph._filters.relationshipType = 'ally';
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(1); // Only ally relationship
    });

    it('should skip edges when source entity not in filtered nodes', () => {
      graph._filters.entityType = EntityType.LOCATION;
      const { nodes, edges } = graph._buildGraphData();
      expect(nodes).toHaveLength(2); // Only locations
      expect(edges).toHaveLength(0); // No edges connect two locations
    });

    it('should handle unknown relationship types', () => {
      graph.setRelationships([
        { sourceEntity: 'Alice', targetEntity: 'Bob', relationType: 'unknown_type' }
      ]);
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(1);
      expect(edges[0].color).toBeDefined(); // Should use default color
    });

    it('should use confidence as edge value', () => {
      const { edges } = graph._buildGraphData();
      const allyEdge = edges.find(e => e.label === 'VOXCHRONICLE.RelationshipType.ally');
      expect(allyEdge.value).toBe(8); // confidence from mockRelationships
    });

    it('should default confidence to 5 when missing', () => {
      graph.setRelationships([
        { sourceEntity: 'Alice', targetEntity: 'Bob', relationType: 'ally' }
      ]);
      const { edges } = graph._buildGraphData();
      expect(edges[0].value).toBe(5);
    });

    it('should include tooltips for nodes', () => {
      const { nodes } = graph._buildGraphData();
      const aliceNode = nodes.find(n => n.label === 'Alice');
      expect(aliceNode.title).toBe('A brave warrior');
    });

    it('should include tooltips for edges', () => {
      const { edges } = graph._buildGraphData();
      expect(edges[0].title).toBeDefined();
    });

    it('should handle case-insensitive entity matching', () => {
      graph.setRelationships([
        { sourceEntity: 'ALICE', targetEntity: 'bob', relationType: 'ally' }
      ]);
      const { edges } = graph._buildGraphData();
      expect(edges).toHaveLength(1);
    });
  });

  describe('activateListeners', () => {
    let mockHtml;

    beforeEach(() => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });

      mockHtml = {
        find: vi.fn(() => mockHtml),
        on: vi.fn(() => mockHtml)
      };
    });

    it('should attach entity type filter handler', () => {
      graph.activateListeners(mockHtml);
      expect(mockHtml.find).toHaveBeenCalledWith('[data-filter="entity-type"]');
      expect(mockHtml.on).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should attach relationship type filter handler', () => {
      graph.activateListeners(mockHtml);
      expect(mockHtml.find).toHaveBeenCalledWith('[data-filter="relationship-type"]');
      expect(mockHtml.on).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should attach button handlers', () => {
      graph.activateListeners(mockHtml);
      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="refresh"]');
      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="export"]');
      expect(mockHtml.find).toHaveBeenCalledWith('[data-action="close"]');
    });

    it('should initialize graph when in READY mode', () => {
      const initSpy = vi.spyOn(graph, '_initializeGraph');
      graph.activateListeners(mockHtml);
      expect(initSpy).toHaveBeenCalledWith(mockHtml);
    });

    it('should not initialize graph when in EMPTY mode', () => {
      graph._mode = GraphMode.EMPTY;
      const initSpy = vi.spyOn(graph, '_initializeGraph');
      graph.activateListeners(mockHtml);
      expect(initSpy).not.toHaveBeenCalled();
    });
  });

  describe('_initializeGraph', () => {
    let mockHtml;
    let mockContainer;

    beforeEach(() => {
      mockContainer = document.createElement('div');
      mockContainer.id = 'relationship-graph-network';

      mockHtml = {
        find: vi.fn((selector) => {
          if (selector === '#relationship-graph-network') {
            return [mockContainer];
          }
          return [];
        })
      };

      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
    });

    it('should create vis.Network instance', async () => {
      await graph._initializeGraph(mockHtml);
      expect(vis.Network).toHaveBeenCalledWith(
        mockContainer,
        expect.objectContaining({
          nodes: expect.any(Object),
          edges: expect.any(Object)
        }),
        expect.objectContaining({
          nodes: expect.any(Object),
          edges: expect.any(Object),
          physics: expect.any(Object)
        })
      );
    });

    it('should attach node click handler', async () => {
      await graph._initializeGraph(mockHtml);
      expect(graph._network.on).toHaveBeenCalledWith('click', expect.any(Function));
    });

    it('should attach node double-click handler', async () => {
      await graph._initializeGraph(mockHtml);
      expect(graph._network.on).toHaveBeenCalledWith('doubleClick', expect.any(Function));
    });

    it('should handle missing container gracefully', async () => {
      mockHtml.find = vi.fn(() => []);
      await graph._initializeGraph(mockHtml);
      expect(graph._mode).toBe(GraphMode.ERROR);
    });

    it('should wait for vis library if not loaded', async () => {
      const originalVis = global.vis;
      global.vis = undefined;

      // Restore vis after a delay
      setTimeout(() => {
        global.vis = originalVis;
      }, 50);

      await graph._initializeGraph(mockHtml);
      expect(graph._network).toBeDefined();
    });

    it('should set ERROR mode if vis library fails to load', async () => {
      const originalVis = global.vis;
      global.vis = undefined;

      await graph._initializeGraph(mockHtml);

      expect(graph._mode).toBe(GraphMode.ERROR);
      expect(ui.notifications.error).toHaveBeenCalled();

      global.vis = originalVis;
    }, 10000); // Increase timeout to 10 seconds
  });

  describe('Filter Event Handlers', () => {
    beforeEach(() => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
      graph._network = new global.vis.Network(document.createElement('div'), {}, {});
    });

    it('should handle entity type filter change', () => {
      const event = { target: { value: EntityType.CHARACTER } };
      graph._onEntityTypeFilterChange(event);
      expect(graph._filters.entityType).toBe(EntityType.CHARACTER);
    });

    it('should refresh graph after entity type filter change', () => {
      const refreshSpy = vi.spyOn(graph, '_refreshGraph');
      const event = { target: { value: EntityType.CHARACTER } };
      graph._onEntityTypeFilterChange(event);
      expect(refreshSpy).toHaveBeenCalled();
    });

    it('should handle relationship type filter change', () => {
      const event = { target: { value: 'ally' } };
      graph._onRelationshipTypeFilterChange(event);
      expect(graph._filters.relationshipType).toBe('ally');
    });

    it('should refresh graph after relationship type filter change', () => {
      const refreshSpy = vi.spyOn(graph, '_refreshGraph');
      const event = { target: { value: 'ally' } };
      graph._onRelationshipTypeFilterChange(event);
      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('_refreshGraph', () => {
    beforeEach(() => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
    });

    it('should warn if network not initialized', () => {
      graph._network = null;
      graph._refreshGraph();
      expect(graph._logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot refresh graph')
      );
    });

    it('should rebuild and update graph data', () => {
      graph._network = new global.vis.Network(document.createElement('div'), {}, {});
      graph._refreshGraph();
      expect(graph._network.setData).toHaveBeenCalled();
      expect(graph._network.fit).toHaveBeenCalled();
    });

    it('should handle refresh errors gracefully', () => {
      graph._network = new global.vis.Network(document.createElement('div'), {}, {});
      graph._network.setData.mockImplementation(() => {
        throw new Error('Refresh failed');
      });

      graph._refreshGraph();
      expect(graph._logger.error).toHaveBeenCalled();
      expect(ui.notifications.error).toHaveBeenCalled();
    });
  });

  describe('Button Event Handlers', () => {
    let mockEvent;

    beforeEach(() => {
      mockEvent = { preventDefault: vi.fn() };
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
    });

    it('should handle refresh button click', () => {
      const renderSpy = vi.spyOn(graph, 'render');
      graph._onRefreshClick(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(graph._filters.entityType).toBe(EntityType.ALL);
      expect(graph._filters.relationshipType).toBe('all');
      expect(renderSpy).toHaveBeenCalledWith(true);
    });

    it('should handle export button click', async () => {
      global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
      global.URL.revokeObjectURL = vi.fn();
      global.Blob = vi.fn((content, options) => ({ content, options }));

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn()
      };
      document.createElement = vi.fn(() => mockAnchor);

      await graph._onExportClick(mockEvent);

      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(ui.notifications.info).toHaveBeenCalled();
    });

    it('should handle export errors gracefully', async () => {
      global.Blob = vi.fn(() => {
        throw new Error('Export failed');
      });

      await graph._onExportClick(mockEvent);

      expect(graph._logger.error).toHaveBeenCalled();
      expect(ui.notifications.error).toHaveBeenCalled();
    });

    it('should handle close button click', () => {
      const closeSpy = vi.spyOn(graph, 'close');
      graph._onCloseClick(mockEvent);
      expect(mockEvent.preventDefault).toHaveBeenCalled();
      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('Node Event Handlers', () => {
    beforeEach(() => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
      graph._network = new global.vis.Network(document.createElement('div'), {}, {});
    });

    it('should handle node click', () => {
      const params = { nodes: [0] };
      graph._onNodeClick(params);
      expect(graph._network.selectNodes).toHaveBeenCalledWith([0]);
    });

    it('should ignore click when no node selected', () => {
      const params = { nodes: [] };
      graph._onNodeClick(params);
      expect(graph._network.selectNodes).not.toHaveBeenCalled();
    });

    it('should handle node double-click', () => {
      const params = { nodes: [1] };
      graph._onNodeDoubleClick(params);
      expect(graph._network.focus).toHaveBeenCalledWith(1, expect.objectContaining({
        scale: 1.5,
        animation: expect.any(Object)
      }));
    });

    it('should ignore double-click when no node selected', () => {
      const params = { nodes: [] };
      graph._onNodeDoubleClick(params);
      expect(graph._network.focus).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    beforeEach(() => {
      graph = new RelationshipGraph({
        entities: mockEntities,
        relationships: mockRelationships
      });
    });

    it('should destroy network instance on close', async () => {
      const mockNetwork = new global.vis.Network(document.createElement('div'), {}, {});
      graph._network = mockNetwork;
      await graph.close();
      expect(mockNetwork.destroy).toHaveBeenCalled();
      expect(graph._network).toBeNull();
    });

    it('should handle close when network not initialized', async () => {
      graph._network = null;
      await expect(graph.close()).resolves.not.toThrow();
    });
  });

  describe('Enums Export', () => {
    it('should export EntityType enum', () => {
      expect(EntityType).toBeDefined();
      expect(EntityType.CHARACTER).toBe('character');
      expect(EntityType.LOCATION).toBe('location');
      expect(EntityType.ITEM).toBe('item');
      expect(EntityType.ALL).toBe('all');
    });

    it('should export GraphMode enum', () => {
      expect(GraphMode).toBeDefined();
      expect(GraphMode.LOADING).toBe('loading');
      expect(GraphMode.READY).toBe('ready');
      expect(GraphMode.EMPTY).toBe('empty');
      expect(GraphMode.ERROR).toBe('error');
    });
  });
});
