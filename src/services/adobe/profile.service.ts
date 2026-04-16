import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type {
  MergePolicy,
  ComputedAttribute,
  ProfileEntity,
  ProfileExportJob,
  AdobeApiResponse,
} from '@/types';

const logger = createLogger('ProfileService');

// ============================================================================
// Types
// ============================================================================

interface MergePolicyResponse {
  _page?: {
    count: number;
    totalCount?: number;
  };
  children?: MergePolicy[];
}

interface ComputedAttributeResponse {
  _page?: {
    totalCount: number;
    count: number;
  };
  children?: ComputedAttribute[];
}

interface CreateMergePolicyPayload {
  name: string;
  schema: {
    name: string;
  };
  identityGraph: {
    type: 'none' | 'pdg' | 'coop';
  };
  attributeMerge: {
    type: 'timestampOrdered' | 'dataSetPrecedence';
    order?: string[];
  };
  default?: boolean;
  activeOnEdge?: boolean;
}

interface CreateComputedAttributePayload {
  name: string;
  displayName: string;
  description?: string;
  expression: {
    type: string;
    format: string;
    value: string;
  };
  mergeFunction: {
    type: 'SUM' | 'COUNT' | 'MIN' | 'MAX' | 'MOST_RECENT' | 'FIRST' | 'LAST' | 'TRUE' | 'FALSE';
    value?: string;
  };
  duration: {
    unit: 'DAYS' | 'HOURS' | 'WEEKS' | 'MONTHS';
    count: number;
  };
  path: string;
  schema: {
    name: string;
  };
  keepCurrent?: boolean;
}

interface ProfileAccessParams {
  schema?: {
    name: string;
  };
  entityId?: string;
  entityIdNS?: string;
  mergePolicyId?: string;
  relatedEntityId?: string;
  relatedEntityIdNS?: string;
  relatedSchema?: {
    name: string;
  };
  fields?: string;
}

// ============================================================================
// Profile Service
// ============================================================================

/**
 * Adobe Real-time Customer Profile API Client
 *
 * Handles merge policies, computed attributes, and profile access.
 * Merge policies control how profile fragments are merged together.
 * Computed attributes enable aggregated profile metrics.
 */
export class ProfileService extends AdobeBaseClient {
  constructor(
    options: Omit<ClientOptions, 'baseUrl' | 'isReactor' | 'isSchemaRegistry'>
  ) {
    super({
      ...options,
      baseUrl: config.adobe.platformUrl,
      isReactor: false,
      isSchemaRegistry: false,
    });
  }

  // ==========================================================================
  // Merge Policies
  // ==========================================================================

  /**
   * List all merge policies
   */
  async listMergePolicies(): Promise<MergePolicy[]> {
    logger.info('Fetching all merge policies');

    try {
      const response = await this.get<MergePolicyResponse>(
        adobeEndpoints.profile.mergePolicies
      );

      const policies = response.children || [];
      logger.info(`Found ${policies.length} merge policies`);
      return policies;
    } catch (error: any) {
      logger.error('Failed to fetch merge policies', { error: error.message });
      throw error;
    }
  }

  /**
   * Get a single merge policy by ID
   */
  async getMergePolicy(policyId: string): Promise<MergePolicy> {
    logger.debug('Fetching merge policy', { policyId });

    const endpoint = adobeEndpoints.profile.mergePolicyById.replace(
      '{POLICY_ID}',
      policyId
    );

    return this.get<MergePolicy>(endpoint);
  }

  /**
   * Create a new merge policy
   */
  async createMergePolicy(payload: CreateMergePolicyPayload): Promise<MergePolicy> {
    logger.info('Creating merge policy', { name: payload.name });

    const response = await this.post<MergePolicy>(
      adobeEndpoints.profile.mergePolicies,
      payload
    );

    logger.info('Merge policy created successfully', { id: response.id });
    return response;
  }

  /**
   * Update an existing merge policy
   */
  async updateMergePolicy(
    policyId: string,
    updates: Partial<CreateMergePolicyPayload>
  ): Promise<MergePolicy> {
    logger.info('Updating merge policy', { policyId });

    const endpoint = adobeEndpoints.profile.mergePolicyById.replace(
      '{POLICY_ID}',
      policyId
    );

    const response = await this.patch<MergePolicy>(endpoint, updates);

    logger.info('Merge policy updated successfully', { id: policyId });
    return response;
  }

  /**
   * Delete a merge policy
   */
  async deleteMergePolicy(policyId: string): Promise<void> {
    logger.info('Deleting merge policy', { policyId });

    const endpoint = adobeEndpoints.profile.mergePolicyById.replace(
      '{POLICY_ID}',
      policyId
    );

    await this.delete(endpoint);

    logger.info('Merge policy deleted successfully', { id: policyId });
  }

  /**
   * Find merge policy by name
   */
  async findMergePolicyByName(name: string): Promise<MergePolicy | null> {
    const policies = await this.listMergePolicies();
    return policies.find((p) => p.name === name) || null;
  }

  /**
   * Get the default merge policy
   */
  async getDefaultMergePolicy(): Promise<MergePolicy | null> {
    const policies = await this.listMergePolicies();
    return policies.find((p) => p.default === true) || null;
  }

  /**
   * List merge policies for a specific schema
   */
  async listMergePoliciesForSchema(schemaName: string): Promise<MergePolicy[]> {
    const policies = await this.listMergePolicies();
    return policies.filter((p) => p.schema?.name === schemaName);
  }

  // ==========================================================================
  // Computed Attributes
  // ==========================================================================

  /**
   * List all computed attributes
   * Note: Requires Real-Time CDP Ultimate
   */
  async listComputedAttributes(): Promise<ComputedAttribute[]> {
    logger.info('Fetching all computed attributes');

    try {
      const response = await this.get<ComputedAttributeResponse>(
        adobeEndpoints.profile.computedAttributes
      );

      const attributes = response.children || [];
      logger.info(`Found ${attributes.length} computed attributes`);
      return attributes;
    } catch (error: any) {
      // Computed attributes may not be available in all SKUs
      if (error.response?.status === 403 || error.response?.status === 404) {
        logger.warn('Computed attributes not available for this organization');
        return [];
      }
      logger.error('Failed to fetch computed attributes', { error: error.message });
      throw error;
    }
  }

  /**
   * Get a single computed attribute by ID
   */
  async getComputedAttribute(attributeId: string): Promise<ComputedAttribute> {
    logger.debug('Fetching computed attribute', { attributeId });

    const endpoint = adobeEndpoints.profile.computedAttributeById.replace(
      '{ATTRIBUTE_ID}',
      attributeId
    );

    return this.get<ComputedAttribute>(endpoint);
  }

  /**
   * Create a new computed attribute
   */
  async createComputedAttribute(
    payload: CreateComputedAttributePayload
  ): Promise<ComputedAttribute> {
    logger.info('Creating computed attribute', { name: payload.name });

    const response = await this.post<ComputedAttribute>(
      adobeEndpoints.profile.computedAttributes,
      payload
    );

    logger.info('Computed attribute created successfully', { id: response.id });
    return response;
  }

  /**
   * Update a computed attribute
   */
  async updateComputedAttribute(
    attributeId: string,
    updates: Partial<CreateComputedAttributePayload>
  ): Promise<ComputedAttribute> {
    logger.info('Updating computed attribute', { attributeId });

    const endpoint = adobeEndpoints.profile.computedAttributeById.replace(
      '{ATTRIBUTE_ID}',
      attributeId
    );

    const response = await this.patch<ComputedAttribute>(endpoint, updates);

    logger.info('Computed attribute updated successfully', { id: attributeId });
    return response;
  }

  /**
   * Delete a computed attribute
   */
  async deleteComputedAttribute(attributeId: string): Promise<void> {
    logger.info('Deleting computed attribute', { attributeId });

    const endpoint = adobeEndpoints.profile.computedAttributeById.replace(
      '{ATTRIBUTE_ID}',
      attributeId
    );

    await this.delete(endpoint);

    logger.info('Computed attribute deleted successfully', { id: attributeId });
  }

  /**
   * Find computed attribute by name
   */
  async findComputedAttributeByName(name: string): Promise<ComputedAttribute | null> {
    const attributes = await this.listComputedAttributes();
    return attributes.find((a) => a.name === name) || null;
  }

  /**
   * List active computed attributes
   */
  async listActiveComputedAttributes(): Promise<ComputedAttribute[]> {
    const attributes = await this.listComputedAttributes();
    return attributes.filter((a) => a.status === 'ACTIVE');
  }

  // ==========================================================================
  // Profile Access (Entity Access)
  // ==========================================================================

  /**
   * Access a profile entity by ID
   */
  async getProfileEntity(params: ProfileAccessParams): Promise<ProfileEntity | null> {
    logger.debug('Fetching profile entity', { entityId: params.entityId });

    try {
      const queryParams: Record<string, string> = {};

      if (params.schema?.name) {
        queryParams['schema.name'] = params.schema.name;
      }
      if (params.entityId) {
        queryParams.entityId = params.entityId;
      }
      if (params.entityIdNS) {
        queryParams.entityIdNS = params.entityIdNS;
      }
      if (params.mergePolicyId) {
        queryParams.mergePolicyId = params.mergePolicyId;
      }
      if (params.fields) {
        queryParams.fields = params.fields;
      }

      const response = await this.get<ProfileEntity>(
        adobeEndpoints.profile.entities,
        queryParams
      );

      return response;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.debug('Profile entity not found', { entityId: params.entityId });
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // Profile Export Jobs
  // ==========================================================================

  /**
   * Create a profile export job
   */
  async createExportJob(params: {
    schemaName: string;
    datasetId: string;
    segmentId?: string;
    mergePolicyId?: string;
    filter?: {
      segmentQualificationTime?: {
        startTime: string;
        endTime: string;
      };
    };
  }): Promise<ProfileExportJob> {
    logger.info('Creating profile export job', { datasetId: params.datasetId });

    const payload: any = {
      destination: {
        datasetId: params.datasetId,
      },
      schema: {
        name: params.schemaName,
      },
    };

    if (params.segmentId) {
      payload.filter = {
        segments: [{ segmentId: params.segmentId }],
        ...params.filter,
      };
    }

    if (params.mergePolicyId) {
      payload.mergePolicyId = params.mergePolicyId;
    }

    const response = await this.post<ProfileExportJob>(
      adobeEndpoints.profile.exportJobs,
      payload
    );

    logger.info('Profile export job created', { id: response.id });
    return response;
  }

  /**
   * Get export job status
   */
  async getExportJob(jobId: string): Promise<ProfileExportJob> {
    const endpoint = adobeEndpoints.profile.exportJobById.replace('{JOB_ID}', jobId);
    return this.get<ProfileExportJob>(endpoint);
  }

  /**
   * List export jobs
   */
  async listExportJobs(): Promise<ProfileExportJob[]> {
    const response = await this.get<{ children?: ProfileExportJob[] }>(
      adobeEndpoints.profile.exportJobs
    );
    return response.children || [];
  }

  // ==========================================================================
  // Migration Helpers
  // ==========================================================================

  /**
   * Copy a merge policy to target organization
   */
  async copyMergePolicy(
    sourcePolicy: MergePolicy,
    conflictStrategy: 'skip' | 'overwrite' | 'rename' = 'skip'
  ): Promise<{
    policy: MergePolicy | null;
    action: 'created' | 'skipped' | 'updated' | 'renamed';
  }> {
    logger.info('Copying merge policy', { name: sourcePolicy.name });

    // Check if policy already exists
    const existingPolicy = await this.findMergePolicyByName(sourcePolicy.name);

    if (existingPolicy) {
      if (conflictStrategy === 'skip') {
        logger.info('Merge policy already exists, skipping', { name: sourcePolicy.name });
        return { policy: existingPolicy, action: 'skipped' };
      } else if (conflictStrategy === 'overwrite') {
        const updatedPolicy = await this.updateMergePolicy(existingPolicy.id, {
          name: sourcePolicy.name,
          schema: sourcePolicy.schema,
          identityGraph: sourcePolicy.identityGraph,
          attributeMerge: sourcePolicy.attributeMerge,
          activeOnEdge: sourcePolicy.activeOnEdge,
        });
        return { policy: updatedPolicy, action: 'updated' };
      } else if (conflictStrategy === 'rename') {
        const newPolicy = await this.createMergePolicy({
          name: `${sourcePolicy.name} (Migrated)`,
          schema: sourcePolicy.schema,
          identityGraph: sourcePolicy.identityGraph,
          attributeMerge: sourcePolicy.attributeMerge,
          activeOnEdge: sourcePolicy.activeOnEdge,
        });
        return { policy: newPolicy, action: 'renamed' };
      }
    }

    // Create new policy
    const newPolicy = await this.createMergePolicy({
      name: sourcePolicy.name,
      schema: sourcePolicy.schema,
      identityGraph: sourcePolicy.identityGraph,
      attributeMerge: sourcePolicy.attributeMerge,
      default: false, // Don't set as default in target
      activeOnEdge: sourcePolicy.activeOnEdge,
    });

    return { policy: newPolicy, action: 'created' };
  }

  /**
   * Copy a computed attribute to target organization
   */
  async copyComputedAttribute(
    sourceAttribute: ComputedAttribute,
    conflictStrategy: 'skip' | 'overwrite' | 'rename' = 'skip'
  ): Promise<{
    attribute: ComputedAttribute | null;
    action: 'created' | 'skipped' | 'updated' | 'renamed';
  }> {
    logger.info('Copying computed attribute', { name: sourceAttribute.name });

    // Check if attribute already exists
    const existingAttribute = await this.findComputedAttributeByName(sourceAttribute.name);

    if (existingAttribute) {
      if (conflictStrategy === 'skip') {
        logger.info('Computed attribute already exists, skipping', {
          name: sourceAttribute.name,
        });
        return { attribute: existingAttribute, action: 'skipped' };
      } else if (conflictStrategy === 'overwrite') {
        const updatedAttribute = await this.updateComputedAttribute(existingAttribute.id, {
          displayName: sourceAttribute.displayName,
          description: sourceAttribute.description,
          expression: sourceAttribute.expression,
          mergeFunction: sourceAttribute.mergeFunction,
          duration: sourceAttribute.duration,
          path: sourceAttribute.path,
          schema: sourceAttribute.schema,
          keepCurrent: sourceAttribute.keepCurrent,
        });
        return { attribute: updatedAttribute, action: 'updated' };
      } else if (conflictStrategy === 'rename') {
        const newAttribute = await this.createComputedAttribute({
          name: `${sourceAttribute.name}_migrated`,
          displayName: `${sourceAttribute.displayName} (Migrated)`,
          description: sourceAttribute.description,
          expression: sourceAttribute.expression,
          mergeFunction: sourceAttribute.mergeFunction,
          duration: sourceAttribute.duration,
          path: sourceAttribute.path,
          schema: sourceAttribute.schema,
          keepCurrent: sourceAttribute.keepCurrent,
        });
        return { attribute: newAttribute, action: 'renamed' };
      }
    }

    // Create new attribute
    const newAttribute = await this.createComputedAttribute({
      name: sourceAttribute.name,
      displayName: sourceAttribute.displayName,
      description: sourceAttribute.description,
      expression: sourceAttribute.expression,
      mergeFunction: sourceAttribute.mergeFunction,
      duration: sourceAttribute.duration,
      path: sourceAttribute.path,
      schema: sourceAttribute.schema,
      keepCurrent: sourceAttribute.keepCurrent,
    });

    return { attribute: newAttribute, action: 'created' };
  }

  /**
   * Get merge policy mapping between source and target
   * Used for transforming policy references during migration
   */
  async getMergePolicyMapping(
    sourcePolicies: MergePolicy[]
  ): Promise<Map<string, string>> {
    const targetPolicies = await this.listMergePolicies();
    const mapping = new Map<string, string>();

    for (const sourcePolicy of sourcePolicies) {
      const targetPolicy = targetPolicies.find((p) => p.name === sourcePolicy.name);
      if (targetPolicy) {
        mapping.set(sourcePolicy.id, targetPolicy.id);
      }
    }

    logger.info(`Created merge policy mapping for ${mapping.size} policies`);
    return mapping;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createProfileService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName: string
): ProfileService {
  return new ProfileService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
