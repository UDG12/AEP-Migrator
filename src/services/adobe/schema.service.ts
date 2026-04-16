import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type { Schema, FieldGroup, AdobeApiResponse } from '@/types';

const logger = createLogger('SchemaService');

// ============================================================================
// Types
// ============================================================================

interface SchemaRegistryResponse {
  results: Schema[] | FieldGroup[];
  _page?: {
    count: number;
  };
  _links?: {
    next?: { href: string };
  };
}

interface CreateSchemaPayload {
  title: string;
  description?: string;
  type: string;
  allOf: Array<{ $ref: string }>;
  'meta:extends'?: string[];
  'meta:immutableTags'?: string[];
  'meta:class'?: string;
  definitions?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

interface SchemaDescriptor {
  '@id': string;
  '@type': string;
  'xdm:sourceSchema': string;
  'xdm:sourceVersion': number;
  'xdm:sourceProperty'?: string;
  'xdm:namespace'?: string;
  'xdm:property'?: string;
  'xdm:isPrimary'?: boolean;
}

interface CreateDescriptorPayload {
  '@type': string;
  'xdm:sourceSchema': string;
  'xdm:sourceVersion': number;
  'xdm:sourceProperty'?: string;
  'xdm:namespace'?: string;
  'xdm:property'?: string;
  'xdm:isPrimary'?: boolean;
}

interface CreateFieldGroupPayload {
  title: string;
  description?: string;
  type: string;
  definitions: Record<string, unknown>;
  allOf?: Array<{ $ref: string }>;
  meta?: {
    intendedToExtend?: string[];
    abstract?: boolean;
    extensible?: boolean;
    [key: string]: unknown;
  };
}

// ============================================================================
// Schema Registry Service
// ============================================================================

export class SchemaService extends AdobeBaseClient {
  constructor(options: Omit<ClientOptions, 'baseUrl' | 'isReactor' | 'isSchemaRegistry'>) {
    super({
      ...options,
      baseUrl: config.adobe.platformUrl,
      isReactor: false,
      isSchemaRegistry: true,
    });
  }

  // ==========================================================================
  // Schemas
  // ==========================================================================

  /**
   * Fetch all tenant schemas
   */
  async listSchemas(): Promise<Schema[]> {
    logger.info('Fetching all tenant schemas');

    const schemas = await this.fetchAllPages<Schema>(
      adobeEndpoints.platform.schemas,
      { limit: 100 },
      (response) => (response as unknown as SchemaRegistryResponse).results as Schema[]
    );

    logger.info(`Found ${schemas.length} schemas`);
    return schemas;
  }

  /**
   * Get a single schema by ID
   */
  async getSchema(schemaId: string): Promise<Schema> {
    logger.debug('Fetching schema', { schemaId });

    // Schema IDs are URL-encoded
    const encodedId = encodeURIComponent(schemaId);
    return this.get<Schema>(`${adobeEndpoints.platform.schemas}/${encodedId}`);
  }

  /**
   * Get full schema details including all references (for migration)
   */
  async getSchemaFull(schemaId: string): Promise<any> {
    logger.debug('Fetching full schema', { schemaId });

    // Schema IDs are URL-encoded
    const encodedId = encodeURIComponent(schemaId);
    return this.getFullSchema<any>(`${adobeEndpoints.platform.schemas}/${encodedId}`);
  }

  /**
   * Create a new schema
   */
  async createSchema(payload: CreateSchemaPayload | Record<string, unknown>): Promise<Schema> {
    logger.info('Creating schema', { title: (payload as any).title });
    logger.debug('Schema create payload', { payload: JSON.stringify(payload) });

    const response = await this.post<Schema>(
      adobeEndpoints.platform.schemas,
      payload
    );

    logger.info('Schema created successfully', { $id: response.$id });
    return response;
  }

  /**
   * Check if a schema exists by title
   */
  async findSchemaByTitle(title: string): Promise<Schema | null> {
    const schemas = await this.listSchemas();
    return schemas.find((s) => s.title === title) || null;
  }

  /**
   * Copy a schema from source to target
   * This handles transforming IDs and references
   */
  async copySchema(
    sourceSchema: Schema,
    idMappings: Map<string, string>
  ): Promise<Schema> {
    logger.info('Copying schema', { title: sourceSchema.title });

    // Transform allOf references to use target IDs
    const transformedAllOf = sourceSchema.allOf?.map((ref) => {
      const sourceRef = ref.$ref;
      const targetRef = idMappings.get(sourceRef) || sourceRef;
      return { $ref: targetRef };
    }) || [];

    const payload: CreateSchemaPayload = {
      title: sourceSchema.title,
      description: sourceSchema.description,
      type: sourceSchema.type,
      allOf: transformedAllOf,
    };

    return this.createSchema(payload);
  }

  // ==========================================================================
  // Field Groups
  // ==========================================================================

  /**
   * Fetch all tenant field groups
   */
  async listFieldGroups(): Promise<FieldGroup[]> {
    logger.info('Fetching all tenant field groups');

    const fieldGroups = await this.fetchAllPages<FieldGroup>(
      adobeEndpoints.platform.fieldGroups,
      { limit: 100 },
      (response) => (response as unknown as SchemaRegistryResponse).results as FieldGroup[]
    );

    logger.info(`Found ${fieldGroups.length} field groups`);
    return fieldGroups;
  }

  /**
   * Get a single field group by ID
   */
  async getFieldGroup(fieldGroupId: string): Promise<FieldGroup> {
    logger.debug('Fetching field group', { fieldGroupId });

    const encodedId = encodeURIComponent(fieldGroupId);
    return this.get<FieldGroup>(
      `${adobeEndpoints.platform.fieldGroups}/${encodedId}`
    );
  }

  /**
   * Get full field group details including all properties (for migration)
   */
  async getFieldGroupFull(fieldGroupId: string): Promise<any> {
    logger.debug('Fetching full field group', { fieldGroupId });

    const encodedId = encodeURIComponent(fieldGroupId);
    return this.getFullSchema<any>(
      `${adobeEndpoints.platform.fieldGroups}/${encodedId}`
    );
  }

  /**
   * Create a new field group
   */
  async createFieldGroup(payload: CreateFieldGroupPayload | Record<string, unknown>): Promise<FieldGroup> {
    logger.info('Creating field group', { title: (payload as any).title });
    logger.debug('Field group create payload', { payload: JSON.stringify(payload) });

    const response = await this.post<FieldGroup>(
      adobeEndpoints.platform.fieldGroups,
      payload
    );

    logger.info('Field group created successfully', { $id: response.$id });
    return response;
  }

  /**
   * Check if a field group exists by title
   */
  async findFieldGroupByTitle(title: string): Promise<FieldGroup | null> {
    const fieldGroups = await this.listFieldGroups();
    return fieldGroups.find((fg) => fg.title === title) || null;
  }

  /**
   * Copy a field group from source to target
   */
  async copyFieldGroup(
    sourceFieldGroup: FieldGroup,
    idMappings: Map<string, string>
  ): Promise<FieldGroup> {
    logger.info('Copying field group', { title: sourceFieldGroup.title });

    // Transform allOf references if present
    const transformedAllOf = sourceFieldGroup.allOf?.map((ref) => {
      const sourceRef = ref.$ref;
      const targetRef = idMappings.get(sourceRef) || sourceRef;
      return { $ref: targetRef };
    });

    const payload: CreateFieldGroupPayload = {
      title: sourceFieldGroup.title,
      description: sourceFieldGroup.description,
      type: sourceFieldGroup.type,
      definitions: sourceFieldGroup.definitions || {},
      allOf: transformedAllOf,
      meta: {
        intendedToExtend: sourceFieldGroup.meta?.intendedToExtend,
        abstract: sourceFieldGroup.meta?.abstract,
        extensible: sourceFieldGroup.meta?.extensible,
      },
    };

    return this.createFieldGroup(payload);
  }

  // ==========================================================================
  // Global Schemas (for reference)
  // ==========================================================================

  /**
   * List global schemas (XDM standard schemas)
   */
  async listGlobalSchemas(): Promise<Schema[]> {
    logger.info('Fetching global schemas');

    const schemas = await this.fetchAllPages<Schema>(
      adobeEndpoints.platform.globalSchemas,
      { limit: 100 },
      (response) => (response as unknown as SchemaRegistryResponse).results as Schema[]
    );

    return schemas;
  }

  /**
   * List global field groups
   */
  async listGlobalFieldGroups(): Promise<FieldGroup[]> {
    logger.info('Fetching global field groups');

    const fieldGroups = await this.fetchAllPages<FieldGroup>(
      adobeEndpoints.platform.globalFieldGroups,
      { limit: 100 },
      (response) => (response as unknown as SchemaRegistryResponse).results as FieldGroup[]
    );

    return fieldGroups;
  }

  // ==========================================================================
  // Schema Descriptors (Identity fields, etc.)
  // ==========================================================================

  /**
   * Get all descriptors for a schema
   */
  async getSchemaDescriptors(schemaId: string): Promise<SchemaDescriptor[]> {
    logger.info('Fetching descriptors for schema', { schemaId });

    try {
      const encodedSchemaId = encodeURIComponent(schemaId);
      const response = await this.get<any>(
        `/data/foundation/schemaregistry/tenant/descriptors`,
        { 'schema-id': schemaId }
      );

      const descriptors = response.results || [];
      logger.info(`Found ${descriptors.length} descriptors for schema`);
      return descriptors;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Create a descriptor (identity field, relationship, etc.)
   */
  async createDescriptor(payload: CreateDescriptorPayload): Promise<SchemaDescriptor> {
    logger.info('Creating descriptor', { type: payload['@type'], schema: payload['xdm:sourceSchema'] });

    const response = await this.post<SchemaDescriptor>(
      `/data/foundation/schemaregistry/tenant/descriptors`,
      payload
    );

    logger.info('Descriptor created successfully', { id: response['@id'] });
    return response;
  }

  /**
   * Create descriptors in target schema from pre-fetched source descriptors
   * Use this when migrating between different orgs (source service fetches, target service creates)
   */
  async createDescriptorsFromSource(
    sourceDescriptors: SchemaDescriptor[],
    targetSchemaId: string,
    namespaceMapping?: Map<string, string>
  ): Promise<{ copied: number; failed: number }> {
    logger.info('Creating descriptors from source', {
      descriptorCount: sourceDescriptors.length,
      targetSchemaId
    });

    let copied = 0;
    let failed = 0;

    for (const descriptor of sourceDescriptors) {
      try {
        // Transform property paths if namespace mapping provided
        let sourceProperty = descriptor['xdm:sourceProperty'];
        if (sourceProperty && namespaceMapping) {
          for (const [sourceNs, targetNs] of namespaceMapping.entries()) {
            // Transform _tenantId in property paths
            sourceProperty = sourceProperty
              .replace(new RegExp(`/_${sourceNs}/`, 'g'), `/_${targetNs}/`)
              .replace(new RegExp(`/_${sourceNs}$`, 'g'), `/_${targetNs}`)
              .replace(new RegExp(`/${sourceNs}/`, 'g'), `/${targetNs}/`);
          }
        }

        const newDescriptor: CreateDescriptorPayload = {
          '@type': descriptor['@type'],
          'xdm:sourceSchema': targetSchemaId,
          'xdm:sourceVersion': 1,
        };

        // Copy optional fields based on descriptor type
        if (sourceProperty) {
          newDescriptor['xdm:sourceProperty'] = sourceProperty;
        }
        if (descriptor['xdm:namespace']) {
          newDescriptor['xdm:namespace'] = descriptor['xdm:namespace'];
        }
        if (descriptor['xdm:property']) {
          newDescriptor['xdm:property'] = descriptor['xdm:property'];
        }
        if (descriptor['xdm:isPrimary'] !== undefined) {
          newDescriptor['xdm:isPrimary'] = descriptor['xdm:isPrimary'];
        }

        await this.createDescriptor(newDescriptor);
        copied++;
        logger.info(`Created descriptor: ${descriptor['@type']}`, { sourceProperty });
      } catch (error: any) {
        // Check if descriptor already exists (409 conflict)
        if (error.response?.status === 409) {
          logger.info(`Descriptor already exists, skipping: ${descriptor['@type']}`);
          // Don't count as failure - it already exists
        } else {
          failed++;
          logger.warn(`Failed to create descriptor: ${error.message}`, {
            type: descriptor['@type'],
            sourceProperty: descriptor['xdm:sourceProperty'],
          });
        }
      }
    }

    logger.info(`Descriptor creation complete: ${copied} copied, ${failed} failed`);
    return { copied, failed };
  }

  // ==========================================================================
  // Profile Enablement
  // ==========================================================================

  /**
   * Check if a schema is enabled for Profile (union)
   */
  isSchemaProfileEnabled(schema: any): boolean {
    const immutableTags = schema['meta:immutableTags'] || [];
    return immutableTags.includes('union');
  }

  /**
   * Enable a schema for Real-Time Customer Profile
   * This is done via PATCH request to add union tag
   */
  async enableSchemaForProfile(schemaId: string): Promise<void> {
    logger.info('Enabling schema for Profile', { schemaId });

    const encodedId = encodeURIComponent(schemaId);

    // Use JSON Patch to add the union tag
    await this.patchSchema(
      `${adobeEndpoints.platform.schemas}/${encodedId}`,
      [
        {
          op: 'add',
          path: '/meta:immutableTags',
          value: ['union']
        }
      ]
    );

    logger.info('Schema enabled for Profile successfully');
  }

  /**
   * PATCH request for schema updates using JSON Patch operations
   * Uses the inherited patch method from AdobeBaseClient
   */
  private async patchSchema(path: string, operations: any[]): Promise<any> {
    return this.patch(path, operations);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSchemaService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName: string
): SchemaService {
  return new SchemaService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
