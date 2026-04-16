import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type { Audience, AdobeApiResponse } from '@/types';

const logger = createLogger('AudienceService');

// ============================================================================
// Types
// ============================================================================

interface SegmentDefinitionResponse {
  id: string;
  name: string;
  description?: string;
  expression: {
    type: string;
    format: string;
    value: string;
  };
  mergePolicyId?: string;
  evaluationInfo?: {
    batch?: { enabled: boolean };
    continuous?: { enabled: boolean };
    synchronous?: { enabled: boolean };
  };
  schema: {
    name: string;
  };
  creationTime: number;
  updateTime: number;
}

interface SegmentListResponse {
  segments: SegmentDefinitionResponse[];
  page: {
    totalCount: number;
    pageSize: number;
  };
  link?: {
    next?: string;
  };
}

interface CreateAudiencePayload {
  name: string;
  description?: string;
  expression: {
    type: string;
    format: string;
    value: string;
  };
  mergePolicyId?: string;
  evaluationInfo?: {
    batch?: { enabled: boolean };
    continuous?: { enabled: boolean };
    synchronous?: { enabled: boolean };
  };
  schema: {
    name: string;
  };
}

// ============================================================================
// Audience Service (Segmentation API)
// ============================================================================

export class AudienceService extends AdobeBaseClient {
  constructor(options: Omit<ClientOptions, 'baseUrl' | 'isReactor'>) {
    super({
      ...options,
      baseUrl: config.adobe.platformUrl,
      isReactor: false,
    });
  }

  /**
   * Fetch all segment definitions (audiences)
   */
  async listAudiences(): Promise<Audience[]> {
    logger.info('Fetching all audiences');

    const allAudiences: Audience[] = [];
    let start = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await this.get<SegmentListResponse>(
        adobeEndpoints.platform.audiences,
        { start, limit }
      );

      const audiences = response.segments.map((seg) => ({
        id: seg.id,
        name: seg.name,
        description: seg.description,
        expression: seg.expression,
        mergePolicyId: seg.mergePolicyId,
        evaluationInfo: seg.evaluationInfo,
        schema: seg.schema,
        state: 'REALIZED' as const,
        createdAt: seg.creationTime,
        updatedAt: seg.updateTime,
      }));

      allAudiences.push(...audiences);

      if (audiences.length < limit || !response.link?.next) {
        hasMore = false;
      } else {
        start += limit;
      }
    }

    logger.info(`Found ${allAudiences.length} audiences`);
    return allAudiences;
  }

  /**
   * Get a single audience by ID
   */
  async getAudience(audienceId: string): Promise<Audience> {
    logger.debug('Fetching audience', { audienceId });

    const response = await this.get<SegmentDefinitionResponse>(
      `${adobeEndpoints.platform.audiences}/${audienceId}`
    );

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      expression: response.expression,
      mergePolicyId: response.mergePolicyId,
      evaluationInfo: response.evaluationInfo,
      schema: response.schema,
      state: 'REALIZED',
      createdAt: response.creationTime,
      updatedAt: response.updateTime,
    };
  }

  /**
   * Create a new audience (segment definition)
   */
  async createAudience(payload: CreateAudiencePayload): Promise<Audience> {
    logger.info('Creating audience', { name: payload.name });

    const response = await this.post<SegmentDefinitionResponse>(
      adobeEndpoints.platform.audiences,
      payload
    );

    logger.info('Audience created successfully', { id: response.id });

    return {
      id: response.id,
      name: response.name,
      description: response.description,
      expression: response.expression,
      mergePolicyId: response.mergePolicyId,
      evaluationInfo: response.evaluationInfo,
      schema: response.schema,
      state: 'REALIZED',
      createdAt: response.creationTime,
      updatedAt: response.updateTime,
    };
  }

  /**
   * Check if an audience exists by name
   */
  async findAudienceByName(name: string): Promise<Audience | null> {
    const audiences = await this.listAudiences();
    return audiences.find((a) => a.name === name) || null;
  }

  /**
   * Copy an audience from source to target
   * Note: PQL expressions may contain schema references that need transformation
   */
  async copyAudience(
    sourceAudience: Audience,
    schemaMapping: Map<string, string>
  ): Promise<Audience> {
    logger.info('Copying audience', { name: sourceAudience.name });

    // Transform PQL expression if it contains schema references
    let transformedExpression = sourceAudience.expression.value;

    // Replace schema references in PQL expression
    for (const [sourceSchemaId, targetSchemaId] of schemaMapping.entries()) {
      transformedExpression = transformedExpression.replace(
        new RegExp(sourceSchemaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        targetSchemaId
      );
    }

    const payload: CreateAudiencePayload = {
      name: sourceAudience.name,
      description: sourceAudience.description,
      expression: {
        type: sourceAudience.expression.type,
        format: sourceAudience.expression.format,
        value: transformedExpression,
      },
      evaluationInfo: sourceAudience.evaluationInfo,
      schema: sourceAudience.schema,
    };

    return this.createAudience(payload);
  }

  /**
   * Trigger segment job to evaluate audience
   */
  async triggerSegmentJob(audienceId: string): Promise<string> {
    logger.info('Triggering segment job', { audienceId });

    const response = await this.post<{ id: string }>(
      adobeEndpoints.platform.segmentJobs,
      {
        segmentId: audienceId,
      }
    );

    logger.info('Segment job triggered', { jobId: response.id });
    return response.id;
  }

  /**
   * Get segment job status
   */
  async getSegmentJobStatus(jobId: string): Promise<{
    status: string;
    totalTime: number;
  }> {
    const response = await this.get<{
      status: string;
      metrics: { totalTime: number };
    }>(`${adobeEndpoints.platform.segmentJobs}/${jobId}`);

    return {
      status: response.status,
      totalTime: response.metrics?.totalTime || 0,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createAudienceService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName: string
): AudienceService {
  return new AudienceService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
