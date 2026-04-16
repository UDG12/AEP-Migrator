import { NextRequest, NextResponse } from 'next/server';
import {
  createSchemaService,
  createDatasetService,
  createAudienceService,
  createReactorService,
  createCJAConnectionService,
  createCJADataViewService,
  createCJASegmentService,
  createCJACalculatedMetricService,
  createIdentityService,
  createProfileService,
  createFlowService,
  createSandboxToolingService,
  createPolicyService,
} from '@/services/adobe';
import { createLogger } from '@/utils/logger';
import { config } from '@/config';

const logger = createLogger('API:Assets');
// Using in-memory storage (no MongoDB required)

// Access the global org store
declare global {
  var orgStore: Map<string, any> | undefined;
}

interface Asset {
  id: string;
  name: string;
  type: string;
  dependencies?: string[];
  // Additional details
  description?: string;
  owner?: string;
  createdDate?: string;
  modifiedDate?: string;
  tags?: string[];
  parentId?: string;
  parentName?: string;
  // CJA specific
  dataViewId?: string;
  dataViewName?: string;
  connectionId?: string;
  connectionName?: string;
  datasetsCount?: number;
  dimensionsCount?: number;
  metricsCount?: number;
}

// POST handler - accepts credentials directly (for serverless environments)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { credentials, type: assetType } = body;

    if (!credentials || !credentials.accessToken) {
      return NextResponse.json(
        { error: 'Credentials with access token are required' },
        { status: 400 }
      );
    }

    const accessToken = credentials.accessToken;
    const assets: Asset[] = [];

    logger.info('Fetching assets (POST)', { orgId: credentials.orgId, assetType: assetType || 'all' });

    // If specific type requested, only fetch that type
    if (assetType) {
      switch (assetType) {
        case 'schemas':
          try {
            const schemas = await fetchSchemas(accessToken, credentials);
            assets.push(...schemas);
          } catch (e) {
            logger.warn('Failed to fetch schemas', { error: e });
          }
          break;
        case 'fieldGroups':
          try {
            const fieldGroups = await fetchFieldGroups(accessToken, credentials);
            assets.push(...fieldGroups);
          } catch (e) {
            logger.warn('Failed to fetch field groups', { error: e });
          }
          break;
        case 'datasets':
          try {
            const datasets = await fetchDatasets(accessToken, credentials);
            assets.push(...datasets);
          } catch (e) {
            logger.warn('Failed to fetch datasets', { error: e });
          }
          break;
        case 'audiences':
          try {
            const audiences = await fetchAudiences(accessToken, credentials);
            assets.push(...audiences);
          } catch (e) {
            logger.warn('Failed to fetch audiences', { error: e });
          }
          break;
        case 'launchHierarchy':
          try {
            const hierarchy = await fetchLaunchHierarchy(accessToken, credentials);
            return NextResponse.json(hierarchy);
          } catch (e) {
            logger.warn('Failed to fetch launch hierarchy', { error: e });
            return NextResponse.json([]);
          }
        case 'cjaFlat':
          try {
            const cjaFlat = await fetchCJAFlat(accessToken, credentials);
            return NextResponse.json(cjaFlat);
          } catch (e) {
            logger.warn('Failed to fetch CJA flat data', { error: e });
            return NextResponse.json({
              connections: [],
              dataViews: [],
              segments: [],
              filters: [],
              calculatedMetrics: [],
              projects: [],
            });
          }
        case 'identityNamespaces':
          try {
            const namespaces = await fetchIdentityNamespaces(accessToken, credentials);
            assets.push(...namespaces);
          } catch (e) {
            logger.warn('Failed to fetch identity namespaces', { error: e });
          }
          break;
        case 'mergePolicies':
          try {
            const policies = await fetchMergePolicies(accessToken, credentials);
            assets.push(...policies);
          } catch (e) {
            logger.warn('Failed to fetch merge policies', { error: e });
          }
          break;
        case 'computedAttributes':
          try {
            const attrs = await fetchComputedAttributes(accessToken, credentials);
            assets.push(...attrs);
          } catch (e) {
            logger.warn('Failed to fetch computed attributes', { error: e });
          }
          break;
        case 'connections':
          try {
            const flowConnections = await fetchFlowConnections(accessToken, credentials);
            assets.push(...flowConnections);
          } catch (e) {
            logger.warn('Failed to fetch flow connections', { error: e });
          }
          break;
        case 'dataFlows':
          try {
            const flows = await fetchDataFlows(accessToken, credentials);
            assets.push(...flows);
          } catch (e) {
            logger.warn('Failed to fetch data flows', { error: e });
          }
          break;
        case 'sandboxes':
          try {
            const sandboxes = await fetchSandboxes(accessToken, credentials);
            assets.push(...sandboxes);
          } catch (e) {
            logger.warn('Failed to fetch sandboxes', { error: e });
          }
          break;
        case 'dataUsageLabels':
          try {
            const labels = await fetchDataUsageLabels(accessToken, credentials);
            assets.push(...labels);
          } catch (e) {
            logger.warn('Failed to fetch data usage labels', { error: e });
          }
          break;
        case 'governancePolicies':
          try {
            const govPolicies = await fetchGovernancePolicies(accessToken, credentials);
            assets.push(...govPolicies);
          } catch (e) {
            logger.warn('Failed to fetch governance policies', { error: e });
          }
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid asset type' },
            { status: 400 }
          );
      }
    }

    logger.info('Assets fetched successfully (POST)', { type: assetType || 'all', count: assets.length });

    return NextResponse.json(assets);
  } catch (error) {
    logger.error('Error fetching assets (POST)', { error });

    return NextResponse.json(
      { error: 'Failed to fetch assets' },
      { status: 500 }
    );
  }
}

// GET handler - uses in-memory store (kept for backward compatibility)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');
    const assetType = searchParams.get('type'); // Optional: load specific asset type

    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    // Find organization in memory store
    const orgStore = global.orgStore;
    if (!orgStore) {
      return NextResponse.json(
        { error: 'No organizations configured. Use POST with credentials for serverless environments.' },
        { status: 404 }
      );
    }

    // Find the org by ID
    let organization: any = null;
    for (const [key, org] of orgStore.entries()) {
      if (org.id === orgId) {
        organization = org;
        break;
      }
    }

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found. Use POST with credentials for serverless environments.' },
        { status: 404 }
      );
    }

    const accessToken = organization.accessToken;
    const credentials = organization.credentials;
    const assets: Asset[] = [];

    logger.info('Fetching assets from organization', { orgId: credentials.orgId, assetType: assetType || 'all' });

    // If specific type requested, only fetch that type
    if (assetType) {
      switch (assetType) {
        case 'schemas':
          try {
            const schemas = await fetchSchemas(accessToken, credentials);
            assets.push(...schemas);
          } catch (e) {
            logger.warn('Failed to fetch schemas', { error: e });
          }
          break;
        case 'fieldGroups':
          try {
            const fieldGroups = await fetchFieldGroups(accessToken, credentials);
            assets.push(...fieldGroups);
          } catch (e) {
            logger.warn('Failed to fetch field groups', { error: e });
          }
          break;
        case 'datasets':
          try {
            const datasets = await fetchDatasets(accessToken, credentials);
            assets.push(...datasets);
          } catch (e) {
            logger.warn('Failed to fetch datasets', { error: e });
          }
          break;
        case 'audiences':
          try {
            const audiences = await fetchAudiences(accessToken, credentials);
            assets.push(...audiences);
          } catch (e) {
            logger.warn('Failed to fetch audiences', { error: e });
          }
          break;
        case 'launchProperties':
          try {
            const properties = await fetchLaunchProperties(accessToken, credentials);
            assets.push(...properties);
          } catch (e) {
            logger.warn('Failed to fetch launch properties', { error: e });
          }
          break;
        case 'launchExtensions':
          try {
            const extensions = await fetchLaunchExtensions(accessToken, credentials);
            assets.push(...extensions);
          } catch (e) {
            logger.warn('Failed to fetch launch extensions', { error: e });
          }
          break;
        case 'launchDataElements':
          try {
            const dataElements = await fetchLaunchDataElements(accessToken, credentials);
            assets.push(...dataElements);
          } catch (e) {
            logger.warn('Failed to fetch launch data elements', { error: e });
          }
          break;
        case 'launchRules':
          try {
            const rules = await fetchLaunchRules(accessToken, credentials);
            assets.push(...rules);
          } catch (e) {
            logger.warn('Failed to fetch launch rules', { error: e });
          }
          break;
        case 'launchHierarchy':
          // Return hierarchical Launch data for better visualization
          try {
            const hierarchy = await fetchLaunchHierarchy(accessToken, credentials);
            return NextResponse.json(hierarchy);
          } catch (e) {
            logger.warn('Failed to fetch launch hierarchy', { error: e });
            return NextResponse.json([]);
          }
        // CJA Asset Types
        case 'cjaConnections':
          try {
            const cjaConnections = await fetchCJAConnections(accessToken, credentials);
            assets.push(...cjaConnections);
          } catch (e) {
            logger.warn('Failed to fetch CJA connections', { error: e });
          }
          break;
        case 'cjaDataViews':
          try {
            const cjaDataViews = await fetchCJADataViews(accessToken, credentials);
            assets.push(...cjaDataViews);
          } catch (e) {
            logger.warn('Failed to fetch CJA data views', { error: e });
          }
          break;
        case 'cjaSegments':
          try {
            const cjaSegments = await fetchCJASegments(accessToken, credentials);
            assets.push(...cjaSegments);
          } catch (e) {
            logger.warn('Failed to fetch CJA segments', { error: e });
          }
          break;
        case 'cjaFilters':
          try {
            const cjaFilters = await fetchCJAFilters(accessToken, credentials);
            assets.push(...cjaFilters);
          } catch (e) {
            logger.warn('Failed to fetch CJA filters', { error: e });
          }
          break;
        case 'cjaCalculatedMetrics':
          try {
            const cjaCalcMetrics = await fetchCJACalculatedMetrics(accessToken, credentials);
            assets.push(...cjaCalcMetrics);
          } catch (e) {
            logger.warn('Failed to fetch CJA calculated metrics', { error: e });
          }
          break;
        case 'cjaHierarchy':
          // Return hierarchical CJA data (Connection -> DataViews -> Segments)
          try {
            const cjaHierarchy = await fetchCJAHierarchy(accessToken, credentials);
            return NextResponse.json(cjaHierarchy);
          } catch (e) {
            logger.warn('Failed to fetch CJA hierarchy', { error: e });
            return NextResponse.json([]);
          }
        case 'cjaFlat':
          // Return flat CJA data with full details for separate sections
          try {
            const cjaFlat = await fetchCJAFlat(accessToken, credentials);
            return NextResponse.json(cjaFlat);
          } catch (e) {
            logger.warn('Failed to fetch CJA flat data', { error: e });
            return NextResponse.json({
              connections: [],
              dataViews: [],
              segments: [],
              filters: [],
              calculatedMetrics: [],
              projects: [],
            });
          }
        // New AEP Service Asset Types
        case 'identityNamespaces':
          try {
            const namespaces = await fetchIdentityNamespaces(accessToken, credentials);
            assets.push(...namespaces);
          } catch (e) {
            logger.warn('Failed to fetch identity namespaces', { error: e });
          }
          break;
        case 'mergePolicies':
          try {
            const policies = await fetchMergePolicies(accessToken, credentials);
            assets.push(...policies);
          } catch (e) {
            logger.warn('Failed to fetch merge policies', { error: e });
          }
          break;
        case 'computedAttributes':
          try {
            const attrs = await fetchComputedAttributes(accessToken, credentials);
            assets.push(...attrs);
          } catch (e) {
            logger.warn('Failed to fetch computed attributes', { error: e });
          }
          break;
        case 'connections':
          try {
            const flowConnections = await fetchFlowConnections(accessToken, credentials);
            assets.push(...flowConnections);
          } catch (e) {
            logger.warn('Failed to fetch flow connections', { error: e });
          }
          break;
        case 'dataFlows':
          try {
            const flows = await fetchDataFlows(accessToken, credentials);
            assets.push(...flows);
          } catch (e) {
            logger.warn('Failed to fetch data flows', { error: e });
          }
          break;
        case 'sandboxes':
          try {
            const sandboxes = await fetchSandboxes(accessToken, credentials);
            assets.push(...sandboxes);
          } catch (e) {
            logger.warn('Failed to fetch sandboxes', { error: e });
          }
          break;
        case 'dataUsageLabels':
          try {
            const labels = await fetchDataUsageLabels(accessToken, credentials);
            assets.push(...labels);
          } catch (e) {
            logger.warn('Failed to fetch data usage labels', { error: e });
          }
          break;
        case 'governancePolicies':
          try {
            const govPolicies = await fetchGovernancePolicies(accessToken, credentials);
            assets.push(...govPolicies);
          } catch (e) {
            logger.warn('Failed to fetch governance policies', { error: e });
          }
          break;
        default:
          return NextResponse.json(
            { error: 'Invalid asset type' },
            { status: 400 }
          );
      }
    } else {
      // Legacy: fetch all at once (kept for backward compatibility)
      const [schemas, fieldGroups, datasets, audiences] = await Promise.allSettled([
        fetchSchemas(accessToken, credentials),
        fetchFieldGroups(accessToken, credentials),
        fetchDatasets(accessToken, credentials),
        fetchAudiences(accessToken, credentials),
      ]);

      if (schemas.status === 'fulfilled') assets.push(...schemas.value);
      if (fieldGroups.status === 'fulfilled') assets.push(...fieldGroups.value);
      if (datasets.status === 'fulfilled') assets.push(...datasets.value);
      if (audiences.status === 'fulfilled') assets.push(...audiences.value);

      try {
        const launchAssets = await fetchLaunchAssets(accessToken, credentials);
        assets.push(...launchAssets);
      } catch (error) {
        logger.warn('Failed to fetch Launch assets', { error });
      }
    }

    logger.info('Assets fetched successfully', { type: assetType || 'all', count: assets.length });

    return NextResponse.json(assets);
  } catch (error) {
    logger.error('Error fetching assets', { error });

    return NextResponse.json(
      { error: 'Failed to fetch assets' },
      { status: 500 }
    );
  }
}

async function fetchSchemas(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createSchemaService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const schemas = await service.listSchemas();

  return schemas.map((schema) => ({
    id: schema.$id,
    name: schema.title,
    type: 'schema',
    dependencies: schema.allOf?.map((ref) => ref.$ref) || [],
  }));
}

async function fetchFieldGroups(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createSchemaService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const fieldGroups = await service.listFieldGroups();

  return fieldGroups.map((fg) => ({
    id: fg.$id,
    name: fg.title,
    type: 'fieldGroup',
  }));
}

async function fetchDatasets(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createDatasetService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const datasets = await service.listDatasets();

  return datasets.map((dataset) => ({
    id: dataset.id,
    name: dataset.name,
    type: 'dataset',
    dependencies: dataset.schemaRef?.id ? [dataset.schemaRef.id] : [],
  }));
}

async function fetchAudiences(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createAudienceService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const audiences = await service.listAudiences();

  return audiences.map((audience) => ({
    id: audience.id,
    name: audience.name,
    type: 'audience',
  }));
}

// Store properties in memory for subsequent Launch calls
declare global {
  var launchPropertiesCache: Map<string, any[]> | undefined;
}

if (!global.launchPropertiesCache) {
  global.launchPropertiesCache = new Map();
}

/**
 * Fetch all Launch assets (legacy function for backward compatibility)
 */
async function fetchLaunchAssets(
  accessToken: string,
  credentials: { clientId: string; orgId: string }
): Promise<Asset[]> {
  const assets: Asset[] = [];

  try {
    const properties = await fetchLaunchProperties(accessToken, credentials);
    assets.push(...properties);
  } catch (e) {
    logger.warn('Failed to fetch launch properties', { error: e });
  }

  try {
    const extensions = await fetchLaunchExtensions(accessToken, credentials);
    assets.push(...extensions);
  } catch (e) {
    logger.warn('Failed to fetch launch extensions', { error: e });
  }

  try {
    const dataElements = await fetchLaunchDataElements(accessToken, credentials);
    assets.push(...dataElements);
  } catch (e) {
    logger.warn('Failed to fetch launch data elements', { error: e });
  }

  try {
    const rules = await fetchLaunchRules(accessToken, credentials);
    assets.push(...rules);
  } catch (e) {
    logger.warn('Failed to fetch launch rules', { error: e });
  }

  return assets;
}

async function fetchLaunchProperties(
  accessToken: string,
  credentials: { clientId: string; orgId: string }
): Promise<Asset[]> {
  const service = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const properties = await service.listProperties();

  // Cache properties for subsequent calls
  global.launchPropertiesCache!.set(credentials.orgId, properties);

  return properties.map((property) => ({
    id: property.id,
    name: property.attributes.name,
    type: 'launchProperty',
  }));
}

async function fetchLaunchExtensions(
  accessToken: string,
  credentials: { clientId: string; orgId: string }
): Promise<Asset[]> {
  const service = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const assets: Asset[] = [];

  // Get cached properties or fetch them
  let properties = global.launchPropertiesCache?.get(credentials.orgId);
  if (!properties) {
    properties = await service.listProperties();
    global.launchPropertiesCache!.set(credentials.orgId, properties);
  }

  for (const property of properties) {
    try {
      const extensions = await service.listExtensions(property.id);
      for (const extension of extensions) {
        assets.push({
          id: extension.id,
          name: `${property.attributes.name} / ${extension.attributes.displayName || extension.attributes.name}`,
          type: 'launchExtension',
          dependencies: [property.id],
        });
      }
    } catch (e) {
      logger.warn('Failed to fetch extensions for property', { propertyId: property.id });
    }
  }

  return assets;
}

async function fetchLaunchDataElements(
  accessToken: string,
  credentials: { clientId: string; orgId: string }
): Promise<Asset[]> {
  const service = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const assets: Asset[] = [];

  // Get cached properties or fetch them
  let properties = global.launchPropertiesCache?.get(credentials.orgId);
  if (!properties) {
    properties = await service.listProperties();
    global.launchPropertiesCache!.set(credentials.orgId, properties);
  }

  for (const property of properties) {
    try {
      const dataElements = await service.listDataElements(property.id);
      for (const de of dataElements) {
        assets.push({
          id: de.id,
          name: `${property.attributes.name} / ${de.attributes.name}`,
          type: 'launchDataElement',
          dependencies: [property.id, de.relationships?.extension?.data?.id].filter(Boolean),
        });
      }
    } catch (e) {
      logger.warn('Failed to fetch data elements for property', { propertyId: property.id });
    }
  }

  return assets;
}

async function fetchLaunchRules(
  accessToken: string,
  credentials: { clientId: string; orgId: string }
): Promise<Asset[]> {
  const service = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const assets: Asset[] = [];

  // Get cached properties or fetch them
  let properties = global.launchPropertiesCache?.get(credentials.orgId);
  if (!properties) {
    properties = await service.listProperties();
    global.launchPropertiesCache!.set(credentials.orgId, properties);
  }

  for (const property of properties) {
    try {
      const rules = await service.listRules(property.id);
      for (const rule of rules) {
        assets.push({
          id: rule.id,
          name: `${property.attributes.name} / ${rule.attributes.name}`,
          type: 'launchRule',
          dependencies: [property.id],
        });
      }
    } catch (e) {
      logger.warn('Failed to fetch rules for property', { propertyId: property.id });
    }
  }

  return assets;
}

// Hierarchical Launch data structure
interface LaunchPropertyHierarchy {
  property: {
    id: string;
    name: string;
  };
  extensions: Asset[];
  dataElements: Asset[];
  rules: Asset[];
  loading?: {
    extensions: boolean;
    dataElements: boolean;
    rules: boolean;
  };
}

async function fetchLaunchHierarchy(
  accessToken: string,
  credentials: { clientId: string; orgId: string }
): Promise<LaunchPropertyHierarchy[]> {
  const service = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  logger.info('Fetching Launch hierarchy');

  // Fetch all properties first
  const properties = await service.listProperties();
  global.launchPropertiesCache!.set(credentials.orgId, properties);

  const hierarchy: LaunchPropertyHierarchy[] = [];

  // For each property, fetch its children sequentially
  for (const property of properties) {
    const propertyData: LaunchPropertyHierarchy = {
      property: {
        id: property.id,
        name: property.attributes.name,
      },
      extensions: [],
      dataElements: [],
      rules: [],
    };

    // Fetch extensions
    try {
      const extensions = await service.listExtensions(property.id);
      propertyData.extensions = extensions.map((ext) => ({
        id: ext.id,
        name: ext.attributes.displayName || ext.attributes.name,
        type: 'launchExtension',
        dependencies: [property.id],
      }));
    } catch (e) {
      logger.warn('Failed to fetch extensions', { propertyId: property.id });
    }

    // Fetch data elements
    try {
      const dataElements = await service.listDataElements(property.id);
      propertyData.dataElements = dataElements.map((de) => ({
        id: de.id,
        name: de.attributes.name,
        type: 'launchDataElement',
        dependencies: [property.id, de.relationships?.extension?.data?.id].filter(Boolean),
      }));
    } catch (e) {
      logger.warn('Failed to fetch data elements', { propertyId: property.id });
    }

    // Fetch rules
    try {
      const rules = await service.listRules(property.id);
      propertyData.rules = rules.map((rule) => ({
        id: rule.id,
        name: rule.attributes.name,
        type: 'launchRule',
        dependencies: [property.id],
      }));
    } catch (e) {
      logger.warn('Failed to fetch rules', { propertyId: property.id });
    }

    hierarchy.push(propertyData);
    logger.info('Property loaded', {
      property: property.attributes.name,
      extensions: propertyData.extensions.length,
      dataElements: propertyData.dataElements.length,
      rules: propertyData.rules.length,
    });
  }

  return hierarchy;
}

// ============================================================================
// CJA Asset Fetching Functions
// ============================================================================

// Store CJA connections in memory for subsequent calls
declare global {
  var cjaConnectionsCache: Map<string, any[]> | undefined;
  var cjaDataViewsCache: Map<string, any[]> | undefined;
}

if (!global.cjaConnectionsCache) {
  global.cjaConnectionsCache = new Map();
}

if (!global.cjaDataViewsCache) {
  global.cjaDataViewsCache = new Map();
}

async function fetchCJAConnections(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName?: string }
): Promise<Asset[]> {
  const service = createCJAConnectionService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const connections = await service.listConnections();

  // Cache connections for subsequent calls
  global.cjaConnectionsCache!.set(credentials.orgId, connections);

  return connections.map((connection) => ({
    id: connection.id,
    name: connection.name,
    type: 'cjaConnection',
    dependencies: connection.dataSets?.map((ds) => ds.datasetId) || [],
  }));
}

async function fetchCJADataViews(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName?: string }
): Promise<Asset[]> {
  const service = createCJADataViewService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const dataViews = await service.listDataViews();

  // Cache data views for subsequent calls
  global.cjaDataViewsCache!.set(credentials.orgId, dataViews);

  return dataViews.map((dataView) => ({
    id: dataView.id,
    name: dataView.name,
    type: 'cjaDataView',
    dependencies: dataView.parentDataGroupId ? [dataView.parentDataGroupId] : [],
  }));
}

async function fetchCJASegments(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName?: string }
): Promise<Asset[]> {
  const service = createCJASegmentService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const segments = await service.listSegments();

  return segments.map((segment) => ({
    id: segment.id,
    name: segment.name,
    type: 'cjaSegment',
    dependencies: segment.dataId ? [segment.dataId] : [],
  }));
}

async function fetchCJAFilters(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName?: string }
): Promise<Asset[]> {
  const service = createCJASegmentService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const filters = await service.listFilters();

  return filters.map((filter) => ({
    id: filter.id,
    name: filter.name,
    type: 'cjaFilter',
    dependencies: filter.dataId ? [filter.dataId] : [],
  }));
}

async function fetchCJACalculatedMetrics(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName?: string }
): Promise<Asset[]> {
  const service = createCJACalculatedMetricService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const metrics = await service.listCalculatedMetrics();

  return metrics.map((metric) => ({
    id: metric.id,
    name: metric.name,
    type: 'cjaCalculatedMetric',
    dependencies: metric.dataId ? [metric.dataId] : [],
  }));
}

// Hierarchical CJA data structure
interface CJAConnectionHierarchy {
  connection: {
    id: string;
    name: string;
    datasets: {
      id: string;
      name?: string;
      type: string;
    }[];
  };
  dataViews: {
    id: string;
    name: string;
    segments: Asset[];
    filters: Asset[];
    calculatedMetrics: Asset[];
  }[];
}

async function fetchCJAHierarchy(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName?: string }
): Promise<CJAConnectionHierarchy[]> {
  const connectionService = createCJAConnectionService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const dataViewService = createCJADataViewService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const segmentService = createCJASegmentService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const calcMetricService = createCJACalculatedMetricService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  logger.info('Fetching CJA hierarchy');

  // Fetch all connections
  const connections = await connectionService.listConnections();
  global.cjaConnectionsCache!.set(credentials.orgId, connections);

  // Fetch all data views
  const allDataViews = await dataViewService.listDataViews();
  global.cjaDataViewsCache!.set(credentials.orgId, allDataViews);

  // Fetch all segments and filters
  const allSegments = await segmentService.listSegments();
  const allFilters = await segmentService.listFilters();
  const allCalcMetrics = await calcMetricService.listCalculatedMetrics();

  const hierarchy: CJAConnectionHierarchy[] = [];
  const processedDataViewIds = new Set<string>();

  // Helper to build data view entry
  const buildDataViewEntry = (dataView: any) => {
    const dvSegments = allSegments
      .filter((s: any) => s.dataId === dataView.id || s.rsid === dataView.id)
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        type: 'cjaSegment' as const,
        dependencies: [dataView.id],
      }));

    const dvFilters = allFilters
      .filter((f: any) => f.dataId === dataView.id)
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        type: 'cjaFilter' as const,
        dependencies: [dataView.id],
      }));

    const dvCalcMetrics = allCalcMetrics
      .filter((m: any) => m.dataId === dataView.id || m.rsid === dataView.id)
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        type: 'cjaCalculatedMetric' as const,
        dependencies: [dataView.id],
      }));

    return {
      id: dataView.id,
      name: dataView.name,
      segments: dvSegments,
      filters: dvFilters,
      calculatedMetrics: dvCalcMetrics,
    };
  };

  // Process connections and their data views
  for (const connection of connections) {
    const connectionHierarchy: CJAConnectionHierarchy = {
      connection: {
        id: connection.id,
        name: connection.name,
        datasets: (connection.dataSets || []).map((ds: any) => ({
          id: ds.datasetId,
          name: ds.name,
          type: ds.type,
        })),
      },
      dataViews: [],
    };

    // Find data views for this connection
    const connectionDataViews = allDataViews.filter(
      (dv: any) => dv.parentDataGroupId === connection.id
    );

    for (const dataView of connectionDataViews) {
      connectionHierarchy.dataViews.push(buildDataViewEntry(dataView));
      processedDataViewIds.add(dataView.id);
    }

    hierarchy.push(connectionHierarchy);
    logger.info('CJA Connection loaded', {
      connection: connection.name,
      dataViews: connectionHierarchy.dataViews.length,
    });
  }

  // Handle orphaned data views (not linked to any connection)
  const orphanedDataViews = allDataViews.filter(
    (dv: any) => !processedDataViewIds.has(dv.id)
  );

  if (orphanedDataViews.length > 0) {
    // Group orphaned data views under a "Data Views" pseudo-connection
    const orphanedHierarchy: CJAConnectionHierarchy = {
      connection: {
        id: 'cja-dataviews-standalone',
        name: 'Data Views (Standalone)',
        datasets: [],
      },
      dataViews: orphanedDataViews.map((dv: any) => buildDataViewEntry(dv)),
    };

    hierarchy.push(orphanedHierarchy);
    logger.info('CJA Standalone Data Views loaded', {
      dataViews: orphanedDataViews.length,
    });
  }

  logger.info('CJA Hierarchy complete', {
    connections: connections.length,
    totalDataViews: allDataViews.length,
    orphanedDataViews: orphanedDataViews.length,
  });

  return hierarchy;
}

// ============================================================================
// CJA Flat Data Structure (Separate Sections with Full Details)
// ============================================================================

interface CJAFlatData {
  connections: Asset[];
  dataViews: Asset[];
  segments: Asset[];
  filters: Asset[];
  calculatedMetrics: Asset[];
  projects: Asset[];
}

async function fetchCJAFlat(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName?: string }
): Promise<CJAFlatData> {
  const connectionService = createCJAConnectionService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const dataViewService = createCJADataViewService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const segmentService = createCJASegmentService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const calcMetricService = createCJACalculatedMetricService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  logger.info('Fetching CJA flat data with full details');

  // Fetch all basic data (connections, dataviews, filters, projects) in parallel
  const [connections, allDataViews, allFilters, allProjects] = await Promise.all([
    connectionService.listConnections(),
    dataViewService.listDataViews(),
    segmentService.listFilters(),
    // Import and use project service
    (async () => {
      const { createCJAProjectService } = await import('@/services/cja');
      const projectService = createCJAProjectService(
        accessToken,
        credentials.clientId,
        credentials.orgId,
        credentials.sandboxName,
        config.adobe.cjaGlobalCompanyId // Required for CJA Projects API
      );
      return projectService.listProjects();
    })(),
  ]);

  // Fetch segments and calculated metrics per data view (using rsids parameter)
  logger.info('Fetching segments and calculated metrics per data view');
  const segmentsAndMetricsPerDataView = await Promise.all(
    allDataViews.map(async (dv: any) => {
      try {
        const [segments, calcMetrics] = await Promise.all([
          segmentService.listSegments({ rsids: dv.id }),
          calcMetricService.listCalculatedMetrics({ rsids: dv.id }),
        ]);

        logger.info('Fetched segments and calc metrics for data view', {
          dataViewId: dv.id,
          dataViewName: dv.name,
          segments: segments.length,
          calcMetrics: calcMetrics.length,
        });

        return { dataViewId: dv.id, segments, calcMetrics };
      } catch (error: any) {
        logger.warn('Failed to fetch segments/metrics for data view', {
          dataViewId: dv.id,
          error: error.message,
        });
        return { dataViewId: dv.id, segments: [], calcMetrics: [] };
      }
    })
  );

  // Build maps for easy lookup
  const segmentsByDataView = new Map<string, any[]>();
  const calcMetricsByDataView = new Map<string, any[]>();
  segmentsAndMetricsPerDataView.forEach((item) => {
    segmentsByDataView.set(item.dataViewId, item.segments);
    calcMetricsByDataView.set(item.dataViewId, item.calcMetrics);
  });

  // Combine all segments and calc metrics for flat structure
  const allSegments = segmentsAndMetricsPerDataView.flatMap((item) => item.segments);
  const allCalcMetrics = segmentsAndMetricsPerDataView.flatMap((item) => item.calcMetrics);

  // Fetch components (dimensions, metrics) for each data view
  logger.info('Fetching components for data views', { count: allDataViews.length });
  const dataViewsWithComponents = await Promise.all(
    allDataViews.map(async (dv: any) => {
      try {
        const [dimensions, metrics] = await Promise.all([
          dataViewService.listDimensions(dv.id, { limit: 1000 }),
          dataViewService.listMetrics(dv.id, { limit: 1000 }),
        ]);

        logger.info('Fetched components for data view', {
          dataViewId: dv.id,
          dataViewName: dv.name,
          dimensions: dimensions.length,
          metrics: metrics.length
        });

        return {
          ...dv,
          components: {
            dimensions,
            metrics,
            derivedFields: [] // Derived fields are typically included in dimensions/metrics
          }
        };
      } catch (error: any) {
        logger.warn('Failed to fetch components for data view', {
          dataViewId: dv.id,
          error: error.message
        });
        return {
          ...dv,
          components: { dimensions: [], metrics: [], derivedFields: [] }
        };
      }
    })
  );

  // Cache for lookups
  global.cjaConnectionsCache!.set(credentials.orgId, connections);
  global.cjaDataViewsCache!.set(credentials.orgId, allDataViews);

  // Debug: Log raw connection data to see what fields are available
  logger.info('Raw CJA connections from API', {
    connectionCount: connections.length,
    rawConnections: connections.map((c: any) => ({
      id: c.id,
      name: c.name,
      allKeys: Object.keys(c),
      hasName: 'name' in c,
      nameValue: c.name,
      ownerType: typeof c.owner,
      ownerKeys: c.owner ? Object.keys(c.owner).join(', ') : 'none',
      ownerSample: c.owner ? JSON.stringify(c.owner) : 'none',
      createdDateType: typeof c.createdDate,
      createdDateSample: JSON.stringify(c.createdDate)
    }))
  });

  // Debug: Log dimension/metric structure
  if (dataViewsWithComponents.length > 0 && dataViewsWithComponents[0].components) {
    const firstDV = dataViewsWithComponents[0];
    const firstDim = firstDV.components.dimensions?.[0];
    const firstMetric = firstDV.components.metrics?.[0];
    logger.info('Sample dimension/metric structure', {
      firstDimension: firstDim,
      dimNameType: typeof firstDim?.name,
      dimNameValue: firstDim?.name,
      dimNameKeys: firstDim?.name && typeof firstDim.name === 'object' ? Object.keys(firstDim.name).join(', ') : 'N/A',
      firstMetric: firstMetric,
      metricNameType: typeof firstMetric?.name,
      metricNameValue: firstMetric?.name,
      metricNameKeys: firstMetric?.name && typeof firstMetric.name === 'object' ? Object.keys(firstMetric.name).join(', ') : 'N/A'
    });
  }

  // Debug: Log segment/filter/calcmetric structure
  if (allSegments.length > 0) {
    const firstSeg = allSegments[0];
    const firstTag = firstSeg.tags?.[0];
    logger.info('Sample segment structure', {
      segment: firstSeg,
      nameType: typeof firstSeg.name,
      nameValue: firstSeg.name,
      nameKeys: firstSeg.name && typeof firstSeg.name === 'object' ? Object.keys(firstSeg.name).join(', ') : 'N/A',
      tagsLength: firstSeg.tags?.length || 0,
      firstTagType: typeof firstTag,
      firstTagValue: firstTag,
      firstTagKeys: firstTag && typeof firstTag === 'object' ? Object.keys(firstTag).join(', ') : 'N/A'
    });
  }

  // Helper function to safely extract owner as string
  const getOwnerString = (owner: any): string | undefined => {
    if (!owner) return undefined;
    if (typeof owner === 'string') return owner;
    if (typeof owner === 'object') {
      return typeof owner.name === 'string' ? owner.name :
             typeof owner.id === 'string' ? owner.id : undefined;
    }
    return undefined;
  };

  // Helper function to safely extract date as string
  const getDateString = (date: any): string | undefined => {
    if (typeof date === 'string') return date;
    return undefined;
  };

  // Build connection lookup map
  const connectionMap = new Map<string, any>();
  connections.forEach((c: any) => connectionMap.set(c.id, c));

  // Build data view lookup map (use dataViewsWithComponents)
  const dataViewMap = new Map<string, any>();
  dataViewsWithComponents.forEach((dv: any) => dataViewMap.set(dv.id, dv));

  // Transform connections with full details
  const flatConnections: Asset[] = connections.map((conn: any) => ({
    id: conn.id,
    name: conn.name,
    type: 'cjaConnection',
    description: conn.description,
    owner: getOwnerString(conn.owner),
    createdDate: getDateString(conn.createdDate),
    modifiedDate: getDateString(conn.modifiedDate),
    datasetsCount: conn.dataSets?.length || 0,
    dependencies: conn.dataSets?.map((ds: any) => ds.datasetId) || [],
  }));

  // Transform data views with full details + parent connection info + components
  const flatDataViews: Asset[] = dataViewsWithComponents.map((dv: any) => {
    const parentConnection = dv.parentDataGroupId ? connectionMap.get(dv.parentDataGroupId) : null;
    return {
      id: dv.id,
      name: dv.name,
      type: 'cjaDataView',
      description: dv.description,
      owner: getOwnerString(dv.owner),
      createdDate: getDateString(dv.createdDate),
      modifiedDate: getDateString(dv.modifiedDate),
      connectionId: dv.parentDataGroupId,
      connectionName: parentConnection?.name || 'Unknown Connection',
      timezoneDesignator: dv.timezoneDesignator,
      sessionDefinition: dv.sessionDefinition,
      components: dv.components, // Include dimensions, metrics, derived fields
      dimensionsCount: dv.components?.dimensions?.length || 0,
      metricsCount: dv.components?.metrics?.length || 0,
      derivedFieldsCount: dv.components?.derivedFields?.length || 0,
      dependencies: dv.parentDataGroupId ? [dv.parentDataGroupId] : [],
    };
  });

  // Transform segments with full details + parent data view info
  const flatSegments: Asset[] = allSegments.map((seg: any) => {
    const dataViewId = seg.dataId || seg.rsid;
    const parentDataView = dataViewId ? dataViewMap.get(dataViewId) : null;
    const parentConnection = parentDataView?.parentDataGroupId
      ? connectionMap.get(parentDataView.parentDataGroupId)
      : null;
    return {
      id: seg.id,
      name: seg.name,
      type: 'cjaSegment',
      description: seg.description,
      owner: getOwnerString(seg.owner),
      createdDate: getDateString(seg.createdDate),
      modifiedDate: getDateString(seg.modifiedDate),
      tags: seg.tags,
      dataViewId: dataViewId,
      dataViewName: parentDataView?.name || 'Unknown Data View',
      connectionId: parentDataView?.parentDataGroupId,
      connectionName: parentConnection?.name,
      dependencies: dataViewId ? [dataViewId] : [],
    };
  });

  // Transform filters with full details + parent data view info
  const flatFilters: Asset[] = allFilters.map((filter: any) => {
    const dataViewId = filter.dataId;
    const parentDataView = dataViewId ? dataViewMap.get(dataViewId) : null;
    const parentConnection = parentDataView?.parentDataGroupId
      ? connectionMap.get(parentDataView.parentDataGroupId)
      : null;
    return {
      id: filter.id,
      name: filter.name,
      type: 'cjaFilter',
      description: filter.description,
      owner: getOwnerString(filter.owner),
      createdDate: getDateString(filter.createdDate),
      modifiedDate: getDateString(filter.modifiedDate),
      tags: filter.tags,
      dataViewId: dataViewId,
      dataViewName: parentDataView?.name || 'Unknown Data View',
      connectionId: parentDataView?.parentDataGroupId,
      connectionName: parentConnection?.name,
      dependencies: dataViewId ? [dataViewId] : [],
    };
  });

  // Transform calculated metrics with full details + parent data view info
  const flatCalcMetrics: Asset[] = allCalcMetrics.map((metric: any) => {
    const dataViewId = metric.dataId || metric.rsid;
    const parentDataView = dataViewId ? dataViewMap.get(dataViewId) : null;
    const parentConnection = parentDataView?.parentDataGroupId
      ? connectionMap.get(parentDataView.parentDataGroupId)
      : null;
    return {
      id: metric.id,
      name: metric.name,
      type: 'cjaCalculatedMetric',
      description: metric.description,
      owner: getOwnerString(metric.owner),
      createdDate: getDateString(metric.createdDate),
      modifiedDate: getDateString(metric.modifiedDate),
      tags: metric.tags,
      dataViewId: dataViewId,
      dataViewName: parentDataView?.name || 'Unknown Data View',
      connectionId: parentDataView?.parentDataGroupId,
      connectionName: parentConnection?.name,
      dependencies: dataViewId ? [dataViewId] : [],
    };
  });

  // Transform projects with full details + parent data view info
  const flatProjects: Asset[] = allProjects.map((project: any) => {
    const dataViewId = project.dataId || project.rsid;
    const parentDataView = dataViewId ? dataViewMap.get(dataViewId) : null;
    const parentConnection = parentDataView?.parentDataGroupId
      ? connectionMap.get(parentDataView.parentDataGroupId)
      : null;

    return {
      id: project.id,
      name: project.name,
      type: 'cjaProject',
      description: project.description,
      owner: getOwnerString(project.owner),
      createdDate: getDateString(project.created),
      modifiedDate: getDateString(project.modified),
      tags: project.tags,
      dataViewId: dataViewId,
      dataViewName: parentDataView?.name || 'Unknown Data View',
      connectionId: parentDataView?.parentDataGroupId,
      connectionName: parentConnection?.name,
      dependencies: dataViewId ? [dataViewId] : [],
    };
  });

  logger.info('CJA Flat data complete', {
    connections: flatConnections.length,
    dataViews: flatDataViews.length,
    segments: flatSegments.length,
    filters: flatFilters.length,
    calculatedMetrics: flatCalcMetrics.length,
    projects: flatProjects.length,
    // Debug: Log actual connection data
    connectionDetails: flatConnections.map(c => ({ id: c.id, name: c.name, type: c.type }))
  });

  return {
    connections: flatConnections,
    dataViews: flatDataViews,
    segments: flatSegments,
    filters: flatFilters,
    calculatedMetrics: flatCalcMetrics,
    projects: flatProjects,
  };
}

// ============================================================================
// New AEP Service Asset Fetching Functions
// ============================================================================

async function fetchIdentityNamespaces(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createIdentityService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const namespaces = await service.listNamespaces();

  return namespaces.map((ns) => ({
    id: ns.code,
    name: ns.name,
    type: 'identityNamespace',
    description: ns.description,
  }));
}

async function fetchMergePolicies(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createProfileService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const policies = await service.listMergePolicies();

  return policies.map((policy) => ({
    id: policy.id,
    name: policy.name,
    type: 'mergePolicy',
    description: `Schema: ${policy.schema?.name || 'N/A'}`,
  }));
}

async function fetchComputedAttributes(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createProfileService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const attributes = await service.listComputedAttributes();

  return attributes.map((attr) => ({
    id: attr.id,
    name: attr.name,
    type: 'computedAttribute',
    description: attr.description,
  }));
}

async function fetchFlowConnections(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createFlowService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const connections = await service.listConnections();

  return connections.map((conn) => ({
    id: conn.id,
    name: conn.name,
    type: 'flowConnection',
    description: `State: ${conn.state || 'N/A'}`,
  }));
}

async function fetchDataFlows(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createFlowService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const flows = await service.listFlows();

  return flows.map((flow) => ({
    id: flow.id,
    name: flow.name || `Flow ${flow.id}`,
    type: 'dataFlow',
    description: `State: ${flow.state || 'N/A'}`,
  }));
}

async function fetchSandboxes(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createSandboxToolingService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const sandboxes = await service.listSandboxes();

  return sandboxes.map((sb) => ({
    id: sb.name,
    name: sb.title || sb.name,
    type: 'sandbox',
    description: `Type: ${sb.type || 'N/A'}, State: ${sb.state || 'N/A'}`,
  }));
}

async function fetchDataUsageLabels(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createPolicyService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const labels = await service.listLabels();

  return labels.map((label) => ({
    id: label.name,
    name: label.name,
    type: 'dataUsageLabel',
    description: label.friendlyName || label.category,
  }));
}

async function fetchGovernancePolicies(
  accessToken: string,
  credentials: { clientId: string; orgId: string; sandboxName: string }
): Promise<Asset[]> {
  const service = createPolicyService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const policies = await service.listPolicies();

  return policies.map((policy) => ({
    id: policy.id,
    name: policy.name,
    type: 'governancePolicy',
    description: policy.description,
  }));
}
