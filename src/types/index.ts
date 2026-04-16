// ============================================================================
// Adobe Organization Types
// ============================================================================

export interface AdobeCredentials {
  clientId: string;
  clientSecret: string;
  orgId: string;
  technicalAccountId?: string;
  sandboxName: string;
}

export interface Organization {
  id: string;
  name: string;
  type: 'source' | 'target';
  credentials: AdobeCredentials;
  accessToken?: string;
  tokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// AEP Resource Types
// ============================================================================

export interface Schema {
  $id: string;
  title: string;
  description?: string;
  type: string;
  meta: {
    class: string;
    extends: string[];
    containerId: string;
    tenantId: string;
    sandboxId: string;
    sandboxType: string;
  };
  allOf?: SchemaReference[];
  properties?: Record<string, unknown>;
  version: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SchemaReference {
  $ref: string;
  type?: string;
  meta?: {
    refProperty?: string;
  };
}

export interface FieldGroup {
  $id: string;
  title: string;
  description?: string;
  type: string;
  meta: {
    abstract?: boolean;
    extensible?: boolean;
    containerId: string;
    tenantId: string;
    intendedToExtend?: string[];
  };
  definitions?: Record<string, unknown>;
  allOf?: SchemaReference[];
  version: string;
}

export interface Dataset {
  id: string;
  name: string;
  description?: string;
  schemaRef: {
    id: string;
    contentType: string;
  };
  tags?: Record<string, string[]>;
  fileDescription?: {
    format: string;
    delimiters?: string[];
  };
  state: 'DRAFT' | 'ENABLED' | 'DISABLED';
  createdAt: number;
  updatedAt: number;
}

export interface Audience {
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
  state: 'DRAFT' | 'REALIZED' | 'FAILED';
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Identity Service Types
// ============================================================================

export type IdentityType =
  | 'COOKIE'
  | 'DEVICE'
  | 'CROSS_DEVICE'
  | 'EMAIL'
  | 'PHONE'
  | 'NON_PEOPLE'
  | 'CUSTOM';

export interface IdentityNamespace {
  id: number;
  code: string;
  name: string;
  description?: string;
  idType: IdentityType;
  status: 'ACTIVE' | 'INACTIVE';
  createTime?: number;
  updateTime?: number;
  custom: boolean;
  namespaceType?: 'Standard' | 'Custom' | 'Integration';
  imsOrgId?: string;
}

export interface IdentityCluster {
  xid: string;
  compositeXid?: {
    nsid: number;
    id: string;
  };
  identities: IdentityClusterMember[];
}

export interface IdentityClusterMember {
  namespace: {
    code: string;
    id?: number;
  };
  id: string;
  xid?: string;
}

export interface IdentityMapping {
  xid: string;
  mapping: {
    xid: string;
    lastAssociatedTS: number;
  }[];
}

export interface IdentityGraphLink {
  source: {
    namespace: string;
    id: string;
  };
  target: {
    namespace: string;
    id: string;
  };
  linkType?: string;
  updatedTime?: number;
}

// ============================================================================
// Real-time Customer Profile Types
// ============================================================================

export interface MergePolicy {
  id: string;
  name: string;
  imsOrgId: string;
  sandboxId?: string;
  sandbox?: {
    sandboxId: string;
    sandboxName: string;
    type: string;
    default: boolean;
  };
  schema: {
    name: string;
  };
  default: boolean;
  activeOnEdge?: boolean;
  identityGraph: {
    type: 'none' | 'pdg' | 'coop';
  };
  attributeMerge: {
    type: 'timestampOrdered' | 'dataSetPrecedence';
    order?: string[];
  };
  isActiveOnEdge?: boolean;
  updateEpoch?: number;
  version?: number;
  createdAt?: number;
  modifiedAt?: number;
}

export interface ComputedAttribute {
  id: string;
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
  status: 'DRAFT' | 'NEW' | 'INITIALIZING' | 'ACTIVE' | 'INACTIVE' | 'DELETED';
  keepCurrent?: boolean;
  refreshSchedule?: {
    frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  };
  createEpoch: number;
  updateEpoch: number;
  createdBy?: string;
}

export interface ProfileEntity {
  entityId: string;
  mergePolicy: {
    id: string;
  };
  identityGraph?: string[];
  sources?: string[];
  tags?: string[];
  entity?: Record<string, unknown>;
  lastModifiedAt?: string;
}

export interface ProfileExportJob {
  id: string;
  jobType: 'BATCH' | 'STREAMING';
  status: 'NEW' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';
  destination: {
    datasetId: string;
  };
  filter?: {
    segments?: Array<{
      segmentId: string;
    }>;
    segmentQualificationTime?: {
      startTime: string;
      endTime: string;
    };
  };
  schema?: {
    name: string;
  };
  mergePolicyId?: string;
  computedAttributes?: string[];
  creationTime?: number;
  updateTime?: number;
  requestId?: string;
}

// ============================================================================
// Flow Service Types (Sources & Destinations)
// ============================================================================

export interface FlowConnection {
  id: string;
  name: string;
  description?: string;
  connectionSpec: {
    id: string;
    version: string;
  };
  state: 'enabled' | 'disabled' | 'draft';
  auth?: {
    specName: string;
    params: Record<string, unknown>;
  };
  params?: Record<string, unknown>;
  version: string;
  etag: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  updatedBy?: string;
  inheritedAttributes?: Record<string, unknown>;
}

export interface ConnectionSpec {
  id: string;
  name: string;
  description?: string;
  providerId: string;
  version: string;
  authSpec?: ConnectionAuthSpec[];
  sourceSpec?: {
    name: string;
    type: string;
    spec?: Record<string, unknown>;
    attributes?: Record<string, unknown>;
  };
  targetSpec?: {
    name: string;
    type: string;
    spec?: Record<string, unknown>;
  };
  attributes?: {
    category?: string;
    isSource?: boolean;
    isDestination?: boolean;
    uiAttributes?: Record<string, unknown>;
  };
  permissionsInfo?: {
    view: Array<{ '@type': string; name: string }>;
    manage: Array<{ '@type': string; name: string }>;
  };
}

export interface ConnectionAuthSpec {
  name: string;
  type: string;
  spec: Record<string, unknown>;
}

export interface FlowSpec {
  id: string;
  name: string;
  description?: string;
  providerId: string;
  version: string;
  sourceConnectionSpecIds?: string[];
  targetConnectionSpecIds?: string[];
  transformationSpecs?: FlowTransformationSpec[];
  scheduleSpec?: {
    name: string;
    type: string;
    spec: Record<string, unknown>;
  };
  attributes?: Record<string, unknown>;
}

export interface FlowTransformationSpec {
  name: string;
  spec: {
    mappingId: { required: boolean };
    mappingVersion?: { required: boolean };
  };
}

export interface DataFlow {
  id: string;
  name: string;
  description?: string;
  flowSpec: {
    id: string;
    version: string;
  };
  state: 'enabled' | 'disabled' | 'draft';
  sourceConnectionIds: string[];
  targetConnectionIds: string[];
  transformations?: FlowTransformation[];
  scheduleParams?: {
    startTime: number;
    frequency: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'once';
    interval: number;
    backfill?: boolean;
  };
  version: string;
  etag: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  lastOperation?: {
    started: number;
    completed?: number;
    status: string;
    recordSummary?: {
      inputRecordCount: number;
      outputRecordCount: number;
      failedRecordCount: number;
    };
  };
}

export interface FlowTransformation {
  name: string;
  params: {
    mappingId?: string;
    mappingVersion?: string;
    [key: string]: unknown;
  };
}

export interface SourceConnection {
  id: string;
  name: string;
  description?: string;
  baseConnectionId: string;
  connectionSpec: {
    id: string;
    version: string;
  };
  data?: {
    format: string;
    schema?: {
      id: string;
      version?: string;
    };
    properties?: Record<string, unknown>;
  };
  params?: Record<string, unknown>;
  state?: 'enabled' | 'disabled' | 'draft';
  version: string;
  etag: string;
  createdAt: number;
  updatedAt: number;
}

export interface TargetConnection {
  id: string;
  name: string;
  description?: string;
  baseConnectionId?: string;
  connectionSpec: {
    id: string;
    version: string;
  };
  data?: {
    format: string;
    schema?: {
      id: string;
      version?: string;
    };
  };
  params?: {
    dataSetId?: string;
    segmentId?: string;
    path?: string;
    [key: string]: unknown;
  };
  state?: 'enabled' | 'disabled' | 'draft';
  version: string;
  etag: string;
  createdAt: number;
  updatedAt: number;
}

export interface FlowRun {
  id: string;
  flowId: string;
  state: 'processing' | 'success' | 'failed' | 'canceling' | 'canceled';
  startedAtUTC: number;
  completedAtUTC?: number;
  transformerMessageCount?: number;
  sinkMessageCount?: number;
  recordSummary?: {
    inputRecordCount: number;
    outputRecordCount: number;
    failedRecordCount: number;
    filteredRecordCount?: number;
  };
  errors?: Array<{
    code: string;
    message: string;
  }>;
  metrics?: {
    durationSummary?: {
      startedAtUTC: number;
      completedAtUTC: number;
    };
    sizeSummary?: {
      inputBytes: number;
      outputBytes: number;
    };
  };
}

// ============================================================================
// Sandbox & Sandbox Tooling Types
// ============================================================================

export interface Sandbox {
  name: string;
  title: string;
  state: 'creating' | 'active' | 'deleted' | 'failed' | 'resetting';
  type: 'production' | 'development';
  region: string;
  isDefault: boolean;
  eTag: string;
  createdDate: string;
  modifiedDate: string;
  createdBy: string;
  modifiedBy: string;
  organization?: string;
}

export interface SandboxType {
  name: string;
  title: string;
  description?: string;
}

export interface SandboxPackage {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'PUBLISH_IN_PROGRESS' | 'PUBLISH_FAILED';
  type: 'FULL' | 'PARTIAL';
  sourceSandbox: {
    name: string;
    imsOrgId?: string;
  };
  artifacts: PackageArtifact[];
  publishedDate?: string;
  createdDate: string;
  modifiedDate?: string;
  createdBy: string;
  modifiedBy?: string;
  expiryDate?: string;
  packageAccessType?: 'PRIVATE' | 'PUBLIC';
}

export type PackageArtifactType =
  | 'SCHEMA'
  | 'SCHEMA_FIELD_GROUP'
  | 'SCHEMA_DATA_TYPE'
  | 'SCHEMA_CLASS'
  | 'DATASET'
  | 'SEGMENT'
  | 'DESTINATION'
  | 'DESTINATION_ACCOUNT'
  | 'JOURNEY'
  | 'IDENTITY_NAMESPACE'
  | 'MERGE_POLICY'
  | 'COMPUTED_ATTRIBUTE'
  | 'LABEL'
  | 'GOVERNANCE_POLICY'
  | 'SOURCE_DATAFLOW'
  | 'QUERY_TEMPLATE'
  | 'ALL';

export interface PackageArtifact {
  id: string;
  type: PackageArtifactType;
  title: string;
  sandboxName?: string;
  foundExisting?: boolean;
  status?: 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'PARTIAL';
  messages?: string[];
  action?: 'CREATE' | 'UPDATE' | 'SKIP' | 'REUSE';
  targetArtifactId?: string;
}

export interface PackageImportJob {
  id: string;
  packageId: string;
  targetSandbox: {
    name: string;
    imsOrgId?: string;
  };
  status: 'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  jobType: 'IMPORT' | 'EXPORT';
  artifacts: PackageArtifact[];
  createdDate: string;
  completedDate?: string;
  createdBy: string;
  errorMessage?: string;
  importOptions?: {
    conflictResolution?: 'SKIP' | 'OVERWRITE' | 'RENAME';
  };
}

export interface PackageComparison {
  differences: PackageArtifact[];
  sourceSandbox: string;
  targetSandbox: string;
  packageId: string;
  totalArtifacts: number;
  newArtifacts: number;
  existingArtifacts: number;
  conflictingArtifacts: number;
}

// ============================================================================
// Policy Service Types (Data Governance)
// ============================================================================

export type LabelCategory = 'CONTRACT' | 'IDENTITY' | 'SENSITIVE' | 'PARTNER_ECOSYSTEM' | 'CUSTOM';

export interface DataUsageLabel {
  name: string;
  category: LabelCategory;
  friendlyName: string;
  description?: string;
  custom: boolean;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  updatedBy?: string;
}

export interface MarketingAction {
  name: string;
  description?: string;
  imsOrg?: string;
  custom: boolean;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  createdClient?: string;
}

export interface DataGovernancePolicy {
  id: string;
  name: string;
  description?: string;
  status: 'ENABLED' | 'DISABLED' | 'DRAFT';
  imsOrg: string;
  sandboxName?: string;
  marketingActionRefs: string[];
  denyExpression: PolicyDenyExpression;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  updatedBy?: string;
  createdClient?: string;
}

export interface PolicyDenyExpression {
  operator: 'OR' | 'AND';
  operands: PolicyOperand[];
}

export interface PolicyOperand {
  label?: string;
  operator?: 'OR' | 'AND';
  operands?: PolicyOperand[];
}

export interface PolicyEvaluationResult {
  timestamp: number;
  clientId: string;
  userId: string;
  imsOrg: string;
  sandboxName?: string;
  marketingActionRef: string;
  duleLabels: string[];
  discoveredLabels?: {
    entityType: string;
    entityId: string;
    labels: string[];
  }[];
  violatedPolicies: DataGovernancePolicy[];
}

// ============================================================================
// Query Service Types
// ============================================================================

export interface SavedQuery {
  id: string;
  name?: string;
  description?: string;
  sql: string;
  dbName: string;
  state: 'SUBMITTED' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'KILLED';
  outputSchema?: string;
  outputDatasetId?: string;
  effectiveSQL?: string;
  rowCount?: number;
  created: string;
  updated: string;
  userId: string;
  client?: string;
  clientId?: string;
  imsOrgId?: string;
  sandboxName?: string;
  request?: {
    dbName: string;
    sql: string;
    name?: string;
  };
}

export interface QueryTemplate {
  id: string;
  name: string;
  description?: string;
  sql: string;
  queryParameters?: Record<string, unknown>;
  userId: string;
  created: string;
  updated: string;
  imsOrgId?: string;
  sandboxName?: string;
  lastUpdatedBy?: string;
}

export interface QuerySchedule {
  id: string;
  name: string;
  description?: string;
  templateId?: string;
  template?: QueryTemplate;
  query: {
    sql: string;
    dbName: string;
    name?: string;
  };
  schedule: {
    cron: string;
    timezone?: string;
    startDate?: string;
    endDate?: string;
  };
  state: 'ENABLED' | 'DISABLED';
  lastRun?: {
    id: string;
    state: string;
    startedAt: string;
    completedAt?: string;
  };
  userId: string;
  created: string;
  updated: string;
  imsOrgId?: string;
  sandboxName?: string;
}

// ============================================================================
// Destination Authoring Types (Destination SDK)
// ============================================================================

export interface DestinationConfig {
  id: string;
  name: string;
  description?: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'DELETED';
  customerAuthenticationConfigurations: CustomerAuthConfig[];
  customerDataFields?: CustomerDataField[];
  uiAttributes: {
    documentationLink?: string;
    category: string;
    connectionType: string;
    frequency?: string;
    isBeta?: boolean;
  };
  identityNamespaces?: string[];
  schemaConfig?: {
    profileRequired?: boolean;
    segmentRequired?: boolean;
    identityRequired?: boolean;
  };
  destinationDelivery?: DestinationDelivery[];
  audienceMetadataConfig?: {
    mapExperiencePlatformSegmentId?: boolean;
    mapExperiencePlatformSegmentName?: boolean;
    mapUserInput?: boolean;
  };
  backfillHistoricalProfileData?: boolean;
  aggregation?: {
    aggregationType: 'BEST_EFFORT' | 'CONFIGURABLE_AGGREGATION';
    bestEffortAggregation?: {
      maxUsersPerRequest: number;
    };
  };
  createdDate?: string;
  lastModifiedDate?: string;
}

export interface CustomerAuthConfig {
  authType: 'BEARER' | 'S3' | 'AZURE_CONNECTION_STRING' | 'BASIC' | 'OAUTH2_AUTHORIZATION_CODE' | 'OAUTH2_CLIENT_CREDENTIALS' | 'OAUTH2_PASSWORD' | 'OAUTH2_REFRESH_TOKEN' | 'SFTP_WITH_PASSWORD' | 'SFTP_WITH_SSH_KEY';
  params?: Record<string, unknown>;
}

export interface CustomerDataField {
  name: string;
  title: string;
  description?: string;
  type: 'string' | 'object' | 'array' | 'integer' | 'boolean';
  isRequired?: boolean;
  pattern?: string;
  enum?: string[];
  default?: unknown;
  hidden?: boolean;
  readOnly?: boolean;
  conditional?: Record<string, unknown>;
}

export interface DestinationDelivery {
  authenticationRule: 'CUSTOMER_AUTHENTICATION' | 'PLATFORM_AUTHENTICATION' | 'NONE';
  destinationServerId: string;
}

export interface DestinationServer {
  id: string;
  name: string;
  destinationServerType: 'URL_BASED' | 'FILE_BASED' | 'STREAMING';
  urlBasedDestination?: {
    url: {
      templatingStrategy: 'NONE' | 'PEBBLE_V1';
      value: string;
    };
    maxUsersPerRequest?: number;
  };
  httpTemplate?: {
    httpMethod: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    requestBody?: {
      templatingStrategy: 'NONE' | 'PEBBLE_V1';
      value: string;
    };
    contentType?: string;
    headers?: Record<string, string>;
  };
  fileBasedDestination?: {
    fileType: 'CSV' | 'JSON' | 'PARQUET';
    fileName: {
      templatingStrategy: 'NONE' | 'PEBBLE_V1';
      value: string;
    };
    path?: {
      templatingStrategy: 'NONE' | 'PEBBLE_V1';
      value: string;
    };
  };
  createdDate?: string;
  lastModifiedDate?: string;
}

// ============================================================================
// Adobe Launch / Reactor Types
// ============================================================================

export interface LaunchProperty {
  id: string;
  type: 'properties';
  attributes: {
    name: string;
    platform: 'web' | 'mobile';
    development: boolean;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
  relationships: {
    company: { data: { id: string; type: 'companies' } };
    extensions?: { links: { related: string } };
    rules?: { links: { related: string } };
    data_elements?: { links: { related: string } };
    environments?: { links: { related: string } };
    libraries?: { links: { related: string } };
  };
  links: {
    self: string;
  };
}

export interface LaunchExtension {
  id: string;
  type: 'extensions';
  attributes: {
    name: string;
    displayName: string;
    version: string;
    settings?: string;
    delegateDescriptorId?: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
  relationships: {
    extension_package: { data: { id: string; type: 'extension_packages' } };
    property: { data: { id: string; type: 'properties' } };
  };
}

export interface LaunchDataElement {
  id: string;
  type: 'data_elements';
  attributes: {
    name: string;
    settings?: string;
    delegateDescriptorId: string;
    storageDuration?: 'pageview' | 'session' | 'visitor';
    defaultValue?: string;
    forceLowerCase?: boolean;
    cleanText?: boolean;
    enabled: boolean;
    revisionNumber: number;
    createdAt: string;
    updatedAt: string;
  };
  relationships: {
    property: { data: { id: string; type: 'properties' } };
    extension: { data: { id: string; type: 'extensions' } };
  };
}

export interface LaunchRule {
  id: string;
  type: 'rules';
  attributes: {
    name: string;
    enabled: boolean;
    revisionNumber: number;
    createdAt: string;
    updatedAt: string;
  };
  relationships: {
    property: { data: { id: string; type: 'properties' } };
    rule_components?: { links: { related: string } };
  };
}

export interface LaunchRuleComponent {
  id: string;
  type: 'rule_components';
  attributes: {
    name: string;
    settings?: string;
    order: number;
    delegateDescriptorId: string;
    negate?: boolean;
    ruleOrder?: number;
    timeout?: number;
    delayNext?: boolean;
    createdAt: string;
    updatedAt: string;
  };
  relationships: {
    rule: { data: { id: string; type: 'rules' } };
    extension: { data: { id: string; type: 'extensions' } };
  };
}

export interface LaunchEnvironment {
  id: string;
  type: 'environments';
  attributes: {
    name: string;
    stage: 'development' | 'staging' | 'production';
    archiveStatus?: string;
    createdAt: string;
    updatedAt: string;
  };
  relationships: {
    property: { data: { id: string; type: 'properties' } };
    host: { data: { id: string; type: 'hosts' } };
  };
}

export interface LaunchHost {
  id: string;
  type: 'hosts';
  attributes: {
    name: string;
    typeName: 'akamai' | 'sftp';
    createdAt: string;
    updatedAt: string;
  };
  relationships: {
    property: { data: { id: string; type: 'properties' } };
  };
}

// ============================================================================
// Migration Types
// ============================================================================

export type AssetType =
  // Foundation Layer
  | 'identityNamespace'
  | 'dataUsageLabel'

  // Schema & Data Layer
  | 'fieldGroup'
  | 'schema'
  | 'dataset'

  // Governance Layer
  | 'governancePolicy'
  | 'marketingAction'

  // Profile Layer
  | 'mergePolicy'
  | 'computedAttribute'

  // Segmentation Layer
  | 'audience'

  // Flow Service (Sources & Destinations)
  | 'sourceConnection'
  | 'destinationConnection'
  | 'dataFlow'

  // Destination SDK
  | 'destinationServer'
  | 'customDestination'

  // Query Service
  | 'queryTemplate'
  | 'querySchedule'

  // Launch/Tags
  | 'launchProperty'
  | 'launchExtension'
  | 'launchDataElement'
  | 'launchRule'
  | 'launchEnvironment'

  // CJA asset types
  | 'cjaConnection'
  | 'cjaDataView'
  | 'cjaSegment'
  | 'cjaFilter'
  | 'cjaCalculatedMetric'
  | 'cjaDerivedField';

export interface MigrationAsset {
  id: string;
  type: AssetType;
  name: string;
  sourceId: string;
  targetId?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  error?: string;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface MigrationJob {
  id: string;
  sourceOrgId: string;
  targetOrgId: string;
  assets: MigrationAsset[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  createdBy: string;
  logs: MigrationLog[];
  idMappings: IdMapping[];
  options: MigrationOptions;
}

export interface MigrationOptions {
  dryRun: boolean;
  conflictStrategy: 'skip' | 'overwrite' | 'rename';
  copyDependencies: boolean;
  includePublishing: boolean;
}

export interface MigrationLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  assetId?: string;
  assetType?: AssetType;
  details?: Record<string, unknown>;
}

export interface IdMapping {
  assetType: AssetType;
  sourceId: string;
  targetId: string;
  name: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface AdobeApiResponse<T> {
  results?: T[];
  data?: T | T[];
  _page?: {
    count: number;
    limit: number;
  };
  _links?: {
    next?: { href: string };
    self?: { href: string };
  };
  meta?: {
    globalSchemas?: string[];
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

// ============================================================================
// User & Auth Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface Session {
  user: User;
  token: string;
  expiresAt: Date;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface SelectableAsset {
  id: string;
  type: AssetType;
  name: string;
  selected: boolean;
  dependencies: string[];
  dependencyNames?: string[];
  exists?: boolean;
  conflict?: boolean;
}

export interface ComparisonResult {
  asset: SelectableAsset;
  sourceData: unknown;
  targetData?: unknown;
  differences: string[];
  action: 'create' | 'update' | 'skip' | 'conflict';
}

// ============================================================================
// CJA (Customer Journey Analytics) Types
// ============================================================================

export interface CJAConnection {
  id: string;
  name: string;
  description?: string;
  owner?: {
    id: string;
    name?: string;
  };
  dataSets: CJAConnectionDataset[];
  sandboxId?: string;
  sandboxName?: string;
  createdDate?: string;
  modifiedDate?: string;
  organization?: string;
  backfillEnabled?: boolean;
  streamingEnabled?: boolean;
}

export interface CJAConnectionDataset {
  datasetId: string;
  name?: string;
  type: 'event' | 'profile' | 'lookup' | 'summary';
  schemaInfo?: {
    schemaId: string;
    schemaName?: string;
  };
  timestampField?: string;
  personIdField?: string;
  backfillStatus?: string;
}

export interface CJADataView {
  id: string;
  name: string;
  description?: string;
  owner?: {
    id: string;
    name?: string;
  };
  parentDataGroupId?: string; // Connection ID
  timezoneDesignator?: string;
  currentTimezoneOffset?: number;
  sessionDefinition?: CJASessionDefinition;
  components?: CJADataViewComponent[];
  externalData?: {
    externalId?: string;
  };
  createdDate?: string;
  modifiedDate?: string;
  organization?: string;
}

export interface CJASessionDefinition {
  sessionTimeout?: number;
  sessionTimeoutUnit?: 'MINUTES' | 'HOURS' | 'DAYS';
  newSessionOnNewVisit?: boolean;
}

export interface CJADataViewComponent {
  id: string;
  componentId: string;
  componentType: 'dimension' | 'metric';
  name: string;
  description?: string;
  schemaPath?: string;
  dataSetType?: string;
  sourceComponentId?: string;

  // Attribution settings
  attribution?: CJAAttributionSettings;

  // Persistence settings
  persistence?: CJAPersistenceSettings;

  // Include/Exclude values
  includeExcludeSetting?: CJAIncludeExcludeSetting;

  // Format settings
  format?: CJAFormatSettings;

  // Value bucketing
  bucketing?: CJABucketingSettings;

  // No value options
  noValueOptionsSetting?: {
    treatAsNoValue?: string[];
    reportNoValueAs?: string;
  };

  // Deduplication
  deduplication?: {
    enabled?: boolean;
    scope?: 'session' | 'person';
  };

  // Context labels
  contextLabels?: string[];

  // Hide from reporting
  hidden?: boolean;

  // Derived field reference
  derivedFieldId?: string;
}

export interface CJAAttributionSettings {
  model: 'lastTouch' | 'firstTouch' | 'linear' | 'participation' | 'sameTouch' | 'uShaped' | 'jCurve' | 'inverse_j' | 'custom' | 'timeDecay' | 'positionBased';
  container?: 'session' | 'person' | 'global';
  lookbackWindow?: {
    type: 'reporting' | 'custom';
    granularity?: 'MINUTES' | 'HOURS' | 'DAYS' | 'WEEKS';
    numPeriods?: number;
  };
}

export interface CJAPersistenceSettings {
  allocation: 'mostRecent' | 'all' | 'firstKnown' | 'lastKnown';
  expiration: {
    type: 'session' | 'person' | 'time' | 'metric' | 'never';
    granularity?: 'MINUTES' | 'HOURS' | 'DAYS' | 'WEEKS';
    numPeriods?: number;
    metric?: string;
  };
  scope?: 'session' | 'person';
}

export interface CJAIncludeExcludeSetting {
  type: 'include' | 'exclude';
  caseSensitive?: boolean;
  match: 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'containsAny';
  values: string[];
}

export interface CJAFormatSettings {
  type?: 'decimal' | 'currency' | 'percent' | 'time';
  decimalPlaces?: number;
  currencyCode?: string;
  showUpDownTrend?: boolean;
  showPercentChange?: boolean;
}

export interface CJABucketingSettings {
  enabled: boolean;
  buckets?: {
    min?: number;
    max?: number;
    name?: string;
  }[];
}

export interface CJADerivedField {
  id: string;
  name: string;
  description?: string;
  definition: {
    rules: CJADerivedFieldRule[];
  };
  connectionId?: string;
  outputField?: {
    name: string;
    type: 'string' | 'integer' | 'double' | 'boolean';
  };
  createdDate?: string;
  modifiedDate?: string;
}

export interface CJADerivedFieldRule {
  id?: string;
  type: string; // 'case-when', 'lookup', 'concatenate', 'regex-replace', etc.
  function: string;
  parameters: Record<string, unknown>;
  order?: number;
}

export interface CJASegment {
  id: string;
  name: string;
  description?: string;
  owner?: {
    id: string;
    name?: string;
  };
  definition: CJASegmentDefinition;
  dataId?: string; // Data view ID
  rsid?: string; // Report suite / data view ID
  tags?: string[];
  compatibility?: {
    valid?: boolean;
    message?: string;
  };
  createdDate?: string;
  modifiedDate?: string;
}

export interface CJASegmentDefinition {
  container: CJASegmentContainer;
  func: 'segment';
  version: [number, number, number];
}

export interface CJASegmentContainer {
  func: 'container';
  context: 'hits' | 'visits' | 'visitors' | 'events' | 'sessions' | 'people';
  pred: CJASegmentPredicate;
}

export interface CJASegmentPredicate {
  func: string;
  description?: string;
  val?: unknown;
  evt?: {
    func: string;
    name: string;
  };
  str?: string;
  num?: number;
  preds?: CJASegmentPredicate[];
}

export interface CJAFilter {
  id: string;
  name: string;
  description?: string;
  owner?: {
    id: string;
    name?: string;
  };
  definition: CJAFilterDefinition;
  dataId?: string;
  tags?: string[];
  compatibility?: {
    valid?: boolean;
    message?: string;
  };
  createdDate?: string;
  modifiedDate?: string;
}

export interface CJAFilterDefinition {
  container: CJAFilterContainer;
  func: 'segment';
  version: [number, number, number];
}

export interface CJAFilterContainer {
  func: 'container';
  context: 'events' | 'sessions' | 'people';
  pred: CJAFilterPredicate;
}

export interface CJAFilterPredicate {
  func: string;
  description?: string;
  val?: unknown;
  evt?: {
    func: string;
    name: string;
  };
  str?: string;
  num?: number;
  preds?: CJAFilterPredicate[];
}

export interface CJACalculatedMetric {
  id: string;
  name: string;
  description?: string;
  owner?: {
    id: string;
    name?: string;
  };
  dataId?: string; // Data view ID
  rsid?: string;
  type?: 'decimal' | 'percent' | 'currency' | 'time';
  precision?: number;
  definition: CJACalculatedMetricDefinition;
  tags?: string[];
  polarity?: 'positive' | 'negative';
  createdDate?: string;
  modifiedDate?: string;
}

export interface CJACalculatedMetricDefinition {
  func: 'calc-metric';
  formula: CJAMetricFormula;
  version: [number, number, number];
}

export interface CJAMetricFormula {
  func: string; // 'divide', 'multiply', 'add', 'subtract', 'metric', etc.
  col1?: CJAMetricFormula;
  col2?: CJAMetricFormula;
  name?: string; // For metric func
  description?: string;
  val?: number;
}

// CJA Asset Types
export type CJAAssetType =
  | 'cjaConnection'
  | 'cjaDataView'
  | 'cjaSegment'
  | 'cjaFilter'
  | 'cjaCalculatedMetric'
  | 'cjaDerivedField';

// CJA API Response Types
export interface CJAApiResponse<T> {
  content?: T[];
  result?: T;
  data?: T | T[];
  totalElements?: number;
  totalPages?: number;
  numberOfElements?: number;
  page?: {
    number: number;
    size: number;
    totalElements: number;
    totalPages: number;
  };
}
