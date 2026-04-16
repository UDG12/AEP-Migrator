import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { config, migrationConfig } from '@/config';
import { createLogger } from '@/utils/logger';
import {
  retryWithBackoff,
  handleRateLimit,
  parseNextLink,
  sleep,
} from '@/utils/api-helpers';
import type { AdobeApiResponse } from '@/types';

const logger = createLogger('AdobeBaseClient');

// ============================================================================
// Types
// ============================================================================

export interface ClientOptions {
  baseUrl: string;
  accessToken: string;
  clientId: string;
  orgId: string;
  sandboxName?: string;
  isReactor?: boolean;
  isSchemaRegistry?: boolean;
}

export interface PaginationOptions {
  limit?: number;
  start?: number;
  orderBy?: string;
}

// ============================================================================
// Adobe Base API Client
// ============================================================================

export class AdobeBaseClient {
  protected client: AxiosInstance;
  protected options: ClientOptions;

  constructor(options: ClientOptions) {
    this.options = options;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${options.accessToken}`,
      'x-api-key': options.clientId,
      'x-gw-ims-org-id': options.orgId,
    };

    if (options.isReactor) {
      headers['Accept'] = 'application/vnd.api+json;revision=1';
      headers['Content-Type'] = 'application/vnd.api+json';
    } else if (options.isSchemaRegistry) {
      // Schema Registry requires specific Accept header for listing
      headers['Accept'] = 'application/vnd.adobe.xed-id+json';
      headers['Content-Type'] = 'application/json';
      if (options.sandboxName) {
        headers['x-sandbox-name'] = options.sandboxName;
      }
    } else {
      headers['Accept'] = 'application/json';
      headers['Content-Type'] = 'application/json';
      if (options.sandboxName) {
        headers['x-sandbox-name'] = options.sandboxName;
      }
    }

    this.client = axios.create({
      baseURL: options.baseUrl,
      headers,
      timeout: 60000,
    });

    // Store if this is schema registry for special handling
    (this.client as any).__isSchemaRegistry = options.isSchemaRegistry;

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'];
          await handleRateLimit(retryAfter as string);
          // Retry the request
          return this.client.request(error.config!);
        }
        throw error;
      }
    );
  }

  /**
   * Make a GET request with automatic pagination handling
   */
  protected async get<T>(
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

  /**
   * Make a GET request with RAW schema details (for Schema Registry)
   * Uses xed+json to get original structure with $ref and allOf NOT resolved
   * This preserves the definitions structure needed for copying field groups
   */
  protected async getFullSchema<T>(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    return retryWithBackoff(
      async () => {
        // Use xed+json (RAW) to get original structure with definitions intact
        // NOT xed-full+json which resolves/flattens the structure
        const response = await this.client.get<T>(endpoint, {
          params,
          headers: {
            Accept: 'application/vnd.adobe.xed+json;version=1',
          },
        });
        return response.data;
      },
      {
        onRetry: (attempt, error) => {
          logger.warn(`GET (raw) ${endpoint} retry attempt ${attempt}`, {
            error: error.message,
          });
        },
      }
    );
  }

  /**
   * Make a POST request
   */
  protected async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return retryWithBackoff(
      async () => {
        try {
          const response = await this.client.post<T>(endpoint, data);
          return response.data;
        } catch (error: any) {
          // Log detailed error information for debugging
          if (error.response) {
            logger.error(`POST ${endpoint} failed`, {
              status: error.response.status,
              statusText: error.response.statusText,
              data: JSON.stringify(error.response.data),
              requestPayload: JSON.stringify(data),
            });
          }
          throw error;
        }
      },
      {
        onRetry: (attempt, error: any) => {
          const errorDetail = error.response?.data?.detail ||
                              error.response?.data?.message ||
                              error.message;
          logger.warn(`POST ${endpoint} retry attempt ${attempt}`, {
            error: errorDetail,
            status: error.response?.status,
          });
        },
      }
    );
  }

  /**
   * Make a PUT request
   */
  protected async put<T>(endpoint: string, data?: unknown): Promise<T> {
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

  /**
   * Make a PATCH request
   */
  protected async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return retryWithBackoff(
      async () => {
        const response = await this.client.patch<T>(endpoint, data);
        return response.data;
      },
      {
        onRetry: (attempt, error) => {
          logger.warn(`PATCH ${endpoint} retry attempt ${attempt}`, {
            error: error.message,
          });
        },
      }
    );
  }

  /**
   * Make a DELETE request
   */
  protected async delete<T>(endpoint: string): Promise<T> {
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

  /**
   * Fetch all pages of a paginated endpoint
   */
  protected async fetchAllPages<T>(
    endpoint: string,
    params?: PaginationOptions,
    extractItems?: (response: AdobeApiResponse<T>) => T[]
  ): Promise<T[]> {
    const limit = params?.limit || migrationConfig.pagination.defaultLimit;
    const allItems: T[] = [];
    let nextUrl: string | null = endpoint;
    let page = 0;

    while (nextUrl) {
      page++;
      logger.debug(`Fetching page ${page}`, { endpoint: nextUrl });

      const queryParams: Record<string, unknown> = {
        limit,
        ...params,
      };

      // Remove limit/start from params if we're following a next link
      if (page > 1) {
        delete queryParams.limit;
        delete queryParams.start;
      }

      const response = await this.get<AdobeApiResponse<T>>(
        nextUrl,
        page === 1 ? queryParams : undefined
      );

      // Extract items from response
      let items: T[];
      if (extractItems) {
        items = extractItems(response);
      } else if (response.results) {
        items = response.results;
      } else if (Array.isArray(response.data)) {
        items = response.data;
      } else if (response.data) {
        items = [response.data];
      } else {
        items = [];
      }

      allItems.push(...items);

      // Check for next page
      nextUrl = parseNextLink(response._links);

      // Small delay between pages to avoid rate limiting
      if (nextUrl) {
        await sleep(100);
      }
    }

    logger.info(`Fetched ${allItems.length} items from ${endpoint}`, {
      pages: page,
    });

    return allItems;
  }

  /**
   * Check if a resource exists
   */
  protected async exists(endpoint: string): Promise<boolean> {
    try {
      await this.get(endpoint);
      return true;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Make a GET request for raw binary data (e.g., file downloads)
   */
  protected async getRaw(
    endpoint: string,
    params?: Record<string, unknown>
  ): Promise<Buffer> {
    return retryWithBackoff(
      async () => {
        const response = await this.client.get(endpoint, {
          params,
          responseType: 'arraybuffer',
          headers: {
            Accept: 'application/octet-stream',
          },
        });
        return Buffer.from(response.data);
      },
      {
        onRetry: (attempt, error) => {
          logger.warn(`GET (raw) ${endpoint} retry attempt ${attempt}`, {
            error: error.message,
          });
        },
      }
    );
  }

  /**
   * Make a PUT request with raw binary data (e.g., file uploads)
   */
  protected async putRaw(
    endpoint: string,
    data: Buffer,
    headers?: Record<string, string>
  ): Promise<void> {
    return retryWithBackoff(
      async () => {
        await this.client.put(endpoint, data, {
          headers: {
            'Content-Type': 'application/octet-stream',
            ...headers,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });
      },
      {
        onRetry: (attempt, error) => {
          logger.warn(`PUT (raw) ${endpoint} retry attempt ${attempt}`, {
            error: error.message,
          });
        },
      }
    );
  }
}
