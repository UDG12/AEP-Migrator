import axios, { AxiosInstance, AxiosError } from 'axios';
import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { retryWithBackoff, handleRateLimit } from '@/utils/api-helpers';
import type {
  CJADataView,
  CJADataViewComponent,
  CJASessionDefinition,
  CJADerivedField,
  CJAApiResponse,
} from '@/types';

const logger = createLogger('CJADataViewService');

// ============================================================================
// Types
// ============================================================================

export interface CJAClientOptions {
  accessToken: string;
  clientId: string;
  orgId: string;
  sandboxName?: string;
}

interface DataViewListResponse {
  content: CJADataView[];
  totalElements: number;
  totalPages: number;
  page: {
    number: number;
    size: number;
  };
}

interface DimensionListResponse {
  content: CJADataViewComponent[];
  totalElements?: number;
}

interface MetricListResponse {
  content: CJADataViewComponent[];
  totalElements?: number;
}

interface CreateDataViewPayload {
  name: string;
  description?: string;
  parentDataGroupId: string; // Connection ID
  timezoneDesignator?: string;
  currentTimezoneOffset?: number;
  sessionDefinition?: CJASessionDefinition;
  components?: CreateComponentPayload[];
  externalData?: {
    externalId?: string;
  };
}

interface CreateComponentPayload {
  componentId: string;
  componentType: 'dimension' | 'metric';
  name: string;
  description?: string;
  schemaPath?: string;
  attribution?: any;
  persistence?: any;
  includeExcludeSetting?: any;
  format?: any;
  bucketing?: any;
  noValueOptionsSetting?: any;
  deduplication?: any;
  contextLabels?: string[];
  hidden?: boolean;
  derivedFieldId?: string;
}

// ============================================================================
// CJA Data View Service
// ============================================================================

export class CJADataViewService {
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
  // Data Views API
  // ==========================================================================

  /**
   * List all data views
   */
  async listDataViews(params?: {
    limit?: number;
    page?: number;
    expansion?: string;
  }): Promise<CJADataView[]> {
    logger.info('Fetching CJA data views');

    const allDataViews: CJADataView[] = [];
    let page = params?.page || 0;
    const limit = params?.limit || 100;
    let hasMore = true;

    while (hasMore) {
      const queryParams: Record<string, unknown> = {
        limit,
        page,
        expansion:
          params?.expansion ||
          'name,description,owner,parentDataGroupId,timezoneDesignator,sessionDefinition,organization,externalData',
      };

      const response = await this.get<DataViewListResponse>(
        adobeEndpoints.cja.dataviews,
        queryParams
      );

      if (response.content && response.content.length > 0) {
        allDataViews.push(...response.content);
        page++;
        hasMore = response.content.length === limit;
      } else {
        hasMore = false;
      }
    }

    logger.info(`Found ${allDataViews.length} CJA data views`);
    return allDataViews;
  }

  /**
   * Get a single data view by ID with full details
   */
  async getDataView(dataviewId: string, expansion?: string): Promise<CJADataView> {
    logger.debug('Fetching CJA data view', { dataviewId });

    const endpoint = adobeEndpoints.cja.dataviewById.replace(
      '{dataviewId}',
      dataviewId
    );

    return this.get<CJADataView>(endpoint, {
      expansion:
        expansion ||
        'name,description,owner,parentDataGroupId,timezoneDesignator,currentTimezoneOffset,sessionDefinition,organization,externalData',
    });
  }

  /**
   * Create a new data view
   */
  async createDataView(payload: CreateDataViewPayload): Promise<CJADataView> {
    logger.info('Creating CJA data view', { name: payload.name });

    const response = await this.post<CJADataView>(
      adobeEndpoints.cja.dataviews,
      payload
    );

    logger.info('CJA data view created successfully', { id: response.id });
    return response;
  }

  /**
   * Update an existing data view
   */
  async updateDataView(
    dataviewId: string,
    payload: Partial<CreateDataViewPayload>
  ): Promise<CJADataView> {
    logger.info('Updating CJA data view', { dataviewId });

    const endpoint = adobeEndpoints.cja.dataviewById.replace(
      '{dataviewId}',
      dataviewId
    );

    return this.put<CJADataView>(endpoint, payload);
  }

  /**
   * Delete a data view
   */
  async deleteDataView(dataviewId: string): Promise<void> {
    logger.info('Deleting CJA data view', { dataviewId });

    const endpoint = adobeEndpoints.cja.dataviewById.replace(
      '{dataviewId}',
      dataviewId
    );

    await this.delete<void>(endpoint);
    logger.info('CJA data view deleted successfully', { dataviewId });
  }

  /**
   * Copy a data view
   */
  async copyDataView(dataviewId: string): Promise<CJADataView> {
    logger.info('Copying CJA data view', { dataviewId });

    const endpoint = adobeEndpoints.cja.dataviewCopy.replace(
      '{dataviewId}',
      dataviewId
    );

    return this.put<CJADataView>(endpoint, {});
  }

  /**
   * Find data view by name
   */
  async findDataViewByName(name: string): Promise<CJADataView | null> {
    const dataViews = await this.listDataViews();
    return dataViews.find((dv) => dv.name === name) || null;
  }

  // ==========================================================================
  // Dimensions API
  // ==========================================================================

  /**
   * List all dimensions for a data view
   */
  async listDimensions(
    dataviewId: string,
    params?: { limit?: number; includeType?: string }
  ): Promise<CJADataViewComponent[]> {
    logger.info('Fetching dimensions for data view', { dataviewId });

    const endpoint = adobeEndpoints.cja.dimensions.replace(
      '{dataviewId}',
      dataviewId
    );

    const allDimensions: CJADataViewComponent[] = [];
    let page = 0;
    const limit = params?.limit || 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await this.get<DimensionListResponse>(endpoint, {
        limit,
        page,
        includeType: params?.includeType || 'shared',
      });

      if (response.content && response.content.length > 0) {
        // Mark components as dimensions
        const dimensions = response.content.map((c) => ({
          ...c,
          componentType: 'dimension' as const,
        }));
        allDimensions.push(...dimensions);
        page++;
        hasMore = response.content.length === limit;
      } else {
        hasMore = false;
      }
    }

    logger.info(`Found ${allDimensions.length} dimensions`);
    return allDimensions;
  }

  /**
   * Get a single dimension by ID
   */
  async getDimension(
    dataviewId: string,
    dimensionId: string
  ): Promise<CJADataViewComponent> {
    logger.debug('Fetching dimension', { dataviewId, dimensionId });

    const endpoint = adobeEndpoints.cja.dimensionById
      .replace('{dataviewId}', dataviewId)
      .replace('{dimensionId}', encodeURIComponent(dimensionId));

    const dimension = await this.get<CJADataViewComponent>(endpoint);
    return { ...dimension, componentType: 'dimension' };
  }

  // ==========================================================================
  // Metrics API
  // ==========================================================================

  /**
   * List all metrics for a data view
   */
  async listMetrics(
    dataviewId: string,
    params?: { limit?: number; includeType?: string }
  ): Promise<CJADataViewComponent[]> {
    logger.info('Fetching metrics for data view', { dataviewId });

    const endpoint = adobeEndpoints.cja.metrics.replace(
      '{dataviewId}',
      dataviewId
    );

    const allMetrics: CJADataViewComponent[] = [];
    let page = 0;
    const limit = params?.limit || 1000;
    let hasMore = true;

    while (hasMore) {
      const response = await this.get<MetricListResponse>(endpoint, {
        limit,
        page,
        includeType: params?.includeType || 'shared',
      });

      if (response.content && response.content.length > 0) {
        // Mark components as metrics
        const metrics = response.content.map((c) => ({
          ...c,
          componentType: 'metric' as const,
        }));
        allMetrics.push(...metrics);
        page++;
        hasMore = response.content.length === limit;
      } else {
        hasMore = false;
      }
    }

    logger.info(`Found ${allMetrics.length} metrics`);
    return allMetrics;
  }

  /**
   * Get a single metric by ID
   */
  async getMetric(
    dataviewId: string,
    metricId: string
  ): Promise<CJADataViewComponent> {
    logger.debug('Fetching metric', { dataviewId, metricId });

    const endpoint = adobeEndpoints.cja.metricById
      .replace('{dataviewId}', dataviewId)
      .replace('{metricId}', encodeURIComponent(metricId));

    const metric = await this.get<CJADataViewComponent>(endpoint);
    return { ...metric, componentType: 'metric' };
  }

  // ==========================================================================
  // Components (All)
  // ==========================================================================

  /**
   * Get all components (dimensions + metrics) for a data view
   */
  async getAllComponents(
    dataviewId: string
  ): Promise<CJADataViewComponent[]> {
    logger.info('Fetching all components for data view', { dataviewId });

    const [dimensions, metrics] = await Promise.all([
      this.listDimensions(dataviewId),
      this.listMetrics(dataviewId),
    ]);

    const allComponents = [...dimensions, ...metrics];
    logger.info(`Found ${allComponents.length} total components`);
    return allComponents;
  }

  // ==========================================================================
  // Copy Data View with Full Settings
  // ==========================================================================

  /**
   * Copy a data view from source to target with all settings
   * Includes: Configuration, Components (dimensions/metrics), Component settings
   */
  async copyDataViewFull(
    sourceDataView: CJADataView,
    targetConnectionId: string,
    componentMapping?: Map<string, string>
  ): Promise<CJADataView> {
    logger.info('Copying CJA data view with full settings', {
      name: sourceDataView.name,
    });

    // Get full source data view details
    const fullSourceDataView = await this.getDataView(sourceDataView.id);

    // Get all components from source data view
    const sourceComponents = await this.getAllComponents(sourceDataView.id);

    // Transform components for target
    const transformedComponents: CreateComponentPayload[] = sourceComponents.map(
      (comp) => {
        const componentPayload: CreateComponentPayload = {
          componentId: comp.componentId,
          componentType: comp.componentType,
          name: comp.name,
          description: comp.description,
          schemaPath: comp.schemaPath,
        };

        // Copy attribution settings
        if (comp.attribution) {
          componentPayload.attribution = comp.attribution;
        }

        // Copy persistence settings
        if (comp.persistence) {
          componentPayload.persistence = comp.persistence;
        }

        // Copy include/exclude settings
        if (comp.includeExcludeSetting) {
          componentPayload.includeExcludeSetting = comp.includeExcludeSetting;
        }

        // Copy format settings
        if (comp.format) {
          componentPayload.format = comp.format;
        }

        // Copy bucketing settings
        if (comp.bucketing) {
          componentPayload.bucketing = comp.bucketing;
        }

        // Copy no value options
        if (comp.noValueOptionsSetting) {
          componentPayload.noValueOptionsSetting = comp.noValueOptionsSetting;
        }

        // Copy deduplication settings
        if (comp.deduplication) {
          componentPayload.deduplication = comp.deduplication;
        }

        // Copy context labels
        if (comp.contextLabels) {
          componentPayload.contextLabels = comp.contextLabels;
        }

        // Copy hidden setting
        if (comp.hidden !== undefined) {
          componentPayload.hidden = comp.hidden;
        }

        // Map derived field reference if applicable
        if (comp.derivedFieldId && componentMapping) {
          const mappedDerivedFieldId = componentMapping.get(comp.derivedFieldId);
          if (mappedDerivedFieldId) {
            componentPayload.derivedFieldId = mappedDerivedFieldId;
          }
        }

        return componentPayload;
      }
    );

    // Build create payload
    const createPayload: CreateDataViewPayload = {
      name: fullSourceDataView.name,
      description: fullSourceDataView.description,
      parentDataGroupId: targetConnectionId,
      timezoneDesignator: fullSourceDataView.timezoneDesignator,
      currentTimezoneOffset: fullSourceDataView.currentTimezoneOffset,
      sessionDefinition: fullSourceDataView.sessionDefinition,
      components: transformedComponents,
    };

    return this.createDataView(createPayload);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCJADataViewService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName?: string
): CJADataViewService {
  return new CJADataViewService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
