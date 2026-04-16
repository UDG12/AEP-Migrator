import axios, { AxiosInstance, AxiosError } from 'axios';
import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { retryWithBackoff, handleRateLimit } from '@/utils/api-helpers';
import type {
  CJAConnection,
  CJAConnectionDataset,
  CJAApiResponse,
} from '@/types';

const logger = createLogger('CJAConnectionService');

// ============================================================================
// Types
// ============================================================================

export interface CJAClientOptions {
  accessToken: string;
  clientId: string;
  orgId: string;
  sandboxName?: string;
}

interface ConnectionListResponse {
  content: CJAConnection[];
  totalElements: number;
  totalPages: number;
  page: {
    number: number;
    size: number;
  };
}

interface CreateConnectionPayload {
  name: string;
  description?: string;
  dataSets: CreateConnectionDataset[];
  sandboxName?: string;
  backfillEnabled?: boolean;
  streamingEnabled?: boolean;
}

interface CreateConnectionDataset {
  datasetId: string;
  type: 'event' | 'profile' | 'lookup' | 'summary';
  timestampField?: string;
  personIdField?: string;
}

// ============================================================================
// CJA Connection Service
// ============================================================================

export class CJAConnectionService {
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

    // CJA API Note: CJA (Customer Journey Analytics) is ORGANIZATION-LEVEL, not sandbox-level
    // DO NOT add x-sandbox-name header - it will cause connections to return 0 results
    // CJA connections, data views, and components are managed at the IMS Org level
    logger.info('CJA Connection Service initialized (org-level, no sandbox)', {
      orgId: options.orgId,
      sandboxIgnored: options.sandboxName // Log for debugging but don't use
    });

    this.client = axios.create({
      baseURL: config.adobe.cjaUrl,
      headers,
      timeout: 60000,
    });

    // Add response interceptor for rate limiting
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
  // Connections API
  // ==========================================================================

  /**
   * List all connections
   */
  async listConnections(params?: {
    limit?: number;
    page?: number;
    expansion?: string;
  }): Promise<CJAConnection[]> {
    logger.info('Fetching CJA connections', {
      baseUrl: this.client.defaults.baseURL,
      endpoint: adobeEndpoints.cja.connections,
      orgId: this.options.orgId
    });

    const allConnections: CJAConnection[] = [];
    let page = params?.page || 0;
    const limit = params?.limit || 100;
    let hasMore = true;

    while (hasMore) {
      const queryParams: Record<string, unknown> = {
        limit,
        page,
        // Adobe CJA API requires expansion to return fields like name, description, owner, dataSets
        expansion: params?.expansion || 'name,description,owner,dataSets'
      };

      try {
        const response = await this.get<ConnectionListResponse>(
          adobeEndpoints.cja.connections,
          queryParams
        );

        logger.info('CJA connections API response', {
          hasContent: !!response.content,
          contentLength: response.content?.length || 0,
          totalElements: response.totalElements,
          totalPages: response.totalPages,
          currentPage: response.page?.number,
          responseKeys: Object.keys(response || {}),
          queryParams: JSON.stringify(queryParams),
          baseUrl: this.client.defaults.baseURL,
          fullUrl: `${this.client.defaults.baseURL}${adobeEndpoints.cja.connections}`,
          orgId: this.options.orgId,
          sandboxName: this.options.sandboxName
        });

        if (response.content && response.content.length > 0) {
          allConnections.push(...response.content);
          page++;
          hasMore = response.content.length === limit;
        } else {
          hasMore = false;
        }
      } catch (error: any) {
        logger.error('CJA connections API error', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: JSON.stringify(error.response?.data),
          message: error.message,
          endpoint: adobeEndpoints.cja.connections,
          queryParams: JSON.stringify(queryParams),
          headers: {
            orgId: this.options.orgId,
            sandbox: this.options.sandboxName,
            baseUrl: this.client.defaults.baseURL
          }
        });
        hasMore = false;
      }
    }

    logger.info(`Found ${allConnections.length} CJA connections`);
    return allConnections;
  }

  /**
   * Get a single connection by ID
   */
  async getConnection(connectionId: string, expansion?: string): Promise<CJAConnection> {
    logger.debug('Fetching CJA connection', { connectionId });

    const endpoint = adobeEndpoints.cja.connectionById.replace(
      '{connectionId}',
      connectionId
    );

    return this.get<CJAConnection>(endpoint, {
      expansion: expansion || 'name,description,owner,dataSets,schemaInfo,organization,externalData',
    });
  }

  /**
   * Create a new connection
   */
  async createConnection(payload: CreateConnectionPayload): Promise<CJAConnection> {
    logger.info('Creating CJA connection', { name: payload.name });

    const response = await this.post<CJAConnection>(
      adobeEndpoints.cja.connections,
      payload
    );

    logger.info('CJA connection created successfully', { id: response.id });
    return response;
  }

  /**
   * Update an existing connection
   */
  async updateConnection(
    connectionId: string,
    payload: Partial<CreateConnectionPayload>
  ): Promise<CJAConnection> {
    logger.info('Updating CJA connection', { connectionId });

    const endpoint = adobeEndpoints.cja.connectionById.replace(
      '{connectionId}',
      connectionId
    );

    return this.put<CJAConnection>(endpoint, payload);
  }

  /**
   * Delete a connection
   */
  async deleteConnection(connectionId: string): Promise<void> {
    logger.info('Deleting CJA connection', { connectionId });

    const endpoint = adobeEndpoints.cja.connectionById.replace(
      '{connectionId}',
      connectionId
    );

    await this.delete<void>(endpoint);
    logger.info('CJA connection deleted successfully', { connectionId });
  }

  /**
   * Find connection by name
   */
  async findConnectionByName(name: string): Promise<CJAConnection | null> {
    const connections = await this.listConnections();
    return connections.find((c) => c.name === name) || null;
  }

  /**
   * Get connection backfills for a dataset
   */
  async getConnectionBackfills(
    connectionId: string,
    datasetId: string
  ): Promise<any[]> {
    logger.debug('Fetching connection backfills', { connectionId, datasetId });

    const endpoint = adobeEndpoints.cja.connectionBackfills
      .replace('{connectionId}', connectionId)
      .replace('{datasetId}', datasetId);

    const response = await this.get<{ backfills: any[] }>(endpoint);
    return response.backfills || [];
  }

  /**
   * Copy a connection from source to target
   * Note: Dataset IDs need to be mapped to target org datasets
   */
  async copyConnection(
    sourceConnection: CJAConnection,
    datasetMapping: Map<string, string>
  ): Promise<CJAConnection> {
    logger.info('Copying CJA connection', { name: sourceConnection.name });

    // Transform dataset references to target org
    const transformedDatasets: CreateConnectionDataset[] = (
      sourceConnection.dataSets || []
    ).map((ds) => {
      const targetDatasetId = datasetMapping.get(ds.datasetId) || ds.datasetId;
      return {
        datasetId: targetDatasetId,
        type: ds.type,
        timestampField: ds.timestampField,
        personIdField: ds.personIdField,
      };
    });

    const payload: CreateConnectionPayload = {
      name: sourceConnection.name,
      description: sourceConnection.description,
      dataSets: transformedDatasets,
      backfillEnabled: sourceConnection.backfillEnabled,
      streamingEnabled: sourceConnection.streamingEnabled,
    };

    return this.createConnection(payload);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCJAConnectionService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName?: string
): CJAConnectionService {
  return new CJAConnectionService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
