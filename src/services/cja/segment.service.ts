import axios, { AxiosInstance, AxiosError } from 'axios';
import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { retryWithBackoff, handleRateLimit } from '@/utils/api-helpers';
import type {
  CJASegment,
  CJASegmentDefinition,
  CJAFilter,
  CJAFilterDefinition,
  CJAApiResponse,
} from '@/types';

const logger = createLogger('CJASegmentService');

// ============================================================================
// Types
// ============================================================================

export interface CJAClientOptions {
  accessToken: string;
  clientId: string;
  orgId: string;
  sandboxName?: string;
}

interface SegmentListResponse {
  content: CJASegment[];
  totalElements: number;
  totalPages: number;
  page?: {
    number: number;
    size: number;
  };
}

interface FilterListResponse {
  content: CJAFilter[];
  totalElements: number;
  totalPages: number;
  page?: {
    number: number;
    size: number;
  };
}

interface CreateSegmentPayload {
  name: string;
  description?: string;
  definition: CJASegmentDefinition;
  dataId?: string; // Data view ID
  rsid?: string;
  tags?: string[];
}

interface CreateFilterPayload {
  name: string;
  description?: string;
  definition: CJAFilterDefinition;
  dataId?: string;
  tags?: string[];
}

interface ValidationResult {
  valid: boolean;
  message?: string;
  errors?: string[];
}

// ============================================================================
// CJA Segment/Filter Service
// ============================================================================

export class CJASegmentService {
  private client: AxiosInstance;
  private options: CJAClientOptions;

  constructor(options: CJAClientOptions) {
    this.options = options;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.accessToken}`,
      'x-api-key': options.clientId,
      'x-gw-ims-org-id': options.orgId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    // CJA is organization-level, DO NOT add sandbox header

    this.client = axios.create({
      baseURL: config.adobe.cjaUrl,
      headers,
      timeout: 60000,
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          await handleRateLimit(retryAfter as string);
          return this.client.request(error.config!);
        }
        throw error;
      }
    );
  }

  // ==========================================================================
  // Protected HTTP Methods
  // ==========================================================================

  private async get<T>(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    return retryWithBackoff(
      async () => {
        const response = await this.client.get<T>(endpoint, { params });
        return response.data;
      },
      {
        onRetry: (attempt, error) => {
          logger.warn(`GET ${endpoint} retry attempt ${attempt}`, {
            error: error.message,
          });
        },
      }
    );
  }

  private async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return retryWithBackoff(
      async () => {
        try {
          const response = await this.client.post<T>(endpoint, data);
          return response.data;
        } catch (error: any) {
          if (error.response) {
            logger.error(`POST ${endpoint} failed`, {
              status: error.response.status,
              statusText: error.response.statusText,
              data: JSON.stringify(error.response.data),
            });
          }
          throw error;
        }
      },
      {
        onRetry: (attempt, error: any) => {
          logger.warn(`POST ${endpoint} retry attempt ${attempt}`, {
            error: error.response?.data?.message || error.message,
          });
        },
      }
    );
  }

  private async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return retryWithBackoff(
      async () => {
        const response = await this.client.put<T>(endpoint, data);
        return response.data;
      },
      {
        onRetry: (attempt, error) => {
          logger.warn(`PUT ${endpoint} retry attempt ${attempt}`, {
            error: error.message,
          });
        },
      }
    );
  }

  private async delete<T>(endpoint: string): Promise<T> {
    return retryWithBackoff(
      async () => {
        const response = await this.client.delete<T>(endpoint);
        return response.data;
      },
      {
        onRetry: (attempt, error) => {
          logger.warn(`DELETE ${endpoint} retry attempt ${attempt}`, {
            error: error.message,
          });
        },
      }
    );
  }

  // ==========================================================================
  // Segments API
  // ==========================================================================

  /**
   * List all segments
   */
  async listSegments(params?: {
    limit?: number;
    page?: number;
    rsids?: string;
    expansion?: string;
  }): Promise<CJASegment[]> {
    logger.info('Fetching CJA segments');

    const allSegments: CJASegment[] = [];
    let page = params?.page || 0;
    const limit = params?.limit || 100;
    let hasMore = true;

    while (hasMore) {
      const queryParams: Record<string, unknown> = {
        limit,
        page,
        expansion: params?.expansion || 'definition,tags,compatibility',
        includeType: 'all', // Include all types (shared, private, etc.)
      };

      if (params?.rsids) {
        queryParams.rsids = params.rsids;
      }

      const response = await this.get<SegmentListResponse>(
        adobeEndpoints.cja.segments,
        queryParams
      );

      if (response.content && response.content.length > 0) {
        allSegments.push(...response.content);
        page++;
        hasMore = response.content.length === limit;
      } else {
        hasMore = false;
      }
    }

    logger.info(`Found ${allSegments.length} CJA segments`);
    return allSegments;
  }

  /**
   * Get a single segment by ID
   */
  async getSegment(segmentId: string, expansion?: string): Promise<CJASegment> {
    logger.debug('Fetching CJA segment', { segmentId });

    const endpoint = adobeEndpoints.cja.segmentById.replace(
      '{segmentId}',
      segmentId
    );

    return this.get<CJASegment>(endpoint, {
      expansion: expansion || 'definition,tags,compatibility',
    });
  }

  /**
   * Create a new segment
   */
  async createSegment(payload: CreateSegmentPayload): Promise<CJASegment> {
    logger.info('Creating CJA segment', { name: payload.name });

    const response = await this.post<CJASegment>(
      adobeEndpoints.cja.segments,
      payload
    );

    logger.info('CJA segment created successfully', { id: response.id });
    return response;
  }

  /**
   * Update an existing segment
   */
  async updateSegment(
    segmentId: string,
    payload: Partial<CreateSegmentPayload>
  ): Promise<CJASegment> {
    logger.info('Updating CJA segment', { segmentId });

    const endpoint = adobeEndpoints.cja.segmentById.replace(
      '{segmentId}',
      segmentId
    );

    return this.put<CJASegment>(endpoint, payload);
  }

  /**
   * Delete a segment
   */
  async deleteSegment(segmentId: string): Promise<void> {
    logger.info('Deleting CJA segment', { segmentId });

    const endpoint = adobeEndpoints.cja.segmentById.replace(
      '{segmentId}',
      segmentId
    );

    await this.delete<void>(endpoint);
    logger.info('CJA segment deleted successfully', { segmentId });
  }

  /**
   * Validate a segment definition
   */
  async validateSegment(payload: CreateSegmentPayload): Promise<ValidationResult> {
    logger.info('Validating CJA segment', { name: payload.name });

    try {
      const response = await this.post<{ valid: boolean; message?: string }>(
        adobeEndpoints.cja.segmentValidate,
        payload
      );
      return { valid: response.valid, message: response.message };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Validation failed';
      return { valid: false, message: errorMessage };
    }
  }

  /**
   * Bulk get segments by IDs
   */
  async bulkGetSegments(segmentIds: string[]): Promise<CJASegment[]> {
    logger.info('Bulk fetching CJA segments', { count: segmentIds.length });

    const response = await this.post<{ results: Record<string, CJASegment> }>(
      adobeEndpoints.cja.segmentsBulkGet,
      { ids: segmentIds.map((id) => ({ id })) }
    );

    return Object.values(response.results || {});
  }

  /**
   * Find segment by name
   */
  async findSegmentByName(
    name: string,
    dataviewId?: string
  ): Promise<CJASegment | null> {
    const segments = await this.listSegments({
      rsids: dataviewId,
    });
    return segments.find((s) => s.name === name) || null;
  }

  /**
   * Copy a segment from source to target
   */
  async copySegment(
    sourceSegment: CJASegment,
    targetDataviewId?: string,
    componentMapping?: Map<string, string>
  ): Promise<CJASegment> {
    logger.info('Copying CJA segment', { name: sourceSegment.name });

    // Transform the definition if component mapping is provided
    let transformedDefinition = sourceSegment.definition;
    if (componentMapping && componentMapping.size > 0) {
      transformedDefinition = this.transformSegmentDefinition(
        sourceSegment.definition,
        componentMapping
      );
    }

    const payload: CreateSegmentPayload = {
      name: sourceSegment.name,
      description: sourceSegment.description,
      definition: transformedDefinition,
      dataId: targetDataviewId || sourceSegment.dataId,
      tags: sourceSegment.tags,
    };

    return this.createSegment(payload);
  }

  /**
   * Transform segment definition with component mappings
   */
  private transformSegmentDefinition(
    definition: CJASegmentDefinition,
    componentMapping: Map<string, string>
  ): CJASegmentDefinition {
    // Deep clone the definition
    const transformed = JSON.parse(JSON.stringify(definition));

    // Recursively transform component references
    this.transformPredicate(transformed.container?.pred, componentMapping);

    return transformed;
  }

  /**
   * Recursively transform predicates in segment definition
   */
  private transformPredicate(
    pred: any,
    componentMapping: Map<string, string>
  ): void {
    if (!pred) return;

    // Transform metric/dimension references
    if (pred.evt?.name) {
      const mappedName = componentMapping.get(pred.evt.name);
      if (mappedName) {
        pred.evt.name = mappedName;
      }
    }

    // Recursively transform nested predicates
    if (pred.preds && Array.isArray(pred.preds)) {
      pred.preds.forEach((p: any) =>
        this.transformPredicate(p, componentMapping)
      );
    }
  }

  // ==========================================================================
  // Filters API (Older API, but still supported)
  // ==========================================================================

  /**
   * List all filters
   */
  async listFilters(params?: {
    limit?: number;
    page?: number;
    expansion?: string;
  }): Promise<CJAFilter[]> {
    logger.info('Fetching CJA filters');

    const allFilters: CJAFilter[] = [];
    let page = params?.page || 0;
    const limit = params?.limit || 100;
    let hasMore = true;

    while (hasMore) {
      const queryParams: Record<string, unknown> = {
        limit,
        page,
        expansion: params?.expansion || 'definition,tags,compatibility',
        includeType: 'all', // Include all types (shared, private, etc.)
      };

      const response = await this.get<FilterListResponse>(
        adobeEndpoints.cja.filters,
        queryParams
      );

      if (response.content && response.content.length > 0) {
        allFilters.push(...response.content);
        page++;
        hasMore = response.content.length === limit;
      } else {
        hasMore = false;
      }
    }

    logger.info(`Found ${allFilters.length} CJA filters`);
    return allFilters;
  }

  /**
   * Get a single filter by ID
   */
  async getFilter(filterId: string, expansion?: string): Promise<CJAFilter> {
    logger.debug('Fetching CJA filter', { filterId });

    const endpoint = adobeEndpoints.cja.filterById.replace(
      '{filterId}',
      filterId
    );

    return this.get<CJAFilter>(endpoint, {
      expansion: expansion || 'definition,tags,compatibility',
    });
  }

  /**
   * Create a new filter
   */
  async createFilter(payload: CreateFilterPayload): Promise<CJAFilter> {
    logger.info('Creating CJA filter', { name: payload.name });

    const response = await this.post<CJAFilter>(
      adobeEndpoints.cja.filters,
      payload
    );

    logger.info('CJA filter created successfully', { id: response.id });
    return response;
  }

  /**
   * Update an existing filter
   */
  async updateFilter(
    filterId: string,
    payload: Partial<CreateFilterPayload>
  ): Promise<CJAFilter> {
    logger.info('Updating CJA filter', { filterId });

    const endpoint = adobeEndpoints.cja.filterById.replace(
      '{filterId}',
      filterId
    );

    return this.put<CJAFilter>(endpoint, payload);
  }

  /**
   * Delete a filter
   */
  async deleteFilter(filterId: string): Promise<void> {
    logger.info('Deleting CJA filter', { filterId });

    const endpoint = adobeEndpoints.cja.filterById.replace(
      '{filterId}',
      filterId
    );

    await this.delete<void>(endpoint);
    logger.info('CJA filter deleted successfully', { filterId });
  }

  /**
   * Validate a filter definition
   */
  async validateFilter(payload: CreateFilterPayload): Promise<ValidationResult> {
    logger.info('Validating CJA filter', { name: payload.name });

    try {
      const response = await this.post<{ valid: boolean; message?: string }>(
        adobeEndpoints.cja.filterValidate,
        payload
      );
      return { valid: response.valid, message: response.message };
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || error.message || 'Validation failed';
      return { valid: false, message: errorMessage };
    }
  }

  /**
   * Find filter by name
   */
  async findFilterByName(name: string): Promise<CJAFilter | null> {
    const filters = await this.listFilters();
    return filters.find((f) => f.name === name) || null;
  }

  /**
   * Copy a filter from source to target
   */
  async copyFilter(
    sourceFilter: CJAFilter,
    targetDataviewId?: string,
    componentMapping?: Map<string, string>
  ): Promise<CJAFilter> {
    logger.info('Copying CJA filter', { name: sourceFilter.name });

    // Transform the definition if component mapping is provided
    let transformedDefinition = sourceFilter.definition;
    if (componentMapping && componentMapping.size > 0) {
      transformedDefinition = this.transformFilterDefinition(
        sourceFilter.definition,
        componentMapping
      ) as CJAFilterDefinition;
    }

    const payload: CreateFilterPayload = {
      name: sourceFilter.name,
      description: sourceFilter.description,
      definition: transformedDefinition,
      dataId: targetDataviewId || sourceFilter.dataId,
      tags: sourceFilter.tags,
    };

    return this.createFilter(payload);
  }

  /**
   * Transform filter definition with component mappings
   */
  private transformFilterDefinition(
    definition: CJAFilterDefinition,
    componentMapping: Map<string, string>
  ): CJAFilterDefinition {
    // Deep clone the definition
    const transformed = JSON.parse(JSON.stringify(definition));

    // Recursively transform component references
    this.transformPredicate(transformed.container?.pred, componentMapping);

    return transformed;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCJASegmentService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName?: string
): CJASegmentService {
  return new CJASegmentService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
