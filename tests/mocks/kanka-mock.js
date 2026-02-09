/**
 * Kanka API Mock Utilities
 *
 * Provides mock responses, handlers, and utilities for testing Kanka API
 * interactions including entity CRUD operations, image uploads, rate limiting,
 * and error handling.
 */

import { vi } from 'vitest';

/**
 * Default API endpoints
 */
export const KANKA_ENDPOINTS = {
  JOURNALS: '/journals',
  CHARACTERS: '/characters',
  LOCATIONS: '/locations',
  ITEMS: '/items',
  ORGANISATIONS: '/organisations',
  QUESTS: '/quests',
  ENTITIES: '/entities',
  ENTITY_IMAGE: '/entity/{id}/image'
};

/**
 * Kanka entity types
 */
export const KANKA_ENTITY_TYPES = {
  JOURNAL: 'journal',
  CHARACTER: 'character',
  LOCATION: 'location',
  ITEM: 'item',
  ORGANISATION: 'organisation',
  QUEST: 'quest'
};

/**
 * Create a mock API response for Kanka entities
 *
 * @param {Object|Array} data - Response data (single entity or array)
 * @param {Object} [meta] - Pagination metadata
 * @param {number} [meta.current_page=1] - Current page number
 * @param {number} [meta.last_page=1] - Last page number
 * @param {number} [meta.total] - Total number of entities
 * @returns {Object} Mock Kanka API response
 */
export function createMockKankaResponse(data, meta = {}) {
  const dataArray = Array.isArray(data) ? data : [data];

  return {
    data: Array.isArray(data) ? data : data,
    meta: {
      current_page: meta.current_page || 1,
      last_page: meta.last_page || 1,
      total: meta.total !== undefined ? meta.total : dataArray.length,
      per_page: meta.per_page || 15,
      from: meta.from || (dataArray.length > 0 ? 1 : null),
      to: meta.to || dataArray.length,
      ...meta
    },
    links: meta.links || {
      first: 'https://api.kanka.io/campaigns/123/entities?page=1',
      last: `https://api.kanka.io/campaigns/123/entities?page=${meta.last_page || 1}`,
      prev: null,
      next: null
    }
  };
}

/**
 * Create a mock journal entity
 *
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock journal entity
 */
export function createMockJournal(overrides = {}) {
  return {
    id: 123,
    name: 'Session 1 Chronicle',
    entry: '<p>The party gathered at the tavern...</p>',
    type: 'Session Chronicle',
    date: '2024-01-15',
    is_private: false,
    entity_id: 456,
    tags: [],
    created_at: '2024-01-15T10:00:00.000000Z',
    updated_at: '2024-01-15T10:00:00.000000Z',
    created_by: 1,
    updated_by: 1,
    ...overrides
  };
}

/**
 * Create a mock character entity
 *
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock character entity
 */
export function createMockCharacter(overrides = {}) {
  return {
    id: 789,
    name: 'Grognard the Brave',
    entry: '<p>A fierce warrior from the north...</p>',
    type: 'NPC',
    title: 'Warrior',
    age: '35',
    sex: 'Male',
    pronouns: 'he/him',
    is_dead: false,
    is_private: false,
    entity_id: 101,
    tags: [],
    traits: [],
    created_at: '2024-01-15T10:00:00.000000Z',
    updated_at: '2024-01-15T10:00:00.000000Z',
    created_by: 1,
    updated_by: 1,
    image: null,
    image_full: null,
    image_thumb: null,
    ...overrides
  };
}

/**
 * Create a mock location entity
 *
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock location entity
 */
export function createMockLocation(overrides = {}) {
  return {
    id: 111,
    name: 'The Rusty Dragon Inn',
    entry: '<p>A popular tavern in Sandpoint...</p>',
    type: 'Tavern',
    is_private: false,
    entity_id: 222,
    parent_location_id: null,
    tags: [],
    created_at: '2024-01-15T10:00:00.000000Z',
    updated_at: '2024-01-15T10:00:00.000000Z',
    created_by: 1,
    updated_by: 1,
    image: null,
    image_full: null,
    image_thumb: null,
    ...overrides
  };
}

/**
 * Create a mock item entity
 *
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock item entity
 */
export function createMockItem(overrides = {}) {
  return {
    id: 333,
    name: 'Sword of Flames',
    entry: '<p>A legendary weapon...</p>',
    type: 'Weapon',
    price: '10000 gp',
    size: 'Medium',
    is_private: false,
    entity_id: 444,
    location_id: null,
    character_id: null,
    tags: [],
    created_at: '2024-01-15T10:00:00.000000Z',
    updated_at: '2024-01-15T10:00:00.000000Z',
    created_by: 1,
    updated_by: 1,
    image: null,
    image_full: null,
    image_thumb: null,
    ...overrides
  };
}

/**
 * Create a mock organisation entity
 *
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock organisation entity
 */
export function createMockOrganisation(overrides = {}) {
  return {
    id: 555,
    name: 'The Shadow Guild',
    entry: '<p>A secretive thieves guild...</p>',
    type: 'Guild',
    is_private: false,
    entity_id: 666,
    location_id: null,
    organisation_id: null,
    tags: [],
    members: [],
    created_at: '2024-01-15T10:00:00.000000Z',
    updated_at: '2024-01-15T10:00:00.000000Z',
    created_by: 1,
    updated_by: 1,
    image: null,
    image_full: null,
    image_thumb: null,
    ...overrides
  };
}

/**
 * Create a mock quest entity
 *
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock quest entity
 */
export function createMockQuest(overrides = {}) {
  return {
    id: 777,
    name: 'The Lost Artifact',
    entry: '<p>Find the ancient artifact...</p>',
    type: 'Main Quest',
    is_completed: false,
    is_private: false,
    entity_id: 888,
    character_id: null,
    tags: [],
    quests: [],
    created_at: '2024-01-15T10:00:00.000000Z',
    updated_at: '2024-01-15T10:00:00.000000Z',
    created_by: 1,
    updated_by: 1,
    ...overrides
  };
}

/**
 * Create a mock entity (base entity wrapper)
 *
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock entity
 */
export function createMockEntity(overrides = {}) {
  return {
    id: 999,
    name: 'Test Entity',
    type: 'character',
    child_id: 789,
    is_private: false,
    tags: [],
    created_at: '2024-01-15T10:00:00.000000Z',
    updated_at: '2024-01-15T10:00:00.000000Z',
    created_by: 1,
    updated_by: 1,
    ...overrides
  };
}

/**
 * Create a mock image upload response
 *
 * @param {Object} [overrides] - Fields to override
 * @returns {Object} Mock image upload response
 */
export function createMockImageUploadResponse(overrides = {}) {
  return {
    id: 999,
    name: 'character-image.png',
    ext: 'png',
    size: 102400,
    path: 'https://kanka-user-assets.s3.amazonaws.com/...',
    url: 'https://kanka-user-assets.s3.amazonaws.com/.../character-image.png',
    ...overrides
  };
}

/**
 * Create a mock Kanka error response
 *
 * @param {Object} options - Error options
 * @param {number} [options.status] - HTTP status code
 * @param {string} [options.message] - Error message
 * @param {Object} [options.errors] - Validation errors
 * @returns {Object} Mock error response
 */
export function createMockKankaError(options = {}) {
  const status = options.status || 400;
  const message = options.message || 'The given data was invalid.';

  const errorResponse = {
    message
  };

  if (options.errors) {
    errorResponse.errors = options.errors;
  }

  return errorResponse;
}

/**
 * Create a mock authentication error (401)
 *
 * @returns {Object} Mock authentication error response
 */
export function createMockAuthError() {
  return createMockKankaError({
    status: 401,
    message: 'Unauthenticated. Please check your Kanka API token in settings.'
  });
}

/**
 * Create a mock authorization error (403)
 *
 * @returns {Object} Mock authorization error response
 */
export function createMockAuthorizationError() {
  return createMockKankaError({
    status: 403,
    message: 'This action is unauthorized. You do not have permission to access this resource.'
  });
}

/**
 * Create a mock not found error (404)
 *
 * @param {string} [resource='Resource'] - Resource type that was not found
 * @returns {Object} Mock not found error response
 */
export function createMockNotFoundError(resource = 'Resource') {
  return createMockKankaError({
    status: 404,
    message: `${resource} not found.`
  });
}

/**
 * Create a mock validation error (422)
 *
 * @param {Object} [validationErrors] - Field validation errors
 * @returns {Object} Mock validation error response
 */
export function createMockValidationError(validationErrors = {}) {
  return createMockKankaError({
    status: 422,
    message: 'The given data was invalid.',
    errors: validationErrors || {
      name: ['The name field is required.']
    }
  });
}

/**
 * Create a mock rate limit error (429)
 *
 * @param {number} [retryAfter] - Seconds to wait before retry
 * @returns {Object} Mock rate limit error response with headers
 */
export function createMockRateLimitError(retryAfter = 60) {
  return {
    response: createMockKankaError({
      status: 429,
      message: 'Too Many Requests. Rate limit exceeded.'
    }),
    headers: {
      'retry-after': String(retryAfter),
      'x-ratelimit-limit': '90',
      'x-ratelimit-remaining': '0'
    }
  };
}

/**
 * Create a mock server error (500)
 *
 * @returns {Object} Mock server error response
 */
export function createMockServerError() {
  return createMockKankaError({
    status: 500,
    message: 'Kanka service temporarily unavailable. Please try again later.'
  });
}

/**
 * Create a mock fetch response
 *
 * @param {Object} data - Response data
 * @param {Object} options - Response options
 * @param {boolean} [options.ok=true] - Response ok status
 * @param {number} [options.status=200] - HTTP status code
 * @param {Object} [options.headers] - Response headers
 * @returns {Object} Mock fetch response
 */
export function createMockFetchResponse(data, options = {}) {
  const ok = options.ok !== undefined ? options.ok : true;
  const status = options.status || (ok ? 200 : 400);
  const headers = options.headers || {};

  // Create headers object with has() and get() methods
  const headersObj = {
    has: (key) => headers.hasOwnProperty(key.toLowerCase()),
    get: (key) => headers[key.toLowerCase()] || null,
    forEach: (callback) => {
      Object.entries(headers).forEach(([key, value]) => callback(value, key.toLowerCase()));
    },
    ...headers
  };

  return {
    ok,
    status,
    statusText: ok ? 'OK' : getStatusText(status),
    headers: headersObj,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    blob: () => Promise.resolve(new Blob([JSON.stringify(data)]))
  };
}

/**
 * Get HTTP status text for a status code
 *
 * @param {number} status - HTTP status code
 * @returns {string} Status text
 */
function getStatusText(status) {
  const statusTexts = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error'
  };
  return statusTexts[status] || 'Unknown';
}

/**
 * Create a mock fetch handler for successful journal creation
 *
 * @param {Object} [overrides] - Journal field overrides
 * @returns {Function} Mock fetch function
 */
export function mockJournalCreateSuccess(overrides = {}) {
  const journal = createMockJournal(overrides);
  const response = createMockKankaResponse(journal);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response, { status: 201 }));
}

/**
 * Create a mock fetch handler for successful character creation
 *
 * @param {Object} [overrides] - Character field overrides
 * @returns {Function} Mock fetch function
 */
export function mockCharacterCreateSuccess(overrides = {}) {
  const character = createMockCharacter(overrides);
  const response = createMockKankaResponse(character);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response, { status: 201 }));
}

/**
 * Create a mock fetch handler for successful location creation
 *
 * @param {Object} [overrides] - Location field overrides
 * @returns {Function} Mock fetch function
 */
export function mockLocationCreateSuccess(overrides = {}) {
  const location = createMockLocation(overrides);
  const response = createMockKankaResponse(location);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response, { status: 201 }));
}

/**
 * Create a mock fetch handler for successful item creation
 *
 * @param {Object} [overrides] - Item field overrides
 * @returns {Function} Mock fetch function
 */
export function mockItemCreateSuccess(overrides = {}) {
  const item = createMockItem(overrides);
  const response = createMockKankaResponse(item);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response, { status: 201 }));
}

/**
 * Create a mock fetch handler for successful entity list retrieval
 *
 * @param {Array} entities - Array of entities to return
 * @param {Object} [meta] - Pagination metadata
 * @returns {Function} Mock fetch function
 */
export function mockEntityListSuccess(entities = [], meta = {}) {
  const response = createMockKankaResponse(entities, meta);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response));
}

/**
 * Create a mock fetch handler for successful entity retrieval
 *
 * @param {Object} entity - Entity to return
 * @returns {Function} Mock fetch function
 */
export function mockEntityGetSuccess(entity) {
  const response = createMockKankaResponse(entity);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response));
}

/**
 * Create a mock fetch handler for successful entity update
 *
 * @param {Object} entity - Updated entity
 * @returns {Function} Mock fetch function
 */
export function mockEntityUpdateSuccess(entity) {
  const response = createMockKankaResponse(entity);
  return vi.fn().mockResolvedValue(createMockFetchResponse(response));
}

/**
 * Create a mock fetch handler for successful entity deletion
 *
 * @returns {Function} Mock fetch function
 */
export function mockEntityDeleteSuccess() {
  return vi.fn().mockResolvedValue(createMockFetchResponse({}, { status: 204 }));
}

/**
 * Create a mock fetch handler for successful image upload
 *
 * @param {Object} [overrides] - Image response overrides
 * @returns {Function} Mock fetch function
 */
export function mockImageUploadSuccess(overrides = {}) {
  const imageResponse = createMockImageUploadResponse(overrides);
  return vi.fn().mockResolvedValue(createMockFetchResponse(imageResponse));
}

/**
 * Create a mock fetch handler for authentication error
 *
 * @returns {Function} Mock fetch function
 */
export function mockAuthenticationError() {
  const errorResponse = createMockAuthError();
  return vi
    .fn()
    .mockResolvedValue(createMockFetchResponse(errorResponse, { ok: false, status: 401 }));
}

/**
 * Create a mock fetch handler for authorization error
 *
 * @returns {Function} Mock fetch function
 */
export function mockAuthorizationError() {
  const errorResponse = createMockAuthorizationError();
  return vi
    .fn()
    .mockResolvedValue(createMockFetchResponse(errorResponse, { ok: false, status: 403 }));
}

/**
 * Create a mock fetch handler for not found error
 *
 * @param {string} [resource] - Resource type that was not found
 * @returns {Function} Mock fetch function
 */
export function mockNotFoundError(resource) {
  const errorResponse = createMockNotFoundError(resource);
  return vi
    .fn()
    .mockResolvedValue(createMockFetchResponse(errorResponse, { ok: false, status: 404 }));
}

/**
 * Create a mock fetch handler for validation error
 *
 * @param {Object} [validationErrors] - Field validation errors
 * @returns {Function} Mock fetch function
 */
export function mockValidationError(validationErrors) {
  const errorResponse = createMockValidationError(validationErrors);
  return vi
    .fn()
    .mockResolvedValue(createMockFetchResponse(errorResponse, { ok: false, status: 422 }));
}

/**
 * Create a mock fetch handler for rate limit error
 *
 * @param {number} [retryAfter=60] - Seconds to wait before retry
 * @returns {Function} Mock fetch function
 */
export function mockRateLimitError(retryAfter = 60) {
  const { response, headers } = createMockRateLimitError(retryAfter);
  return vi.fn().mockResolvedValue(
    createMockFetchResponse(response, {
      ok: false,
      status: 429,
      headers
    })
  );
}

/**
 * Create a mock fetch handler for server error
 *
 * @returns {Function} Mock fetch function
 */
export function mockServerError() {
  const errorResponse = createMockServerError();
  return vi
    .fn()
    .mockResolvedValue(createMockFetchResponse(errorResponse, { ok: false, status: 500 }));
}

/**
 * Create a mock fetch handler for network error
 *
 * @returns {Function} Mock fetch function
 */
export function mockNetworkError() {
  return vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
}

/**
 * Create a mock fetch handler that succeeds after N retries
 *
 * @param {number} failCount - Number of times to fail before succeeding
 * @param {Object} successEntity - Entity to return on success
 * @returns {Function} Mock fetch function
 */
export function mockSuccessAfterRetries(failCount, successEntity) {
  let attemptCount = 0;
  const errorResponse = createMockServerError();
  const response = createMockKankaResponse(successEntity);

  return vi.fn().mockImplementation(() => {
    attemptCount++;
    if (attemptCount <= failCount) {
      return Promise.resolve(createMockFetchResponse(errorResponse, { ok: false, status: 500 }));
    }
    return Promise.resolve(createMockFetchResponse(response));
  });
}

/**
 * Create a mock fetch handler that routes to different responses based on endpoint
 *
 * @param {Object} routes - Map of endpoint patterns to mock responses or handlers
 * @returns {Function} Mock fetch function
 */
export function mockFetchRouter(routes) {
  return vi.fn().mockImplementation((url, options = {}) => {
    const method = options.method || 'GET';

    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.includes(pattern)) {
        if (typeof handler === 'function') {
          return handler(url, options);
        }

        // If handler is an object with method-specific responses
        if (typeof handler === 'object' && handler[method]) {
          const methodHandler = handler[method];
          if (typeof methodHandler === 'function') {
            return methodHandler(url, options);
          }
          return Promise.resolve(createMockFetchResponse(methodHandler));
        }

        return Promise.resolve(createMockFetchResponse(handler));
      }
    }

    // Default: 404
    return Promise.resolve(
      createMockFetchResponse(createMockNotFoundError('Resource'), { ok: false, status: 404 })
    );
  });
}

/**
 * Extract JSON body from a fetch call
 *
 * @param {Array} fetchCallArgs - Arguments from fetch mock call (url, options)
 * @returns {Object|null} Parsed JSON if present, null otherwise
 */
export function extractJsonFromCall(fetchCallArgs) {
  const [, options] = fetchCallArgs;
  if (options && typeof options.body === 'string') {
    try {
      return JSON.parse(options.body);
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Extract FormData from a fetch call
 *
 * @param {Array} fetchCallArgs - Arguments from fetch mock call (url, options)
 * @returns {FormData|null} FormData if present, null otherwise
 */
export function extractFormDataFromCall(fetchCallArgs) {
  const [, options] = fetchCallArgs;
  if (options && options.body instanceof FormData) {
    return options.body;
  }
  return null;
}

/**
 * Verify that JSON body contains expected fields
 *
 * @param {Object} jsonBody - JSON body to verify
 * @param {Object} expectedFields - Map of field names to expected values/validators
 * @returns {boolean} True if all fields match
 */
export function verifyJsonBody(jsonBody, expectedFields) {
  for (const [key, expected] of Object.entries(expectedFields)) {
    const actual = jsonBody[key];

    if (typeof expected === 'function') {
      if (!expected(actual)) {
        return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

/**
 * Create a paginated set of entities for testing
 *
 * @param {Function} entityFactory - Function to create a single entity
 * @param {number} total - Total number of entities
 * @param {number} perPage - Entities per page
 * @param {number} currentPage - Current page number
 * @returns {Object} Paginated response
 */
export function createPaginatedResponse(entityFactory, total, perPage = 15, currentPage = 1) {
  const totalPages = Math.ceil(total / perPage);
  const start = (currentPage - 1) * perPage;
  const end = Math.min(start + perPage, total);

  const entities = [];
  for (let i = start; i < end; i++) {
    entities.push(entityFactory({ id: i + 1, name: `Entity ${i + 1}` }));
  }

  return createMockKankaResponse(entities, {
    current_page: currentPage,
    last_page: totalPages,
    total,
    per_page: perPage,
    from: start + 1,
    to: end
  });
}

/**
 * Mock implementation of Kanka client for testing
 * Provides a complete mock that can be used in place of the real client
 */
export class MockKankaClient {
  constructor(apiToken = 'test-token-12345', campaignId = 'campaign-123') {
    this._apiToken = apiToken;
    this._campaignId = campaignId;
    this.entities = new Map();
    this.nextId = 1000;
    this.shouldFail = false;
    this.errorToThrow = null;
    this.callLog = [];
  }

  get isConfigured() {
    return Boolean(this._apiToken && this._campaignId);
  }

  /**
   * Configure the mock to fail with a specific error
   */
  setError(error) {
    this.shouldFail = true;
    this.errorToThrow = error;
  }

  /**
   * Mock request method
   */
  async request(endpoint, options = {}) {
    this.callLog.push({ endpoint, options });

    if (this.shouldFail) {
      throw this.errorToThrow;
    }

    const method = options.method || 'GET';

    // Simulate CRUD operations
    if (method === 'POST') {
      return this._handleCreate(endpoint, options);
    } else if (method === 'GET') {
      return this._handleRead(endpoint, options);
    } else if (method === 'PATCH' || method === 'PUT') {
      return this._handleUpdate(endpoint, options);
    } else if (method === 'DELETE') {
      return this._handleDelete(endpoint, options);
    }

    throw new Error(`Unmocked method: ${method}`);
  }

  /**
   * Handle create operation
   */
  _handleCreate(endpoint, options) {
    const id = this.nextId++;
    const body = JSON.parse(options.body || '{}');

    const entity = {
      id,
      entity_id: id + 1000,
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.entities.set(id, entity);
    return createMockKankaResponse(entity);
  }

  /**
   * Handle read operation
   */
  _handleRead(endpoint, options) {
    // List entities
    if (!endpoint.match(/\/\d+$/)) {
      const entities = Array.from(this.entities.values());
      return createMockKankaResponse(entities);
    }

    // Get single entity
    const idMatch = endpoint.match(/\/(\d+)$/);
    if (idMatch) {
      const id = parseInt(idMatch[1]);
      const entity = this.entities.get(id);
      if (!entity) {
        throw new Error('Entity not found');
      }
      return createMockKankaResponse(entity);
    }

    return createMockKankaResponse([]);
  }

  /**
   * Handle update operation
   */
  _handleUpdate(endpoint, options) {
    const idMatch = endpoint.match(/\/(\d+)$/);
    if (!idMatch) {
      throw new Error('Invalid endpoint for update');
    }

    const id = parseInt(idMatch[1]);
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error('Entity not found');
    }

    const body = JSON.parse(options.body || '{}');
    const updated = {
      ...entity,
      ...body,
      updated_at: new Date().toISOString()
    };

    this.entities.set(id, updated);
    return createMockKankaResponse(updated);
  }

  /**
   * Handle delete operation
   */
  _handleDelete(endpoint, options) {
    const idMatch = endpoint.match(/\/(\d+)$/);
    if (!idMatch) {
      throw new Error('Invalid endpoint for delete');
    }

    const id = parseInt(idMatch[1]);
    this.entities.delete(id);
    return {};
  }

  /**
   * Reset the mock state
   */
  reset() {
    this.entities.clear();
    this.nextId = 1000;
    this.shouldFail = false;
    this.errorToThrow = null;
    this.callLog = [];
  }

  /**
   * Get call history
   */
  getCallLog() {
    return this.callLog;
  }

  /**
   * Seed the mock with test data
   */
  seed(entities) {
    entities.forEach((entity) => {
      this.entities.set(entity.id, entity);
    });
  }
}
