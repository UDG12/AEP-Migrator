// ============================================================================
// Application Configuration
// ============================================================================

export const config = {
  // Application
  app: {
    name: 'AEP Migrator',
    version: '1.0.0',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    secret: process.env.APP_SECRET || 'dev-secret',
  },

  // Database
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/aep-migrator',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Security
  security: {
    encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-chars!!',
    jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Adobe APIs
  adobe: {
    imsUrl: process.env.ADOBE_IMS_URL || 'https://ims-na1.adobelogin.com',
    platformUrl: process.env.ADOBE_PLATFORM_URL || 'https://platform.adobe.io',
    reactorUrl: process.env.ADOBE_REACTOR_URL || 'https://reactor.adobe.io',
    cjaUrl: process.env.ADOBE_CJA_URL || 'https://cja.adobe.io',
    cjaGlobalCompanyId: process.env.ADOBE_CJA_GLOBAL_COMPANY_ID || '',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
} as const;

// ============================================================================
// Adobe API Endpoints
// ============================================================================

export const adobeEndpoints = {
  // IMS OAuth
  auth: {
    token: '/ims/token/v3',
  },

  // Experience Platform
  platform: {
    // Schema Registry
    schemas: '/data/foundation/schemaregistry/tenant/schemas',
    globalSchemas: '/data/foundation/schemaregistry/global/schemas',
    fieldGroups: '/data/foundation/schemaregistry/tenant/fieldgroups',
    globalFieldGroups: '/data/foundation/schemaregistry/global/fieldgroups',
    classes: '/data/foundation/schemaregistry/tenant/classes',
    dataTypes: '/data/foundation/schemaregistry/tenant/datatypes',

    // Catalog Service
    datasets: '/data/foundation/catalog/datasets',
    batches: '/data/foundation/catalog/batches',

    // Data Access API (for exporting data)
    dataAccess: {
      files: '/data/foundation/export/files',
      batchFiles: '/data/foundation/export/batches',
    },

    // Batch Ingestion API (for importing data)
    batchIngestion: {
      batches: '/data/foundation/import/batches',
    },

    // Segmentation Service
    audiences: '/data/core/ups/segment/definitions',
    segmentJobs: '/data/core/ups/segment/jobs',

    // Sandboxes
    sandboxes: '/data/foundation/sandbox-management/sandboxes',
  },

  // Identity Service API
  identity: {
    namespaces: '/data/core/idnamespace/identities',
    namespaceById: '/data/core/idnamespace/identities/{NAMESPACE_CODE}',
    clusters: '/data/core/identity/clusters/members',
    clusterHistory: '/data/core/identity/clusters/history',
    mapping: '/data/core/identity/mapping',
    graph: '/data/core/identity/graph',
  },

  // Real-time Customer Profile API
  profile: {
    // Entity Access
    entities: '/data/core/ups/access/entities',

    // Merge Policies
    mergePolicies: '/data/core/ups/config/mergePolicies',
    mergePolicyById: '/data/core/ups/config/mergePolicies/{POLICY_ID}',

    // Computed Attributes
    computedAttributes: '/data/core/ca/attributes',
    computedAttributeById: '/data/core/ca/attributes/{ATTRIBUTE_ID}',

    // Profile Preview & Export
    previewJobs: '/data/core/ups/preview',
    exportJobs: '/data/core/ups/export/jobs',
    exportJobById: '/data/core/ups/export/jobs/{JOB_ID}',

    // Profile System Jobs
    deleteJobs: '/data/core/ups/system/jobs',
  },

  // Flow Service API (Sources & Destinations)
  flowService: {
    // Base Connections
    connections: '/data/foundation/flowservice/connections',
    connectionById: '/data/foundation/flowservice/connections/{CONNECTION_ID}',

    // Connection Specs (catalog of available connectors)
    connectionSpecs: '/data/foundation/flowservice/connectionSpecs',
    connectionSpecById: '/data/foundation/flowservice/connectionSpecs/{SPEC_ID}',

    // Flow Specs
    flowSpecs: '/data/foundation/flowservice/flowSpecs',
    flowSpecById: '/data/foundation/flowservice/flowSpecs/{SPEC_ID}',

    // Source Connections
    sourceConnections: '/data/foundation/flowservice/sourceConnections',
    sourceConnectionById: '/data/foundation/flowservice/sourceConnections/{CONNECTION_ID}',

    // Target Connections
    targetConnections: '/data/foundation/flowservice/targetConnections',
    targetConnectionById: '/data/foundation/flowservice/targetConnections/{CONNECTION_ID}',

    // Data Flows
    flows: '/data/foundation/flowservice/flows',
    flowById: '/data/foundation/flowservice/flows/{FLOW_ID}',

    // Flow Runs
    runs: '/data/foundation/flowservice/runs',
    runById: '/data/foundation/flowservice/runs/{RUN_ID}',
    flowRuns: '/data/foundation/flowservice/flows/{FLOW_ID}/runs',
  },

  // Sandbox Management API
  sandbox: {
    sandboxes: '/data/foundation/sandbox-management/sandboxes',
    sandboxByName: '/data/foundation/sandbox-management/sandboxes/{SANDBOX_NAME}',
    availableSandboxes: '/data/foundation/sandbox-management/sandboxes',
    sandboxTypes: '/data/foundation/sandbox-management/sandboxTypes',
  },

  // Sandbox Tooling API (Package-based Migration)
  sandboxTooling: {
    // Packages
    packages: '/data/foundation/exim/packages',
    packageById: '/data/foundation/exim/packages/{PACKAGE_ID}',
    packagePublish: '/data/foundation/exim/packages/{PACKAGE_ID}/publish',
    packageExport: '/data/foundation/exim/packages/{PACKAGE_ID}/export',
    packageImport: '/data/foundation/exim/packages/{PACKAGE_ID}/import',
    packageCompare: '/data/foundation/exim/packages/{PACKAGE_ID}/compare',

    // Jobs
    jobs: '/data/foundation/exim/jobs',
    jobById: '/data/foundation/exim/jobs/{JOB_ID}',

    // Sharing
    sharingRequests: '/data/foundation/exim/sharing/requests',
    sharingRequestById: '/data/foundation/exim/sharing/requests/{REQUEST_ID}',
  },

  // Policy Service API (Data Governance)
  policyService: {
    // Data Usage Labels
    labels: '/data/foundation/dulepolicy/labels',
    coreLabels: '/data/foundation/dulepolicy/labels/core',
    customLabels: '/data/foundation/dulepolicy/labels/custom',
    labelByName: '/data/foundation/dulepolicy/labels/{LABEL_NAME}',

    // Data Usage Policies
    policies: '/data/foundation/dulepolicy/policies',
    corePolicies: '/data/foundation/dulepolicy/policies/core',
    customPolicies: '/data/foundation/dulepolicy/policies/custom',
    policyById: '/data/foundation/dulepolicy/policies/{POLICY_ID}',

    // Marketing Actions
    marketingActions: '/data/foundation/dulepolicy/marketingActions',
    coreMarketingActions: '/data/foundation/dulepolicy/marketingActions/core',
    customMarketingActions: '/data/foundation/dulepolicy/marketingActions/custom',
    marketingActionByName: '/data/foundation/dulepolicy/marketingActions/custom/{ACTION_NAME}',

    // Policy Evaluation
    evaluation: '/data/foundation/dulepolicy/marketingActions/{ACTION_NAME}/constraints',
    bulkEvaluation: '/data/foundation/dulepolicy/bulk-evaluation',
  },

  // Query Service API
  queryService: {
    queries: '/data/foundation/query/queries',
    queryById: '/data/foundation/query/queries/{QUERY_ID}',
    templates: '/data/foundation/query/query-templates',
    templateById: '/data/foundation/query/query-templates/{TEMPLATE_ID}',
    schedules: '/data/foundation/query/schedules',
    scheduleById: '/data/foundation/query/schedules/{SCHEDULE_ID}',
    connectionParams: '/data/foundation/query/connection_parameters',
  },

  // Destination Authoring API (Destination SDK)
  destinationAuthoring: {
    destinations: '/authoring/destinations',
    destinationById: '/authoring/destinations/{DESTINATION_ID}',
    destinationServers: '/authoring/destination-servers',
    destinationServerById: '/authoring/destination-servers/{SERVER_ID}',
    credentials: '/authoring/credentials',
    credentialById: '/authoring/credentials/{CREDENTIAL_ID}',
    audienceMetadata: '/authoring/audience-templates',
    audienceMetadataById: '/authoring/audience-templates/{TEMPLATE_ID}',
  },

  // Reactor (Launch)
  reactor: {
    companies: '/companies',
    properties: '/properties',
    extensions: '/extensions',
    extensionPackages: '/extension_packages',
    dataElements: '/data_elements',
    rules: '/rules',
    ruleComponents: '/rule_components',
    environments: '/environments',
    hosts: '/hosts',
    libraries: '/libraries',
    builds: '/builds',
  },

  // Customer Journey Analytics (CJA)
  cja: {
    // Connections
    connections: '/data/connections',
    connectionById: '/data/connections/{connectionId}',
    connectionDatasets: '/data/connections/{connectionId}/datasets',
    connectionBackfills: '/data/connections/{connectionId}/datasets/{datasetId}/backfills',

    // Data Views
    dataviews: '/data/dataviews',
    dataviewById: '/data/dataviews/{dataviewId}',
    dataviewCopy: '/data/dataviews/copy/{dataviewId}',

    // Dimensions
    dimensions: '/data/dataviews/{dataviewId}/dimensions',
    dimensionById: '/data/dataviews/{dataviewId}/dimensions/{dimensionId}',

    // Metrics
    metrics: '/data/dataviews/{dataviewId}/metrics',
    metricById: '/data/dataviews/{dataviewId}/metrics/{metricId}',

    // Filters (Segments in CJA)
    filters: '/filters',
    filterById: '/filters/{filterId}',
    filterValidate: '/filters/validate',

    // Segments
    segments: '/segments',
    segmentById: '/segments/{segmentId}',
    segmentValidate: '/segments/validate',
    segmentsBulkGet: '/segments/bulk-get',

    // Calculated Metrics
    calculatedMetrics: '/calculatedmetrics',
    calculatedMetricById: '/calculatedmetrics/{metricId}',
    calculatedMetricValidate: '/calculatedmetrics/validate',

    // Date Ranges
    dateRanges: '/dateranges',
    dateRangeById: '/dateranges/{dateRangeId}',

    // Projects
    projects: '/projects',
    projectById: '/projects/{projectId}',
  },
} as const;

// ============================================================================
// Migration Configuration
// ============================================================================

export const migrationConfig = {
  // Complete dependency order for ALL asset types
  // Assets are migrated in this order to ensure dependencies exist before dependents
  dependencyOrder: [
    // Foundation Layer (no dependencies)
    'sandbox',                 // Sandboxes must exist (info only - created manually)
    'identityNamespace',       // Must exist before profiles/schemas reference them
    'dataUsageLabel',          // Custom labels before policies

    // Schema Layer
    'fieldGroup',
    'schema',

    // Data Layer
    'dataset',

    // Governance Layer
    'governancePolicy',        // After labels
    'marketingAction',         // Marketing actions for policy evaluation

    // Profile Layer
    'mergePolicy',             // After schemas
    'computedAttribute',       // After schemas, merge policies

    // Segmentation Layer
    'audience',                // After schemas, datasets, merge policies

    // Integration Layer - Sources
    'flowConnection',          // Base connections for flow service
    'sourceConnection',        // Base connections for sources
    'dataFlow',                // After source/target connections

    // Integration Layer - Destinations
    'destinationServer',       // Custom destination servers
    'customDestination',       // Custom destination configs
    'destinationConnection',   // Destination connections

    // Analytics Layer
    'queryTemplate',           // Query templates first
    'querySchedule',           // After templates

    // Launch/Tags Layer
    'launchProperty',          // Properties first
    'launchExtension',         // After properties
    'launchDataElement',       // After extensions
    'launchRule',              // After data elements, extensions
    'launchEnvironment',

    // CJA Layer
    'cjaConnection',           // Needs AEP datasets
    'cjaDataView',             // Needs connections
    'cjaDerivedField',         // Needs data views
    'cjaCalculatedMetric',     // Needs data views
    'cjaSegment',              // Needs data views
    'cjaFilter',               // Needs data views
  ] as const,

  // Asset type dependencies mapping (what each asset type depends on)
  dependencies: {
    identityNamespace: [],
    dataUsageLabel: [],
    fieldGroup: [],
    schema: ['fieldGroup'],
    dataset: ['schema'],
    governancePolicy: ['dataUsageLabel', 'marketingAction'],
    marketingAction: [],
    mergePolicy: ['schema'],
    computedAttribute: ['schema', 'mergePolicy'],
    audience: ['schema', 'dataset', 'mergePolicy'],
    sourceConnection: [],
    dataFlow: ['sourceConnection', 'dataset'],
    destinationServer: [],
    customDestination: ['destinationServer'],
    destinationConnection: ['audience'],
    queryTemplate: ['dataset'],
    querySchedule: ['queryTemplate'],
    launchExtension: [],
    launchDataElement: ['launchExtension'],
    launchRule: ['launchExtension', 'launchDataElement'],
    launchEnvironment: [],
    cjaConnection: ['dataset'],
    cjaDataView: ['cjaConnection'],
    cjaDerivedField: ['cjaDataView'],
    cjaCalculatedMetric: ['cjaDataView'],
    cjaSegment: ['cjaDataView'],
    cjaFilter: ['cjaDataView'],
  } as const,

  // Retry configuration
  retry: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  },

  // Pagination
  pagination: {
    defaultLimit: 100,
    maxLimit: 500,
  },

  // Rate limit handling
  rateLimit: {
    retryAfterDefault: 60, // seconds
    maxRetries: 5,
  },
} as const;

// ============================================================================
// UI Configuration
// ============================================================================

export const uiConfig = {
  // Asset type display names
  assetTypeLabels: {
    // Foundation
    identityNamespace: 'Identity Namespace',
    dataUsageLabel: 'Data Usage Label',

    // Schema & Data
    fieldGroup: 'Field Group',
    schema: 'Schema',
    dataset: 'Dataset',

    // Governance
    governancePolicy: 'Governance Policy',
    marketingAction: 'Marketing Action',

    // Profile
    mergePolicy: 'Merge Policy',
    computedAttribute: 'Computed Attribute',

    // Segmentation
    audience: 'Audience',

    // Flow Service (Sources & Destinations)
    sourceConnection: 'Source Connection',
    destinationConnection: 'Destination Connection',
    dataFlow: 'Data Flow',

    // Destination SDK
    destinationServer: 'Destination Server',
    customDestination: 'Custom Destination',

    // Query Service
    queryTemplate: 'Query Template',
    querySchedule: 'Query Schedule',

    // Launch/Tags
    launchProperty: 'Launch Property',
    launchExtension: 'Extension',
    launchDataElement: 'Data Element',
    launchRule: 'Rule',
    launchEnvironment: 'Environment',

    // CJA asset types
    cjaConnection: 'CJA Connection',
    cjaDataView: 'CJA Data View',
    cjaSegment: 'CJA Segment',
    cjaFilter: 'CJA Filter',
    cjaCalculatedMetric: 'CJA Calculated Metric',
    cjaDerivedField: 'CJA Derived Field',
  } as const,

  // Status colors
  statusColors: {
    pending: 'gray',
    in_progress: 'blue',
    completed: 'green',
    failed: 'red',
    skipped: 'yellow',
  } as const,

  // Log level colors
  logLevelColors: {
    info: 'blue',
    warn: 'yellow',
    error: 'red',
    success: 'green',
  } as const,
} as const;
