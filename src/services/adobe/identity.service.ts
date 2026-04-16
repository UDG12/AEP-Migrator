import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type {
  IdentityNamespace,
  IdentityCluster,
  IdentityClusterMember,
  IdentityMapping,
} from '@/types';

const logger = createLogger('IdentityService');

// ============================================================================
// Types
// ============================================================================

interface IdentityNamespaceResponse {
  results?: IdentityNamespace[];
  namespaces?: IdentityNamespace[];
}

interface CreateIdentityNamespacePayload {
  name: string;
  code: string;
  description?: string;
  idType: 'COOKIE' | 'DEVICE' | 'CROSS_DEVICE' | 'EMAIL' | 'PHONE' | 'NON_PEOPLE' | 'CUSTOM';
}

interface ClusterMembersRequest {
  xids?: Array<{ xid: string }>;
  compositeXids?: Array<{ nsid: number; id: string }>;
  graph?: 'Private Graph' | 'COOP' | 'PDG' | 'none';
}

interface ClusterMembersResponse {
  unprocessedXids?: string[];
  unprocessedCompositeXids?: Array<{ nsid: number; id: string }>;
  xidsClusterHistory?: Array<{
    xid: string;
    clusterHistory: IdentityCluster[];
  }>;
  version: number;
}

// ============================================================================
// Identity Service
// ============================================================================

/**
 * Adobe Identity Service API Client
 *
 * Handles identity namespaces, clusters, and identity graph operations.
 * Identity namespaces are critical for profile stitching across devices and channels.
 *
 * Note: Identity Service uses region-specific endpoints (VA7, NLD2).
 * The region is determined by the organization's configuration.
 */
export class IdentityService extends AdobeBaseClient {
  private region: 'VA7' | 'NLD2';

  constructor(
    options: Omit<ClientOptions, 'baseUrl' | 'isReactor' | 'isSchemaRegistry'> & {
      region?: 'VA7' | 'NLD2';
    }
  ) {
    super({
      ...options,
      baseUrl: config.adobe.platformUrl,
      isReactor: false,
      isSchemaRegistry: false,
    });
    this.region = options.region || 'VA7';
  }

  // ==========================================================================
  // Identity Namespaces
  // ==========================================================================

  /**
   * List all identity namespaces for the organization
   * Includes both standard (Adobe) and custom namespaces
   */
  async listNamespaces(): Promise<IdentityNamespace[]> {
    logger.info('Fetching all identity namespaces');

    try {
      const response = await this.get<IdentityNamespace[] | IdentityNamespaceResponse>(
        adobeEndpoints.identity.namespaces
      );

      // Handle different response formats
      let namespaces: IdentityNamespace[];
      if (Array.isArray(response)) {
        namespaces = response;
      } else if (response.results) {
        namespaces = response.results;
      } else if (response.namespaces) {
        namespaces = response.namespaces;
      } else {
        namespaces = [];
      }

      logger.info(`Found ${namespaces.length} identity namespaces`);
      return namespaces;
    } catch (error: any) {
      logger.error('Failed to fetch identity namespaces', { error: error.message });
      throw error;
    }
  }

  /**
   * List only custom identity namespaces (excludes standard Adobe namespaces)
   */
  async listCustomNamespaces(): Promise<IdentityNamespace[]> {
    const allNamespaces = await this.listNamespaces();
    const customNamespaces = allNamespaces.filter((ns) => ns.custom === true);

    logger.info(`Found ${customNamespaces.length} custom identity namespaces`);
    return customNamespaces;
  }

  /**
   * List only standard (Adobe) identity namespaces
   */
  async listStandardNamespaces(): Promise<IdentityNamespace[]> {
    const allNamespaces = await this.listNamespaces();
    const standardNamespaces = allNamespaces.filter((ns) => ns.custom === false);

    logger.info(`Found ${standardNamespaces.length} standard identity namespaces`);
    return standardNamespaces;
  }

  /**
   * Get a single identity namespace by code
   */
  async getNamespace(namespaceCode: string): Promise<IdentityNamespace> {
    logger.debug('Fetching identity namespace', { namespaceCode });

    const endpoint = adobeEndpoints.identity.namespaceById.replace(
      '{NAMESPACE_CODE}',
      namespaceCode
    );

    return this.get<IdentityNamespace>(endpoint);
  }

  /**
   * Get a namespace by ID
   */
  async getNamespaceById(namespaceId: number): Promise<IdentityNamespace | null> {
    const namespaces = await this.listNamespaces();
    return namespaces.find((ns) => ns.id === namespaceId) || null;
  }

  /**
   * Create a new custom identity namespace
   */
  async createNamespace(
    payload: CreateIdentityNamespacePayload
  ): Promise<IdentityNamespace> {
    logger.info('Creating identity namespace', { name: payload.name, code: payload.code });

    const response = await this.post<IdentityNamespace>(
      adobeEndpoints.identity.namespaces,
      payload
    );

    logger.info('Identity namespace created successfully', {
      id: response.id,
      code: response.code,
    });
    return response;
  }

  /**
   * Update an existing identity namespace
   */
  async updateNamespace(
    namespaceCode: string,
    updates: Partial<CreateIdentityNamespacePayload>
  ): Promise<IdentityNamespace> {
    logger.info('Updating identity namespace', { namespaceCode });

    const endpoint = adobeEndpoints.identity.namespaceById.replace(
      '{NAMESPACE_CODE}',
      namespaceCode
    );

    const response = await this.put<IdentityNamespace>(endpoint, updates);

    logger.info('Identity namespace updated successfully', { code: namespaceCode });
    return response;
  }

  /**
   * Check if a namespace exists by code
   */
  async findNamespaceByCode(code: string): Promise<IdentityNamespace | null> {
    const namespaces = await this.listNamespaces();
    return namespaces.find((ns) => ns.code === code) || null;
  }

  /**
   * Check if a namespace exists by name
   */
  async findNamespaceByName(name: string): Promise<IdentityNamespace | null> {
    const namespaces = await this.listNamespaces();
    return namespaces.find((ns) => ns.name === name) || null;
  }

  // ==========================================================================
  // Identity Clusters
  // ==========================================================================

  /**
   * Get cluster members for a set of identities
   * Returns all linked identities for the given identity
   */
  async getClusterMembers(
    xids: string[],
    graphType: 'Private Graph' | 'COOP' | 'PDG' | 'none' = 'Private Graph'
  ): Promise<IdentityCluster[]> {
    logger.info('Fetching cluster members', { count: xids.length, graphType });

    const request: ClusterMembersRequest = {
      xids: xids.map((xid) => ({ xid })),
      graph: graphType,
    };

    const response = await this.post<ClusterMembersResponse>(
      adobeEndpoints.identity.clusters,
      request
    );

    const clusters: IdentityCluster[] = [];
    if (response.xidsClusterHistory) {
      for (const entry of response.xidsClusterHistory) {
        if (entry.clusterHistory && entry.clusterHistory.length > 0) {
          clusters.push(...entry.clusterHistory);
        }
      }
    }

    logger.info(`Found ${clusters.length} cluster entries`);
    return clusters;
  }

  /**
   * Get cluster members by composite XID (namespace ID + identity value)
   */
  async getClusterMembersByCompositeXid(
    identities: Array<{ nsid: number; id: string }>,
    graphType: 'Private Graph' | 'COOP' | 'PDG' | 'none' = 'Private Graph'
  ): Promise<IdentityCluster[]> {
    logger.info('Fetching cluster members by composite XID', { count: identities.length });

    const request: ClusterMembersRequest = {
      compositeXids: identities,
      graph: graphType,
    };

    const response = await this.post<ClusterMembersResponse>(
      adobeEndpoints.identity.clusters,
      request
    );

    const clusters: IdentityCluster[] = [];
    if (response.xidsClusterHistory) {
      for (const entry of response.xidsClusterHistory) {
        if (entry.clusterHistory && entry.clusterHistory.length > 0) {
          clusters.push(...entry.clusterHistory);
        }
      }
    }

    return clusters;
  }

  // ==========================================================================
  // Identity Mapping (Graph Lookups)
  // ==========================================================================

  /**
   * Get identity mappings for an XID
   * Returns all identity links in the graph
   */
  async getIdentityMapping(xid: string): Promise<IdentityMapping | null> {
    logger.debug('Fetching identity mapping', { xid });

    try {
      const response = await this.get<IdentityMapping>(adobeEndpoints.identity.mapping, {
        xid,
      });

      return response;
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.debug('No identity mapping found', { xid });
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // Migration Helpers
  // ==========================================================================

  /**
   * Copy a custom identity namespace to target organization
   * Handles conflict resolution based on strategy
   */
  async copyNamespace(
    sourceNamespace: IdentityNamespace,
    conflictStrategy: 'skip' | 'overwrite' | 'rename' = 'skip'
  ): Promise<{ namespace: IdentityNamespace | null; action: 'created' | 'skipped' | 'renamed' }> {
    logger.info('Copying identity namespace', {
      name: sourceNamespace.name,
      code: sourceNamespace.code,
    });

    // Check if namespace already exists
    const existingNamespace = await this.findNamespaceByCode(sourceNamespace.code);

    if (existingNamespace) {
      if (conflictStrategy === 'skip') {
        logger.info('Namespace already exists, skipping', { code: sourceNamespace.code });
        return { namespace: existingNamespace, action: 'skipped' };
      } else if (conflictStrategy === 'rename') {
        // Create with modified code
        const newCode = `${sourceNamespace.code}_migrated_${Date.now()}`;
        const newNamespace = await this.createNamespace({
          name: `${sourceNamespace.name} (Migrated)`,
          code: newCode,
          description: sourceNamespace.description,
          idType: sourceNamespace.idType as CreateIdentityNamespacePayload['idType'],
        });
        return { namespace: newNamespace, action: 'renamed' };
      }
      // For 'overwrite', we can't really overwrite namespaces, so skip
      logger.warn('Cannot overwrite identity namespaces, skipping', {
        code: sourceNamespace.code,
      });
      return { namespace: existingNamespace, action: 'skipped' };
    }

    // Create new namespace
    const newNamespace = await this.createNamespace({
      name: sourceNamespace.name,
      code: sourceNamespace.code,
      description: sourceNamespace.description,
      idType: sourceNamespace.idType as CreateIdentityNamespacePayload['idType'],
    });

    return { namespace: newNamespace, action: 'created' };
  }

  /**
   * Get namespace mapping between source and target organizations
   * Used for transforming identity references during migration
   */
  async getNamespaceMapping(
    sourceNamespaces: IdentityNamespace[]
  ): Promise<Map<string, IdentityNamespace>> {
    const targetNamespaces = await this.listNamespaces();
    const mapping = new Map<string, IdentityNamespace>();

    for (const sourceNs of sourceNamespaces) {
      // First try to match by code
      const targetNs = targetNamespaces.find(
        (ns) => ns.code === sourceNs.code || ns.name === sourceNs.name
      );

      if (targetNs) {
        mapping.set(sourceNs.code, targetNs);
      }
    }

    logger.info(`Created namespace mapping for ${mapping.size} namespaces`);
    return mapping;
  }

  /**
   * Validate that required namespaces exist in target
   * Returns list of missing namespaces that need to be created
   */
  async validateNamespaces(
    requiredNamespaceCodes: string[]
  ): Promise<{ existing: string[]; missing: string[] }> {
    const targetNamespaces = await this.listNamespaces();
    const targetCodes = new Set(targetNamespaces.map((ns) => ns.code));

    const existing: string[] = [];
    const missing: string[] = [];

    for (const code of requiredNamespaceCodes) {
      if (targetCodes.has(code)) {
        existing.push(code);
      } else {
        missing.push(code);
      }
    }

    logger.info('Namespace validation complete', {
      existing: existing.length,
      missing: missing.length,
    });

    return { existing, missing };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createIdentityService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName: string,
  region?: 'VA7' | 'NLD2'
): IdentityService {
  return new IdentityService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
    region,
  });
}
