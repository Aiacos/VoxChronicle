/**
 * RelationshipGraph - UI Component for Visualizing Entity Relationships
 *
 * A Foundry VTT Application that displays entities and their relationships
 * as an interactive network graph using vis-network library. Allows filtering
 * by entity type and relationship type.
 *
 * @class RelationshipGraph
 * @augments HandlebarsApplicationMixin(ApplicationV2)
 * @module vox-chronicle
 */

import { MODULE_ID } from '../constants.mjs';
import { Logger } from '../utils/Logger.mjs';
import { RelationshipType } from '../ai/EntityExtractor.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Entity type enum for filtering
 * @enum {string}
 */
const EntityType = {
  CHARACTER: 'character',
  LOCATION: 'location',
  ITEM: 'item',
  ALL: 'all'
};

/**
 * Graph display mode enum
 * @enum {string}
 */
const GraphMode = {
  LOADING: 'loading',
  READY: 'ready',
  EMPTY: 'empty',
  ERROR: 'error'
};

/**
 * RelationshipGraph Application class
 * Provides UI for visualizing entity relationships as an interactive network graph
 */
class RelationshipGraph extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * Logger instance for this class
   * @type {object}
   * @private
   */
  _logger = Logger.createChild('RelationshipGraph');

  /**
   * Entities to display in the graph
   * @type {object}
   * @private
   */
  _entities = {
    characters: [],
    locations: [],
    items: []
  };

  /**
   * Relationships to display as edges
   * @type {Array}
   * @private
   */
  _relationships = [];

  /**
   * Current display mode
   * @type {string}
   * @private
   */
  _mode = GraphMode.LOADING;

  /**
   * vis-network instance
   * @type {object | null}
   * @private
   */
  _network = null;

  /**
   * Current filter settings
   * @type {object}
   * @private
   */
  _filters = {
    entityType: EntityType.ALL,
    relationshipType: 'all'
  };

  /**
   * AbortController for non-action event listeners
   * @type {AbortController|null}
   * @private
   */
  #listenerController = null;

  /**
   * Whether vis-network CDN script has been loaded
   * @type {boolean}
   * @private
   * @static
   */
  static #visLoaded = false;

  /**
   * Shared promise for vis-network CDN load (prevents duplicate script injection)
   * @type {Promise<void>|null}
   * @private
   * @static
   */
  static #visLoadPromise = null;

  /**
   * Color mapping for entity types
   * @type {object}
   * @private
   */
  _entityColors = {
    [EntityType.CHARACTER]: '#4A90E2',
    [EntityType.LOCATION]: '#50C878',
    [EntityType.ITEM]: '#F5A623'
  };

  /**
   * Color mapping for relationship types
   * @type {object}
   * @private
   */
  _relationshipColors = {
    [RelationshipType.ALLY]: '#50C878',
    [RelationshipType.ENEMY]: '#E74C3C',
    [RelationshipType.FAMILY]: '#9B59B6',
    [RelationshipType.EMPLOYER]: '#3498DB',
    [RelationshipType.EMPLOYEE]: '#3498DB',
    [RelationshipType.ROMANTIC]: '#E91E63',
    [RelationshipType.FRIEND]: '#2ECC71',
    [RelationshipType.RIVAL]: '#E67E22',
    [RelationshipType.NEUTRAL]: '#95A5A6',
    [RelationshipType.UNKNOWN]: '#7F8C8D'
  };

  static DEFAULT_OPTIONS = {
    id: 'vox-chronicle-relationship-graph',
    classes: ['vox-chronicle', 'relationship-graph'],
    window: {
      title: 'VOXCHRONICLE.RelationshipGraph.Title',
      resizable: true,
      minimizable: true
    },
    position: { width: 800, height: 600 },
    actions: {
      refresh: RelationshipGraph._onRefreshClick,
      export: RelationshipGraph._onExportClick,
      close: RelationshipGraph._onCloseClick
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/relationship-graph.hbs` }
  };

  /**
   * Create a new RelationshipGraph instance
   * @param {object} [options] - Application options
   * @param {object} [options.entities] - Entities to display
   * @param {Array} [options.relationships] - Relationships to display
   */
  constructor(options = {}) {
    super(options);

    if (options.entities) {
      this.setEntities(options.entities);
    }

    if (options.relationships) {
      this.setRelationships(options.relationships);
    }

    this._logger.debug('RelationshipGraph initialized');
  }

  /**
   * Set the entities to display in the graph
   * @param {object} entities - Entities object
   * @param {Array} [entities.characters] - Character entities
   * @param {Array} [entities.locations] - Location entities
   * @param {Array} [entities.items] - Item entities
   */
  setEntities(entities) {
    this._entities = {
      characters: Array.isArray(entities.characters) ? entities.characters : [],
      locations: Array.isArray(entities.locations) ? entities.locations : [],
      items: Array.isArray(entities.items) ? entities.items : []
    };

    this._logger.debug('Entities set:', {
      characters: this._entities.characters.length,
      locations: this._entities.locations.length,
      items: this._entities.items.length
    });

    // Update mode based on entity count
    this._updateMode();
  }

  /**
   * Set the relationships to display as edges
   * @param {Array} relationships - Array of relationship objects
   */
  setRelationships(relationships) {
    this._relationships = Array.isArray(relationships) ? relationships : [];

    this._logger.debug('Relationships set:', this._relationships.length);

    // Update mode based on relationship count
    this._updateMode();
  }

  /**
   * Update the display mode based on current data
   * @private
   */
  _updateMode() {
    const totalEntities = this._getTotalEntityCount();
    const totalRelationships = this._relationships.length;

    if (totalEntities === 0 || totalRelationships === 0) {
      this._mode = GraphMode.EMPTY;
    } else {
      this._mode = GraphMode.READY;
    }
  }

  /**
   * Get the total count of entities
   * @returns {number} Total entity count
   * @private
   */
  _getTotalEntityCount() {
    return (
      this._entities.characters.length +
      this._entities.locations.length +
      this._entities.items.length
    );
  }

  /**
   * Prepare context data for the template
   * @param {object} options - Render options
   * @returns {Promise<object>} Template data
   */
  async _prepareContext(options) {
    // Calculate totals
    const totalEntities = this._getTotalEntityCount();
    const totalRelationships = this._relationships.length;

    // Build entity type options for filter
    const entityTypeOptions = [
      {
        value: EntityType.ALL,
        label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.AllEntities') || 'All'
      },
      {
        value: EntityType.CHARACTER,
        label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.Characters') || 'Characters',
        count: this._entities.characters.length
      },
      {
        value: EntityType.LOCATION,
        label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.Locations') || 'Locations',
        count: this._entities.locations.length
      },
      {
        value: EntityType.ITEM,
        label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.Items') || 'Items',
        count: this._entities.items.length
      }
    ];

    // Build relationship type options for filter
    const relationshipTypeOptions = [
      {
        value: 'all',
        label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.AllRelations') || 'All'
      }
    ];

    // Add each relationship type
    Object.values(RelationshipType).forEach((type) => {
      const count = this._relationships.filter((r) => r.relationType === type).length;
      if (count > 0) {
        relationshipTypeOptions.push({
          value: type,
          label: game.i18n?.localize(`VOXCHRONICLE.RelationshipType.${type}`) || type,
          count: count
        });
      }
    });

    // Build legend items
    const legendItems = Object.entries(this._relationshipColors).map(([type, color]) => ({
      type: type,
      label: game.i18n?.localize(`VOXCHRONICLE.RelationshipType.${type}`) || type,
      color: color
    }));

    return {
      mode: this._mode,
      isReady: this._mode === GraphMode.READY,
      isEmpty: this._mode === GraphMode.EMPTY,
      isError: this._mode === GraphMode.ERROR,
      totalEntities: totalEntities,
      totalRelationships: totalRelationships,
      entityTypeOptions: entityTypeOptions,
      relationshipTypeOptions: relationshipTypeOptions,
      legendItems: legendItems,
      filters: this._filters
    };
  }

  /**
   * Bind non-click event listeners and initialize graph after render
   * @param {object} context - The prepared context
   * @param {object} options - Render options
   */
  _onRender(context, options) {
    this._logger.debug('_onRender called', { mode: this._mode, entities: this._getTotalEntityCount(), relationships: this._relationships.length });
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    // Filter change handlers
    this.element?.querySelectorAll('[data-filter="entity-type"]').forEach(el => {
      el.addEventListener('change', this._onEntityTypeFilterChange.bind(this), { signal });
    });
    this.element?.querySelectorAll('[data-filter="relationship-type"]').forEach(el => {
      el.addEventListener('change', this._onRelationshipTypeFilterChange.bind(this), { signal });
    });

    // Initialize the graph if in ready mode
    if (this._mode === GraphMode.READY) {
      this._initializeGraph().catch(err => {
        this._logger.error('Graph initialization failed:', err);
        this._mode = GraphMode.ERROR;
        this.render();
      });
    }

    this._logger.debug('Listeners activated');
  }

  // ─── Static action handlers (called with `this` = app instance) ────

  static _onRefreshClick(event, target) {
    this._logger.debug('Refresh clicked');

    // Reset filters
    this._filters = {
      entityType: EntityType.ALL,
      relationshipType: 'all'
    };

    // Re-render the application
    this.render();
  }

  static async _onExportClick(event, target) {
    this._logger.debug('Export clicked');

    try {
      // Export graph data as JSON
      const exportData = {
        entities: this._entities,
        relationships: this._relationships,
        exportedAt: new Date().toISOString()
      };

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `relationship-graph-${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);

      ui.notifications?.info(
        game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.ExportSuccess') ||
          'Graph exported successfully'
      );
    } catch (error) {
      this._logger.error('Failed to export graph:', error);
      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.ExportError') ||
          'Failed to export graph'
      );
    }
  }

  static _onCloseClick(event, target) {
    this.close();
  }

  // ─── Instance methods ──────────────────────────────────────────────

  /**
   * Initialize the vis-network graph
   * @private
   */
  async _initializeGraph() {
    try {
      // Destroy previous network instance before re-creating
      if (this._network) {
        this._network.destroy();
        this._network = null;
      }

      // Load vis-network library once via CDN (guarded by static flag)
      if (typeof vis === 'undefined') {
        await this._loadVisLibrary();
      }

      const container = this.element?.querySelector('#relationship-graph-network');
      if (!container) {
        this._logger.error('Graph container not found');
        this._mode = GraphMode.ERROR;
        return;
      }

      // Build nodes and edges
      const { nodes, edges } = this._buildGraphData();

      // Create vis-network datasets
      const data = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
      };

      // Configure graph options
      const graphOptions = {
        nodes: {
          shape: 'dot',
          size: 20,
          font: {
            size: 14,
            color: '#ffffff'
          },
          borderWidth: 2,
          borderWidthSelected: 4
        },
        edges: {
          width: 2,
          arrows: {
            to: {
              enabled: true,
              scaleFactor: 0.5
            }
          },
          smooth: {
            type: 'continuous'
          },
          font: {
            size: 12,
            align: 'middle'
          }
        },
        physics: {
          enabled: true,
          stabilization: {
            iterations: 100
          },
          barnesHut: {
            gravitationalConstant: -2000,
            springConstant: 0.001,
            springLength: 200
          }
        },
        interaction: {
          hover: true,
          tooltipDelay: 100
        }
      };

      // Create the network
      this._network = new vis.Network(container, data, graphOptions);

      // Add event listeners
      this._network.on('click', this._onNodeClick.bind(this));
      this._network.on('doubleClick', this._onNodeDoubleClick.bind(this));

      this._logger.debug('Graph initialized successfully', {
        nodes: nodes.length,
        edges: edges.length
      });
    } catch (error) {
      this._logger.error('Failed to initialize graph:', error);
      this._mode = GraphMode.ERROR;
      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.ErrorInitializing') ||
          'Failed to initialize graph'
      );
    }
  }

  /**
   * Load vis-network library from CDN exactly once.
   * Uses a static promise so concurrent calls share the same load.
   * @returns {Promise<void>}
   * @private
   */
  async _loadVisLibrary() {
    if (typeof vis !== 'undefined') {
      RelationshipGraph.#visLoaded = true;
      return;
    }

    // Share a single load promise across all instances
    if (!RelationshipGraph.#visLoadPromise) {
      this._logger.debug('Loading vis-network library from CDN...');
      RelationshipGraph.#visLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js';
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          RelationshipGraph.#visLoaded = true;
          resolve();
        };
        script.onerror = () => reject(new Error('vis-network library failed to load from CDN'));
        document.head.appendChild(script);
      });
    }

    await RelationshipGraph.#visLoadPromise;
    this._logger.debug('vis-network library loaded');
  }

  /**
   * Build nodes and edges data for the graph
   * @returns {object} Object with nodes and edges arrays
   * @private
   */
  _buildGraphData() {
    const nodes = [];
    const edges = [];
    const entityMap = new Map(); // Map entity name to node id

    let nodeId = 0;

    // Build nodes from entities
    const entityTypes = [
      { key: 'characters', type: EntityType.CHARACTER },
      { key: 'locations', type: EntityType.LOCATION },
      { key: 'items', type: EntityType.ITEM }
    ];

    entityTypes.forEach(({ key, type }) => {
      // Skip if filtered out
      if (this._filters.entityType !== EntityType.ALL && this._filters.entityType !== type) {
        return;
      }

      this._entities[key].forEach((entity) => {
        const name = entity.name || 'Unknown';
        const id = nodeId++;

        // Store mapping for edge creation
        entityMap.set(name.toLowerCase(), id);

        nodes.push({
          id: id,
          label: name,
          title: entity.description || name, // Tooltip
          color: this._entityColors[type],
          group: type
        });
      });
    });

    // Build edges from relationships
    this._relationships.forEach((relationship, index) => {
      // Skip if filtered out
      if (
        this._filters.relationshipType !== 'all' &&
        this._filters.relationshipType !== relationship.relationType
      ) {
        return;
      }

      const sourceId = entityMap.get(relationship.sourceEntity?.toLowerCase());
      const targetId = entityMap.get(relationship.targetEntity?.toLowerCase());

      // Only add edge if both entities exist in the graph
      if (sourceId !== undefined && targetId !== undefined) {
        const relationType = relationship.relationType || RelationshipType.UNKNOWN;
        const color =
          this._relationshipColors[relationType] ||
          this._relationshipColors[RelationshipType.UNKNOWN];

        edges.push({
          id: `edge-${index}`,
          from: sourceId,
          to: targetId,
          label:
            game.i18n?.localize(`VOXCHRONICLE.RelationshipType.${relationType}`) || relationType,
          title: relationship.description || '', // Tooltip
          color: color,
          value: relationship.confidence || 5 // Edge thickness based on confidence
        });
      }
    });

    return { nodes, edges };
  }

  /**
   * Handle entity type filter change
   * @param {Event} event - Change event
   * @private
   */
  _onEntityTypeFilterChange(event) {
    this._filters.entityType = event.target.value;
    this._logger.debug('Entity type filter changed:', this._filters.entityType);
    this._refreshGraph();
  }

  /**
   * Handle relationship type filter change
   * @param {Event} event - Change event
   * @private
   */
  _onRelationshipTypeFilterChange(event) {
    this._filters.relationshipType = event.target.value;
    this._logger.debug('Relationship type filter changed:', this._filters.relationshipType);
    this._refreshGraph();
  }

  /**
   * Refresh the graph with current filters
   * @private
   */
  _refreshGraph() {
    if (!this._network) {
      this._logger.warn('Cannot refresh graph: network not initialized');
      return;
    }

    try {
      // Rebuild graph data with current filters
      const { nodes, edges } = this._buildGraphData();

      // Update the network
      this._network.setData({
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
      });

      // Re-fit the graph
      this._network.fit();

      this._logger.debug('Graph refreshed', { nodes: nodes.length, edges: edges.length });
    } catch (error) {
      this._logger.error('Failed to refresh graph:', error);
      ui.notifications?.error(
        game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.ErrorRefreshing') ||
          'Failed to refresh graph'
      );
    }
  }

  /**
   * Handle node click event
   * @param {object} params - Click event parameters
   * @private
   */
  _onNodeClick(params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      this._logger.debug('Node clicked:', nodeId);

      // Could highlight connected nodes or show entity details
      this._network.selectNodes([nodeId]);
    }
  }

  /**
   * Handle node double-click event
   * @param {object} params - Double-click event parameters
   * @private
   */
  _onNodeDoubleClick(params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      this._logger.debug('Node double-clicked:', nodeId);

      // Could open entity details in a separate dialog
      // For now, just focus on the node
      this._network.focus(nodeId, {
        scale: 1.5,
        animation: {
          duration: 500,
          easingFunction: 'easeInOutQuad'
        }
      });
    }
  }

  /**
   * Clean up when closing the application
   * @param {object} [options] - Close options
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    this._logger.debug('RelationshipGraph closing');
    this.#listenerController?.abort();

    // Destroy the network instance to free resources
    if (this._network) {
      this._network.destroy();
      this._network = null;
      this._logger.debug('Network instance destroyed');
    }

    return super.close(options);
  }

  /**
   * Reset static vis-network load state (for testing only)
   * @static
   */
  static _resetVisLoadState() {
    RelationshipGraph.#visLoaded = false;
    RelationshipGraph.#visLoadPromise = null;
  }
}

// Export the class
export { RelationshipGraph, EntityType, GraphMode };
