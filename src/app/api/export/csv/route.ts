import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/utils/logger';
import { arrayToCSV, flattenForCSV } from '@/utils/csv-export';
import { config } from '@/config';

// Import services
import {
  createSchemaService,
  createDatasetService,
  createAudienceService,
  createReactorService,
} from '@/services/adobe';
import {
  createCJAConnectionService,
  createCJADataViewService,
  createCJASegmentService,
  createCJACalculatedMetricService,
  createCJAProjectService,
} from '@/services/cja';

const logger = createLogger('API:Export:CSV');

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large exports

// ============================================================================
// GET /api/export/csv - Export inventory data to CSV
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId');
    const exportType = searchParams.get('type'); // 'all', 'aep', 'cja', 'launch', or specific type

    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    if (!exportType) {
      return NextResponse.json(
        { error: 'Export type is required' },
        { status: 400 }
      );
    }

    // Find organization in memory store
    const orgStore = global.orgStore;
    if (!orgStore) {
      return NextResponse.json(
        { error: 'No organizations configured' },
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
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    const accessToken = organization.accessToken;
    const credentials = organization.credentials;

    logger.info('Exporting inventory to CSV', { orgId, exportType });

    let csvData = '';
    let filename = '';

    switch (exportType) {
      case 'schemas':
        csvData = await exportSchemas(accessToken, credentials);
        filename = `schemas_${orgId}_${Date.now()}.csv`;
        break;

      case 'datasets':
        csvData = await exportDatasets(accessToken, credentials);
        filename = `datasets_${orgId}_${Date.now()}.csv`;
        break;

      case 'audiences':
        csvData = await exportAudiences(accessToken, credentials);
        filename = `audiences_${orgId}_${Date.now()}.csv`;
        break;

      case 'cja-connections':
        csvData = await exportCJAConnections(accessToken, credentials);
        filename = `cja_connections_${orgId}_${Date.now()}.csv`;
        break;

      case 'cja-dataviews':
        csvData = await exportCJADataViews(accessToken, credentials);
        filename = `cja_dataviews_${orgId}_${Date.now()}.csv`;
        break;

      case 'cja-segments':
        csvData = await exportCJASegments(accessToken, credentials);
        filename = `cja_segments_${orgId}_${Date.now()}.csv`;
        break;

      case 'cja-calculatedmetrics':
        csvData = await exportCJACalculatedMetrics(accessToken, credentials);
        filename = `cja_calculated_metrics_${orgId}_${Date.now()}.csv`;
        break;

      case 'cja-projects':
        csvData = await exportCJAProjects(accessToken, credentials);
        filename = `cja_projects_${orgId}_${Date.now()}.csv`;
        break;

      case 'launch-properties':
        csvData = await exportLaunchProperties(accessToken, credentials);
        filename = `launch_properties_${orgId}_${Date.now()}.csv`;
        break;

      case 'launch-extensions':
        csvData = await exportLaunchExtensions(accessToken, credentials);
        filename = `launch_extensions_${orgId}_${Date.now()}.csv`;
        break;

      case 'launch-dataelements':
        csvData = await exportLaunchDataElements(accessToken, credentials);
        filename = `launch_dataelements_${orgId}_${Date.now()}.csv`;
        break;

      case 'launch-rules':
        csvData = await exportLaunchRules(accessToken, credentials);
        filename = `launch_rules_${orgId}_${Date.now()}.csv`;
        break;

      default:
        return NextResponse.json(
          { error: `Unknown export type: ${exportType}` },
          { status: 400 }
        );
    }

    logger.info('CSV export completed', { exportType, size: csvData.length });

    // Return CSV file
    return new NextResponse(csvData, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    logger.error('Failed to export CSV', { error: error.message });
    return NextResponse.json(
      { error: 'Failed to export CSV', details: error.message },
      { status: 500 }
    );
  }
}

// ============================================================================
// AEP Export Functions
// ============================================================================

async function exportSchemas(accessToken: string, credentials: any): Promise<string> {
  const schemaService = createSchemaService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const schemas = await schemaService.listSchemas();

  const rows = schemas.map((schema: any) => {
    // Extract field groups
    const fieldGroupRefs = schema.allOf ? schema.allOf.map((ref: any) => ref['$ref']).filter(Boolean) : [];

    // Extract all properties/fields from the schema
    const properties = schema.properties || {};
    const fieldNames = Object.keys(properties);
    const fieldDetails = fieldNames.map(fieldName => {
      const field = properties[fieldName];
      return {
        name: fieldName,
        type: field.type,
        title: field.title,
        description: field.description,
        meta: field.meta
      };
    });

    return flattenForCSV({
      id: schema['$id'] || schema.id,
      title: schema.title,
      type: schema.type,
      version: schema.version,
      description: schema.description || '',
      created: schema.created || '',
      updated: schema.updated || '',
      class: schema['meta:class'] || schema.class || '',

      // Field Groups
      fieldGroupsCount: fieldGroupRefs.length,
      fieldGroups: fieldGroupRefs.join('; '),

      // Fields
      fieldsCount: fieldNames.length,
      fieldNames: fieldNames.join('; '),
      fieldDetails: JSON.stringify(fieldDetails),

      // Additional metadata
      extends: schema['meta:extends'] ? schema['meta:extends'].join('; ') : '',
      intendedToExtend: schema['meta:intendedToExtend'] ? schema['meta:intendedToExtend'].join('; ') : '',

      // Full JSON response
      fullResponse: JSON.stringify(schema),
    });
  });

  return arrayToCSV(rows);
}

async function exportDatasets(accessToken: string, credentials: any): Promise<string> {
  const datasetService = createDatasetService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const datasets = await datasetService.listDatasets();

  const rows = datasets.map((dataset: any) => flattenForCSV({
    id: dataset.id,
    name: dataset.name,
    description: dataset.description || '',

    // Schema information
    schemaRef: dataset.schemaRef?.id || '',
    schemaClass: dataset.schemaRef?.contentType || '',

    // State and configuration
    state: dataset.state || '',
    status: dataset.status || '',
    enabledForProfile: dataset.unifiedProfile?.enabled || false,
    enabledForIdentity: dataset.unifiedIdentity?.enabled || false,

    // File information
    fileDescription: dataset.fileDescription ? JSON.stringify(dataset.fileDescription) : '',

    // Timestamps
    created: dataset.created || '',
    updated: dataset.updated || '',

    // Tags and metadata
    tags: dataset.tags?.join('; ') || '',
    version: dataset.version || '',
    imsOrg: dataset.imsOrg || '',

    // Observability
    observableSchema: dataset.observableSchema ? JSON.stringify(dataset.observableSchema) : '',

    // Full JSON response
    fullResponse: JSON.stringify(dataset),
  }));

  return arrayToCSV(rows);
}

async function exportAudiences(accessToken: string, credentials: any): Promise<string> {
  const audienceService = createAudienceService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    credentials.sandboxName
  );

  const audiences = await audienceService.listAudiences();

  const rows = audiences.map((audience: any) => flattenForCSV({
    id: audience.id,
    name: audience.name,
    description: audience.description || '',

    // Type and status
    type: audience.type || '',
    status: audience.lifecycleState || '',
    evaluationMethod: audience.evaluationInfo?.continuous ? 'Streaming' : 'Batch',

    // Schema and expression
    schema: audience.schema?.name || '',
    expression: audience.expression?.type || '',
    expressionFormat: audience.expression?.format || '',
    pql: audience.expression?.value || '',

    // Timestamps
    creationTime: audience.creationTime || '',
    updateTime: audience.updateTime || '',
    updateEpoch: audience.updateEpoch || '',

    // Merge policy
    mergePolicy: audience.mergePolicyId || '',

    // Labels and tags
    labels: audience.labels ? JSON.stringify(audience.labels) : '',

    // Full JSON response
    fullResponse: JSON.stringify(audience),
  }));

  return arrayToCSV(rows);
}

// ============================================================================
// CJA Export Functions
// ============================================================================

async function exportCJAConnections(accessToken: string, credentials: any): Promise<string> {
  const connectionService = createCJAConnectionService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const connections = await connectionService.listConnections();

  const rows = connections.map((conn: any) => flattenForCSV({
    id: conn.id,
    name: conn.name,
    description: conn.description || '',

    // Owner information
    ownerName: conn.owner?.name || '',
    ownerId: conn.owner?.id || '',

    // Timestamps
    createdDate: conn.createdDate || '',
    modifiedDate: conn.modifiedDate || '',

    // Datasets
    datasetsCount: conn.dataSets?.length || 0,
    datasetIds: conn.dataSets?.map((ds: any) => ds.datasetId).join('; ') || '',
    datasetDetails: JSON.stringify(conn.dataSets || []),

    // Configuration
    connectionType: conn.connectionType || '',
    enabled: conn.enabled || false,

    // Full JSON response
    fullResponse: JSON.stringify(conn),
  }));

  return arrayToCSV(rows);
}

async function exportCJADataViews(accessToken: string, credentials: any): Promise<string> {
  const dataViewService = createCJADataViewService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const dataViews = await dataViewService.listDataViews();

  // Fetch dimensions and metrics for each data view
  const dataViewsWithComponents = await Promise.all(
    dataViews.map(async (dv: any) => {
      try {
        const [dimensions, metrics] = await Promise.all([
          dataViewService.listDimensions(dv.id, { limit: 1000 }),
          dataViewService.listMetrics(dv.id, { limit: 1000 }),
        ]);
        return { ...dv, dimensions, metrics };
      } catch (error) {
        logger.error('Failed to fetch components for data view', { dataViewId: dv.id });
        return { ...dv, dimensions: [], metrics: [] };
      }
    })
  );

  const rows = dataViewsWithComponents.map((dv: any) => flattenForCSV({
    id: dv.id,
    name: dv.name,
    description: dv.description || '',

    // Connection
    connectionId: dv.parentDataGroupId || '',

    // Owner
    ownerName: dv.owner?.name || '',
    ownerId: dv.owner?.id || '',

    // Timestamps
    createdDate: dv.createdDate || '',
    modifiedDate: dv.modifiedDate || '',

    // Configuration
    timezone: dv.timezoneDesignator || '',
    sessionTimeout: dv.sessionDefinition?.sessionTimeout || '',
    sessionTimeoutUnit: dv.sessionDefinition?.sessionTimeoutUnit || '',
    sessionDefinitionFull: JSON.stringify(dv.sessionDefinition || {}),

    // Components counts
    dimensionsCount: dv.dimensions?.length || 0,
    metricsCount: dv.metrics?.length || 0,

    // Component details
    dimensionsList: dv.dimensions?.map((d: any) => d.name || d.id).join('; ') || '',
    metricsList: dv.metrics?.map((m: any) => m.name || m.id).join('; ') || '',
    dimensionsDetails: JSON.stringify(dv.dimensions || []),
    metricsDetails: JSON.stringify(dv.metrics || []),

    // Container settings
    containerNames: dv.containerNames ? JSON.stringify(dv.containerNames) : '',

    // Full JSON response
    fullResponse: JSON.stringify(dv),
  }));

  return arrayToCSV(rows);
}

async function exportCJASegments(accessToken: string, credentials: any): Promise<string> {
  const segmentService = createCJASegmentService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const segments = await segmentService.listSegments({ limit: 1000 });

  const rows = segments.map((seg: any) => flattenForCSV({
    id: seg.id,
    name: seg.name,
    description: seg.description || '',

    // Data View
    dataViewId: seg.dataId || seg.rsid || '',

    // Owner
    ownerName: seg.owner?.name || '',
    ownerId: seg.owner?.id || '',

    // Timestamps
    createdDate: seg.createdDate || '',
    modifiedDate: seg.modifiedDate || '',

    // Tags
    tags: seg.tags?.join('; ') || '',

    // Compatibility
    compatibilityStatus: seg.compatibility?.status || '',
    compatibilitySupported: seg.compatibility?.supported_products?.join('; ') || '',
    compatibilityValidator: seg.compatibility?.validator_version || '',
    compatibilityDetails: JSON.stringify(seg.compatibility || {}),

    // Definition
    definition: JSON.stringify(seg.definition || {}),

    // Sharing
    shares: seg.shares ? JSON.stringify(seg.shares) : '',

    // Full JSON response
    fullResponse: JSON.stringify(seg),
  }));

  return arrayToCSV(rows);
}

async function exportCJACalculatedMetrics(accessToken: string, credentials: any): Promise<string> {
  const calcMetricService = createCJACalculatedMetricService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const metrics = await calcMetricService.listCalculatedMetrics({ limit: 1000 });

  const rows = metrics.map((metric: any) => flattenForCSV({
    id: metric.id,
    name: metric.name,
    description: metric.description || '',

    // Data View
    dataViewId: metric.dataId || metric.rsid || '',

    // Owner
    ownerName: metric.owner?.name || '',
    ownerId: metric.owner?.id || '',

    // Timestamps
    createdDate: metric.createdDate || '',
    modifiedDate: metric.modifiedDate || '',

    // Tags
    tags: metric.tags?.join('; ') || '',

    // Type and configuration
    type: metric.type || '',
    polarity: metric.polarity || '',
    precision: metric.precision || '',
    format: metric.format || '',

    // Formula/Definition
    definition: JSON.stringify(metric.definition || {}),
    formula: metric.formula ? JSON.stringify(metric.formula) : '',

    // Functions used
    functions: metric.functions ? JSON.stringify(metric.functions) : '',

    // Sharing
    shares: metric.shares ? JSON.stringify(metric.shares) : '',

    // Full JSON response
    fullResponse: JSON.stringify(metric),
  }));

  return arrayToCSV(rows);
}

async function exportCJAProjects(accessToken: string, credentials: any): Promise<string> {
  const projectService = createCJAProjectService(
    accessToken,
    credentials.clientId,
    credentials.orgId,
    undefined, // sandboxName
    config.adobe.cjaGlobalCompanyId // globalCompanyId
  );

  const projects = await projectService.listProjects({ limit: 1000 });

  const rows = projects.map((project: any) => flattenForCSV({
    id: project.id,
    name: project.name,
    description: project.description || '',

    // Data View
    dataViewId: project.dataId || project.rsid || '',

    // Owner
    ownerFullName: project.ownerFullName || project.owner?.name || '',
    ownerId: project.owner?.id || project.owner?.imsUserId || '',

    // Timestamps
    created: project.created || '',
    modified: project.modified || '',

    // Tags
    tags: project.tags?.join('; ') || '',

    // Type and configuration
    type: project.type || '',

    // Project definition (panels, visualizations, etc.)
    definition: JSON.stringify(project.definition || {}),

    // Sharing
    shares: project.shares ? JSON.stringify(project.shares) : '',

    // Favorite
    favorite: project.favorite || false,

    // Full JSON response
    fullResponse: JSON.stringify(project),
  }));

  return arrayToCSV(rows);
}

// ============================================================================
// Adobe Launch Export Functions
// ============================================================================

async function exportLaunchProperties(accessToken: string, credentials: any): Promise<string> {
  const reactorService = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const properties = await reactorService.listProperties();

  const rows = properties.map((prop: any) => flattenForCSV({
    id: prop.id,
    name: prop.attributes?.name || '',
    platform: prop.attributes?.platform || '',

    // Status
    development: prop.attributes?.development || false,
    enabled: prop.attributes?.enabled || false,

    // Timestamps
    created: prop.attributes?.created_at || '',
    updated: prop.attributes?.updated_at || '',

    // Links
    selfLink: prop.links?.self || '',
    companyLink: prop.relationships?.company?.links?.related || '',

    // Full JSON response
    fullResponse: JSON.stringify(prop),
  }));

  return arrayToCSV(rows);
}

async function exportLaunchExtensions(accessToken: string, credentials: any): Promise<string> {
  const reactorService = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const properties = await reactorService.listProperties();
  const allExtensions: any[] = [];

  for (const property of properties) {
    const extensions = await reactorService.listExtensions(property.id);
    extensions.forEach((ext: any) => {
      allExtensions.push({
        propertyId: property.id,
        propertyName: property.attributes?.name || '',
        ...ext,
      });
    });
  }

  const rows = allExtensions.map((ext: any) => flattenForCSV({
    id: ext.id,
    propertyId: ext.propertyId,
    propertyName: ext.propertyName,

    // Extension info
    name: ext.attributes?.name || '',
    displayName: ext.attributes?.display_name || '',
    delegateDescriptorId: ext.attributes?.delegate_descriptor_id || '',
    version: ext.attributes?.version || '',

    // Settings and configuration
    settings: JSON.stringify(ext.attributes?.settings || {}),
    dirty: ext.attributes?.dirty || false,
    enabled: ext.attributes?.enabled || true,

    // Timestamps
    created: ext.attributes?.created_at || '',
    updated: ext.attributes?.updated_at || '',
    published: ext.attributes?.published || false,
    publishedAt: ext.attributes?.published_at || '',

    // Relationships
    extensionPackage: ext.relationships?.extension_package?.data?.id || '',

    // Full JSON response
    fullResponse: JSON.stringify(ext),
  }));

  return arrayToCSV(rows);
}

async function exportLaunchDataElements(accessToken: string, credentials: any): Promise<string> {
  const reactorService = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const properties = await reactorService.listProperties();
  const allDataElements: any[] = [];

  for (const property of properties) {
    const dataElements = await reactorService.listDataElements(property.id);
    dataElements.forEach((de: any) => {
      allDataElements.push({
        propertyId: property.id,
        propertyName: property.attributes?.name || '',
        ...de,
      });
    });
  }

  const rows = allDataElements.map((de: any) => flattenForCSV({
    id: de.id,
    propertyId: de.propertyId,
    propertyName: de.propertyName,

    // Data element info
    name: de.attributes?.name || '',
    delegateDescriptorId: de.attributes?.delegate_descriptor_id || '',

    // Settings and configuration
    settings: JSON.stringify(de.attributes?.settings || {}),
    defaultValue: de.attributes?.default_value || '',
    cleanText: de.attributes?.clean_text || false,
    forceLowerCase: de.attributes?.force_lower_case || false,
    storageType: de.attributes?.storage_type || '',
    storageDuration: de.attributes?.storage_duration || '',

    // Status
    dirty: de.attributes?.dirty || false,
    enabled: de.attributes?.enabled || true,
    published: de.attributes?.published || false,

    // Timestamps
    created: de.attributes?.created_at || '',
    updated: de.attributes?.updated_at || '',
    publishedAt: de.attributes?.published_at || '',

    // Relationships
    extension: de.relationships?.extension?.data?.id || '',

    // Full JSON response
    fullResponse: JSON.stringify(de),
  }));

  return arrayToCSV(rows);
}

async function exportLaunchRules(accessToken: string, credentials: any): Promise<string> {
  const reactorService = createReactorService(
    accessToken,
    credentials.clientId,
    credentials.orgId
  );

  const properties = await reactorService.listProperties();
  const allRules: any[] = [];

  for (const property of properties) {
    const rules = await reactorService.listRules(property.id);
    rules.forEach((rule: any) => {
      allRules.push({
        propertyId: property.id,
        propertyName: property.attributes?.name || '',
        ...rule,
      });
    });
  }

  const rows = allRules.map((rule: any) => flattenForCSV({
    id: rule.id,
    propertyId: rule.propertyId,
    propertyName: rule.propertyName,

    // Rule info
    name: rule.attributes?.name || '',
    enabled: rule.attributes?.enabled || false,

    // Status
    reviewStatus: rule.attributes?.review_status || '',
    dirty: rule.attributes?.dirty || false,
    published: rule.attributes?.published || false,

    // Timestamps
    created: rule.attributes?.created_at || '',
    updated: rule.attributes?.updated_at || '',
    publishedAt: rule.attributes?.published_at || '',

    // Relationships - just the IDs
    originId: rule.relationships?.origin?.data?.id || '',
    ruleComponentsCount: rule.relationships?.rule_components?.data?.length || 0,

    // Full JSON response (includes complete rule components structure)
    fullResponse: JSON.stringify(rule),
  }));

  return arrayToCSV(rows);
}
