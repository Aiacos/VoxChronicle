/**
 * RelationshipGraph - UI Component for Visualizing Entity Relationships
 *
 * A Foundry VTT Application that displays entities and their relationships
 * as an interactive network graph using vis-network library. Allows filtering
 * by entity type and relationship type.
 *
 * @class RelationshipGraph
 * @extends Application
 * @module vox-chronicle
 */

import { MODULE_ID } from '../main.mjs';
import { Logger } from '../utils/Logger.mjs';
import { RelationshipType } from '../ai/EntityExtractor.mjs';

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
class RelationshipGraph extends Application {
  /**
   * Logger instance for this class
   * @type {Object}
   * @private
   */
  _logger = Logger.createChild('RelationshipGraph');

  /**
   * Entities to display in the graph
   * @type {Object}
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
   * @type {Object|null}
   * @private
   */
  _network = null;

  /**
   * Current filter settings
   * @type {Object}
   * @private
   */
  _filters = {
    entityType: EntityType.ALL,
    relationshipType: 'all'
  };

  /**
   * Color mapping for entity types
   * @type {Object}
   * @private
   */
  _entityColors = {
    [EntityType.CHARACTER]: '#4A90E2',
    [EntityType.LOCATION]: '#50C878',
    [EntityType.ITEM]: '#F5A623'
  };

  /**
   * Color mapping for relationship types
   * @type {Object}
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

  /**
   * Get default options for the Application
   * @returns {Object} Default application options
   * @static
   */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'vox-chronicle-relationship-graph',
      title: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.Title') || 'Relationship Graph',
      template: `modules/${MODULE_ID}/templates/relationship-graph.hbs`,
      classes: ['vox-chronicle', 'relationship-graph'],
      width: 800,
      height: 600,
      minimizable: true,
      resizable: true,
      popOut: true
    });
  }

  /**
   * Create a new RelationshipGraph instance
   * @param {Object} [options] - Application options
   * @param {Object} [options.entities] - Entities to display
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
   * @param {Object} entities - Entities object
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
   * Get data for rendering the template
   * @returns {Object} Template data
   */
  getData() {
    const data = super.getData();

    // Calculate totals
    const totalEntities = this._getTotalEntityCount();
    const totalRelationships = this._relationships.length;

    // Build entity type options for filter
    const entityTypeOptions = [
      { value: EntityType.ALL, label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.AllEntities') || 'All' },
      { value: EntityType.CHARACTER, label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.Characters') || 'Characters', count: this._entities.characters.length },
      { value: EntityType.LOCATION, label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.Locations') || 'Locations', count: this._entities.locations.length },
      { value: EntityType.ITEM, label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.Items') || 'Items', count: this._entities.items.length }
    ];

    // Build relationship type options for filter
    const relationshipTypeOptions = [
      { value: 'all', label: game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.AllRelations') || 'All' }
    ];

    // Add each relationship type
    Object.values(RelationshipType).forEach(type => {
      const count = this._relationships.filter(r => r.relationType === type).length;
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

    return foundry.utils.mergeObject(data, {
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
    });
  }

  /**
   * Activate event listeners after rendering
   * @param {jQuery} html - The rendered HTML
   */
  activateListeners(html) {
    super.activateListeners(html);

    // Filter change handlers
    html.find('[data-filter="entity-type"]').on('change', this._onEntityTypeFilterChange.bind(this));
    html.find('[data-filter="relationship-type"]').on('change', this._onRelationshipTypeFilterChange.bind(this));

    // Button handlers
    html.find('[data-action="refresh"]').on('click', this._onRefreshClick.bind(this));
    html.find('[data-action="export"]').on('click', this._onExportClick.bind(this));
    html.find('[data-action="close"]').on('click', this._onCloseClick.bind(this));

    // Initialize the graph if in ready mode
    if (this._mode === GraphMode.READY) {
      this._initializeGraph(html);
    }

    this._logger.debug('Listeners activated');
  }

  /**
   * Initialize the vis-network graph
   * @param {jQuery} html - The rendered HTML
   * @private
   */
  async _initializeGraph(html) {
    try {
      // Wait for vis-network library to load (will be loaded via CDN in template)
      if (typeof vis === 'undefined') {
        this._logger.warn('vis-network library not loaded yet, waiting...');
        await this._waitForVisLibrary();
      }

      const container = html.find('#relationship-graph-network')[0];
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
      const options = {
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
      this._network = new vis.Network(container, data, options);

      // Add event listeners
      this._network.on('click', this._onNodeClick.bind(this));
      this._network.on('doubleClick', this._onNodeDoubleClick.bind(this));

      this._logger.debug('Graph initialized successfully', { nodes: nodes.length, edges: edges.length });

    } catch (error) {
      this._logger.error('Failed to initialize graph:', error);
      this._mode = GraphMode.ERROR;
      ui.notifications?.error(game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.ErrorInitializing') || 'Failed to initialize graph');
    }
  }

  /**
   * Wait for vis-network library to be loaded
   * @returns {Promise<void>}
   * @private
   */
  async _waitForVisLibrary() {
    const maxWaitTime = 5000; // 5 seconds
    const checkInterval = 100; // 100ms
    let waited = 0;

    while (typeof vis === 'undefined' && waited < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (typeof vis === 'undefined') {
      throw new Error('vis-network library failed to load');
    }
  }

  /**
   * Build nodes and edges data for the graph
   * @returns {Object} Object with nodes and edges arrays
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

      this._entities[key].forEach(entity => {
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
      if (this._filters.relationshipType !== 'all' && this._filters.relationshipType !== relationship.relationType) {
        return;
      }

      const sourceId = entityMap.get(relationship.sourceEntity?.toLowerCase());
      const targetId = entityMap.get(relationship.targetEntity?.toLowerCase());

      // Only add edge if both entities exist in the graph
      if (sourceId !== undefined && targetId !== undefined) {
        const relationType = relationship.relationType || RelationshipType.UNKNOWN;
        const color = this._relationshipColors[relationType] || this._relationshipColors[RelationshipType.UNKNOWN];

        edges.push({
          id: `edge-${index}`,
          from: sourceId,
          to: targetId,
          label: game.i18n?.localize(`VOXCHRONICLE.RelationshipType.${relationType}`) || relationType,
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
      ui.notifications?.error(game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.ErrorRefreshing') || 'Failed to refresh graph');
    }
  }

  /**
   * Handle refresh button click
   * @param {Event} event - Click event
   * @private
   */
  _onRefreshClick(event) {
    event.preventDefault();
    this._logger.debug('Refresh clicked');

    // Reset filters
    this._filters = {
      entityType: EntityType.ALL,
      relationshipType: 'all'
    };

    // Re-render the application
    this.render(true);
  }

  /**
   * Handle export button click
   * @param {Event} event - Click event
   * @private
   */
  async _onExportClick(event) {
    event.preventDefault();
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

      ui.notifications?.info(game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.ExportSuccess') || 'Graph exported successfully');

    } catch (error) {
      this._logger.error('Failed to export graph:', error);
      ui.notifications?.error(game.i18n?.localize('VOXCHRONICLE.RelationshipGraph.ExportError') || 'Failed to export graph');
    }
  }

  /**
   * Handle close button click
   * @param {Event} event - Click event
   * @private
   */
  _onCloseClick(event) {
    event.preventDefault();
    this.close();
  }

  /**
   * Handle node click event
   * @param {Object} params - Click event parameters
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
   * @param {Object} params - Double-click event parameters
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
   * @param {Object} [options] - Close options
   * @returns {Promise<void>}
   */
  async close(options = {}) {
    // Destroy the network instance to free resources
    if (this._network) {
      this._network.destroy();
      this._network = null;
      this._logger.debug('Network instance destroyed');
    }

    return super.close(options);
  }
}

// Export the class
export { RelationshipGraph, EntityType, GraphMode };
