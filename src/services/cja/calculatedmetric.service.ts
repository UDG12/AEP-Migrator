import axios, { AxiosInstance, AxiosError } from 'axios';
import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { retryWithBackoff, handleRateLimit } from '@/utils/api-helpers';
import type {
  CJACalculatedMetric,
  CJACalculatedMetricDefinition,
  CJAMetricFormula,
  CJAApiResponse,
} from '@/types';

const logger = createLogger('CJACalculatedMetricService');

// ============================================================================
// Types
// ============================================================================

export interface CJAClientOptions {
  accessToken: string;
  clientId: string;
  orgId: string;
  sandboxName?: string;
}

interface CalculatedMetricListResponse {
  content: CJACalculatedMetric[];
  totalElements: number;
  totalPages: number;
  page?: {
    number: number;
    size: number;
  };
}

interface CreateCalculatedMetricPayload {
  name: string;
  description?: string;
  dataId?: string; // Data view ID
  rsid?: string;
  type?: 'decimal' | 'percent' | 'currency' | 'time';
  precision?: number;
  definition: CJACalculatedMetricDefinition;
  tags?: string[];
  polarity?: 'positive' | 'negative';
}

interface ValidationResult {
  valid: boolean;
  message?: string;
  errors?: string[];
}

// ============================================================================
// CJA Calculated Metric Service
// ============================================================================

export class CJACalculatedMetricService {
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
  // Calculated Metrics API
  // ==========================================================================

  /**
   * List all calculated metrics
   */
  async listCalculatedMetrics(params?: {
    limit?: number;
    page?: number;
    rsids?: string;
    expansion?: string;
  }): Promise<CJACalculatedMetric[]> {
    logger.info('Fetching CJA calculated metrics');

    const allMetrics: CJACalculatedMetric[] = [];
    let page = params?.page || 0;
    const limit = params?.limit || 100;
    let hasMore = true;

    while (hasMore) {
      const queryParams: Record<string, unknown> = {
        limit,
        page,
        expansion: params?.expansion || 'definition,tags',
        includeType: 'all', // Include all types (shared, private, etc.)
      };

      if (params?.rsids) {
        queryParams.rsids = params.rsids;
      }

      const response = await this.get<CalculatedMetricListResponse>(
        adobeEndpoints.cja.calculatedMetrics,
        queryParams
      );

      if (response.content && response.content.length > 0) {
        allMetrics.push(...response.content);
        page++;
        hasMore = response.content.length === limit;
      } else {
        hasMore = false;
      }
    }

    logger.info(`Found ${allMetrics.length} CJA calculated metrics`);
    return allMetrics;
  }

  /**
   * Get a single calculated metric by ID
   */
  async getCalculatedMetric(
    metricId: string,
    expansion?: string
  ): Promise<CJACalculatedMetric> {
    logger.debug('Fetching CJA calculated metric', { metricId });

    const endpoint = adobeEndpoints.cja.calculatedMetricById.replace(
      '{metricId}',
      metricId
    );

    return this.get<CJACalculatedMetric>(endpoint, {
      expansion: expansion || 'definition,tags',
    });
  }

  /**
   * Create a new calculated metric
   */
  async createCalculatedMetric(
    payload: CreateCalculatedMetricPayload
  ): Promise<CJACalculatedMetric> {
    logger.info('Creating CJA calculated metric', { name: payload.name });

    const response = await this.post<CJACalculatedMetric>(
      adobeEndpoints.cja.calculatedMetrics,
      payload
    );

    logger.info('CJA calculated metric created successfully', {
      id: response.id,
    });
    return response;
  }

  /**
   * Update an existing calculated metric
   */
  async updateCalculatedMetric(
    metricId: string,
    payload: Partial<CreateCalculatedMetricPayload>
  ): Promise<CJACalculatedMetric> {
    logger.info('Updating CJA calculated metric', { metricId });

    const endpoint = adobeEndpoints.cja.calculatedMetricById.replace(
      '{metricId}',
      metricId
    );

    return this.put<CJACalculatedMetric>(endpoint, payload);
  }

  /**
   * Delete a calculated metric
   */
  async deleteCalculatedMetric(metricId: string): Promise<void> {
    logger.info('Deleting CJA calculated metric', { metricId });

    const endpoint = adobeEndpoints.cja.calculatedMetricById.replace(
      '{metricId}',
      metricId
    );

    await this.delete<void>(endpoint);
    logger.info('CJA calculated metric deleted successfully', { metricId });
  }

  /**
   * Validate a calculated metric definition
   */
  async validateCalculatedMetric(
    payload: CreateCalculatedMetricPayload
  ): Promise<ValidationResult> {
    logger.info('Validating CJA calculated metric', { name: payload.name });

    try {
      const response = await this.post<{ valid: boolean; message?: string }>(
        adobeEndpoints.cja.calculatedMetricValidate,
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
   * Find calculated metric by name
   */
  async findCalculatedMetricByName(
    name: string,
    dataviewId?: string
  ): Promise<CJACalculatedMetric | null> {
    const metrics = await this.listCalculatedMetrics({
      rsids: dataviewId,
    });
    return metrics.find((m) => m.name === name) || null;
  }

  /**
   * Copy a calculated metric from source to target
   */
  async copyCalculatedMetric(
    sourceMetric: CJACalculatedMetric,
    targetDataviewId?: string,
    componentMapping?: Map<string, string>
  ): Promise<CJACalculatedMetric> {
    logger.info('Copying CJA calculated metric', { name: sourceMetric.name });

    // Transform the definition if component mapping is provided
    let transformedDefinition = sourceMetric.definition;
    if (componentMapping && componentMapping.size > 0) {
      transformedDefinition = this.transformMetricDefinition(
        sourceMetric.definition,
        componentMapping
      );
    }

    const payload: CreateCalculatedMetricPayload = {
      name: sourceMetric.name,
      description: sourceMetric.description,
      dataId: targetDataviewId || sourceMetric.dataId,
      type: sourceMetric.type,
      precision: sourceMetric.precision,
      definition: transformedDefinition,
      tags: sourceMetric.tags,
      polarity: sourceMetric.polarity,
    };

    return this.createCalculatedMetric(payload);
  }

  /**
   * Transform calculated metric definition with component mappings
   */
  private transformMetricDefinition(
    definition: CJACalculatedMetricDefinition,
    componentMapping: Map<string, string>
  ): CJACalculatedMetricDefinition {
    // Deep clone the definition
    const transformed = JSON.parse(
      JSON.stringify(definition)
    ) as CJACalculatedMetricDefinition;

    // Transform the formula recursively
    if (transformed.formula) {
      this.transformFormula(transformed.formula, componentMapping);
    }

    return transformed;
  }

  /**
   * Recursively transform metric references in formula
   */
  private transformFormula(
    formula: CJAMetricFormula,
    componentMapping: Map<string, string>
  ): void {
    if (!formula) return;

    // Transform metric name references
    if (formula.name) {
      const mappedName = componentMapping.get(formula.name);
      if (mappedName) {
        formula.name = mappedName;
      }
    }

    // Recursively transform nested formulas
    if (formula.col1) {
      this.transformFormula(formula.col1, componentMapping);
    }
    if (formula.col2) {
      this.transformFormula(formula.col2, componentMapping);
    }
  }

  /**
   * Get metrics referenced by a calculated metric definition
   */
  getReferencedMetrics(definition: CJACalculatedMetricDefinition): string[] {
    const references: string[] = [];

    const collectReferences = (formula: CJAMetricFormula) => {
      if (!formula) return;

      // If this is a metric reference, add it
      if (formula.func === 'metric' && formula.name) {
        references.push(formula.name);
      }

      // Recursively collect from nested formulas
      if (formula.col1) {
        collectReferences(formula.col1);
      }
      if (formula.col2) {
        collectReferences(formula.col2);
      }
    };

    if (definition.formula) {
      collectReferences(definition.formula);
    }

    return [...new Set(references)]; // Return unique references
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createCJACalculatedMetricService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName?: string
): CJACalculatedMetricService {
  return new CJACalculatedMetricService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
