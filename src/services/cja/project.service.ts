import axios, { AxiosInstance, AxiosError } from 'axios';
import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { retryWithBackoff, handleRateLimit } from '@/utils/api-helpers';

const logger = createLogger('CJAProjectService');

// ============================================================================
// Types
// ============================================================================

export interface CJAClientOptions {
  accessToken: string;
  clientId: string;
  orgId: string;
  sandboxName?: string;
  globalCompanyId?: string;
}

export interface CJAProject {
  id: string;
  name: string;
  description?: string;
  owner?: {
    id: string;
    name?: string;
  };
  dataId?: string; // Data View ID
  rsid?: string; // Report Suite ID (legacy)
  created?: string;
  modified?: string;
  tags?: string[];
  type?: string;
  definition?: any;
}

interface ProjectListResponse {
  content: CJAProject[];
  totalElements: number;
  totalPages: number;
  page: {
    number: number;
    size: number;
  };
}

// ============================================================================
// CJA Project Service
// ============================================================================

export class CJAProjectService {
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

  // ==========================================================================
  // Projects API
  // ==========================================================================

  /**
   * List all projects
   */
  async listProjects(params?: {
    limit?: number;
    page?: number;
    expansion?: string;
    includeType?: string;
  }): Promise<CJAProject[]> {
    logger.info('Fetching CJA projects', {
      globalCompanyId: this.options.globalCompanyId || 'NOT SET',
    });

    const allProjects: CJAProject[] = [];
    let page = params?.page || 0;
    const limit = params?.limit || 100;
    let hasMore = true;

    while (hasMore) {
      // Required params based on working API call
      const queryParams: Record<string, unknown> = {
        limit,
        page,
        pagination: true,
        locale: 'en_US',
        includeType: params?.includeType || 'all',
        expansion: params?.expansion || 'ownerFullName,modified,tags',
      };

      logger.debug('Projects API request', {
        endpoint: adobeEndpoints.cja.projects,
        params: queryParams,
      });

      try {
        const response = await this.get<ProjectListResponse>(
          adobeEndpoints.cja.projects,
          queryParams
        );

        logger.debug('Projects API response', {
          totalElements: response.totalElements,
          totalPages: response.totalPages,
          contentLength: response.content?.length,
          rawResponse: JSON.stringify(response).substring(0, 500),
        });

        if (response.content && response.content.length > 0) {
          allProjects.push(...response.content);
          page++;
          hasMore = response.content.length === limit;
        } else {
          hasMore = false;
        }
      } catch (error: any) {
        logger.error('Projects API error', {
          message: error.message,
          status: error.response?.status,
          data: JSON.stringify(error.response?.data),
        });
        throw error;
      }
    }

    logger.info(`Found ${allProjects.length} CJA projects`);
    return allProjects;
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: string, expansion?: string): Promise<CJAProject> {
    logger.debug('Fetching CJA project', { projectId });

    const endpoint = adobeEndpoints.cja.projectById.replace(
      '{projectId}',
      projectId
    );

    return this.get<CJAProject>(endpoint, {
      expansion: expansion || 'name,description,owner,definition',
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCJAProjectService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName?: string,
  globalCompanyId?: string
): CJAProjectService {
  return new CJAProjectService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
    globalCompanyId,
  });
}
