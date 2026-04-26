import { NextRequest, NextResponse } from 'next/server';
import {
  createSchemaService,
  createDatasetService,
  createAudienceService,
  createReactorService,
  createIdentityService,
  createProfileService,
  createFlowService,
  createSandboxToolingService,
  createPolicyService,
} from '@/services/adobe';
import { createLogger } from '@/utils/logger';
import { migrationConfig } from '@/config';

const logger = createLogger('API:Migration:Start');

// Helper to extract tenant namespace from org's existing field groups
async function getTenantNamespace(schemaService: any, addLog: Function, job: any): Promise<string | null> {
  try {
    const fieldGroups = await schemaService.listFieldGroups();
    if (fieldGroups.length > 0) {
      // Extract namespace from the first custom field group's $id
      // Format: https://ns.adobe.com/{TENANT_ID}/mixins/...
      const firstFG = fieldGroups[0];
      const match = firstFG.$id?.match(/https:\/\/ns\.adobe\.com\/([^\/]+)\//);
      if (match) {
        return match[1];
      }
    }
  } catch (e: any) {
    addLog(job, 'warn', `Could not determine tenant namespace: ${e.message}`);
  }
  return null;
}

// Helper to find matching field group by title
// Note: We only match by title since target field groups from listing API don't have full structure
function findMatchingFieldGroup(
  sourceFieldGroup: any,
  targetFieldGroups: any[]
): any | null {
  const sourceTitle = (sourceFieldGroup.title || '').trim().toLowerCase();

  // First try exact match (case-insensitive, trimmed)
  for (const fg of targetFieldGroups) {
    const targetTitle = (fg.title || '').trim().toLowerCase();
    if (targetTitle === sourceTitle) {
      return fg;
    }
  }

  return null;
}

// Helper to transform namespace in object keys and values
function transformNamespace(obj: any, sourceNamespace: string, targetNamespace: string): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Replace namespace in string values (like $refs)
    return obj
      .replace(new RegExp(`https://ns\\.adobe\\.com/${sourceNamespace}/`, 'g'), `https://ns.adobe.com/${targetNamespace}/`)
      .replace(new RegExp(`_${sourceNamespace}`, 'g'), `_${targetNamespace}`)
      .replace(new RegExp(`${sourceNamespace}:`, 'g'), `${targetNamespace}:`);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => transformNamespace(item, sourceNamespace, targetNamespace));
  }

  if (typeof obj === 'object') {
    const transformed: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Transform key if it contains namespace
      let newKey = key
        .replace(new RegExp(`_${sourceNamespace}`, 'g'), `_${targetNamespace}`)
        .replace(new RegExp(`${sourceNamespace}:`, 'g'), `${targetNamespace}:`);
      transformed[newKey] = transformNamespace(value, sourceNamespace, targetNamespace);
    }
    return transformed;
  }

  return obj;
}

// Helper to transform segment IDs in PQL expressions for inSegment dependencies
// When audiences reference other audiences via inSegment(), we need to map source IDs to target IDs
function transformSegmentIds(pqlExpression: string, segmentIdMapping: Map<string, string>): { transformed: string; mappingsApplied: number } {
  let transformed = pqlExpression;
  let mappingsApplied = 0;

  // Pattern to match segment IDs in inSegment calls
  // PQL JSON format: "inSegment","params":[{"nodeType":"literal","literalType":"String","value":"UUID"}]
  // We need to replace the UUID values that reference other segments
  for (const [sourceId, targetId] of segmentIdMapping.entries()) {
    // Match segment IDs in various PQL patterns
    const patterns = [
      // JSON format: "value":"uuid"
      new RegExp(`"value":\\s*"${sourceId}"`, 'g'),
      // Direct ID reference
      new RegExp(`"${sourceId}"`, 'g'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(transformed)) {
        const before = transformed;
        transformed = transformed.replace(pattern, (match) => {
          return match.replace(sourceId, targetId);
        });
        if (before !== transformed) {
          mappingsApplied++;
        }
      }
    }
  }

  return { transformed, mappingsApplied };
}

// Helper to recursively clean up empty 'properties' objects that cause XDM validation errors
// Adobe Schema Registry rejects objects like {"properties": {}, "type": "object"}
// Also cleans up objects with type: "object" but missing required properties/additionalProperties/$ref/allOf
function cleanupEmptyProperties(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanupEmptyProperties(item)).filter(item => item !== undefined);
  }

  if (typeof obj === 'object') {
    const cleaned: any = {};

    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = cleanupEmptyProperties(value);

      // Skip empty 'properties' objects - these cause validation errors
      if (key === 'properties' &&
          typeof cleanedValue === 'object' &&
          cleanedValue !== null &&
          !Array.isArray(cleanedValue) &&
          Object.keys(cleanedValue).length === 0) {
        // Don't include empty properties object
        continue;
      }

      // Also skip the parent object if it only has type: "object" and no properties after cleanup
      // This handles cases where a field becomes meaningless after removing empty properties
      if (cleanedValue !== undefined) {
        cleaned[key] = cleanedValue;
      }
    }

    // XDM requires objects to have properties, additionalProperties, $ref, or allOf
    // If an object has type: "object" but none of these, it's invalid and should be removed
    if (cleaned.type === 'object') {
      const hasValidObjectDefinition =
        (cleaned.properties && Object.keys(cleaned.properties).length > 0) ||
        cleaned.additionalProperties !== undefined ||
        cleaned.$ref !== undefined ||
        (cleaned.allOf && cleaned.allOf.length > 0);

      if (!hasValidObjectDefinition) {
        // This object is invalid in XDM - return undefined to remove it
        return undefined;
      }
    }

    // Clean up properties object if any of its child fields were removed
    if (cleaned.properties && typeof cleaned.properties === 'object') {
      const cleanedProps: any = {};
      for (const [propKey, propValue] of Object.entries(cleaned.properties)) {
        if (propValue !== undefined) {
          cleanedProps[propKey] = propValue;
        }
      }
      if (Object.keys(cleanedProps).length === 0) {
        // All properties were removed - this object is now invalid
        delete cleaned.properties;
        // Re-check if object is still valid
        if (cleaned.type === 'object' && !cleaned.additionalProperties && !cleaned.$ref && !cleaned.allOf) {
          return undefined;
        }
      } else {
        cleaned.properties = cleanedProps;
      }
    }

    return cleaned;
  }

  return obj;
}


// Access the global org store
declare global {
  var orgStore: Map<string, any> | undefined;
  var migrationJobs: Map<string, any> | undefined;
}

if (!global.migrationJobs) {
  global.migrationJobs = new Map();
}

interface MigrationAsset {
  id: string;
  sourceId: string;
  type: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  error?: string;
  targetId?: string;
}

interface MigrationLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  assetId?: string;
}

interface MigrationJob {
  id: string;
  sourceOrgId: string;
  targetOrgId: string;
  assets: MigrationAsset[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalAssets: number;
  completedAssets: number;
  failedAssets: number;
  skippedAssets: number;
  logs: MigrationLog[];
  idMappings: Map<string, string>;
  options: {
    dryRun: boolean;
    conflictStrategy: 'skip' | 'overwrite' | 'rename';
  };
  createdAt: Date;
  updatedAt: Date;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceOrgId, targetOrgId, sourceCredentials, targetCredentials, assetIds, options } = body;

    // Validate required fields
    if (!sourceOrgId || !targetOrgId || !assetIds || !Array.isArray(assetIds)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (assetIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one asset must be selected' },
        { status: 400 }
      );
    }

    // Build org objects from credentials (for serverless environments)
    let sourceOrg: any = null;
    let targetOrg: any = null;

    if (sourceCredentials && sourceCredentials.accessToken) {
      // Use credentials passed directly (serverless mode)
      sourceOrg = {
        id: sourceOrgId,
        accessToken: sourceCredentials.accessToken,
        credentials: {
          clientId: sourceCredentials.clientId,
          clientSecret: sourceCredentials.clientSecret,
          orgId: sourceCredentials.orgId,
          sandboxName: sourceCredentials.sandboxName,
        },
      };
    }

    if (targetCredentials && targetCredentials.accessToken) {
      // Use credentials passed directly (serverless mode)
      targetOrg = {
        id: targetOrgId,
        accessToken: targetCredentials.accessToken,
        credentials: {
          clientId: targetCredentials.clientId,
          clientSecret: targetCredentials.clientSecret,
          orgId: targetCredentials.orgId,
          sandboxName: targetCredentials.sandboxName,
        },
      };
    }

    // Fallback to orgStore if credentials not passed (backward compatibility)
    if (!sourceOrg || !targetOrg) {
      const orgStore = global.orgStore;
      if (orgStore) {
        for (const [key, org] of orgStore.entries()) {
          if (!sourceOrg && org.id === sourceOrgId) sourceOrg = org;
          if (!targetOrg && org.id === targetOrgId) targetOrg = org;
        }
      }
    }

    if (!sourceOrg) {
      return NextResponse.json(
        { error: 'Source organization credentials not found. Please provide sourceCredentials.' },
        { status: 404 }
      );
    }

    if (!targetOrg) {
      return NextResponse.json(
        { error: 'Target organization credentials not found. Please provide targetCredentials.' },
        { status: 404 }
      );
    }

    logger.info('Creating migration job', {
      sourceOrgId,
      targetOrgId,
      assetCount: assetIds.length,
      options: JSON.stringify(options),
    });

    // Create job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create migration job
    const job: MigrationJob = {
      id: jobId,
      sourceOrgId,
      targetOrgId,
      assets: assetIds.map((assetId: string) => ({
        id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sourceId: assetId,
        type: 'unknown',
        name: assetId,
        status: 'pending' as const,
      })),
      status: 'pending',
      progress: 0,
      totalAssets: assetIds.length,
      completedAssets: 0,
      failedAssets: 0,
      skippedAssets: 0,
      logs: [],
      idMappings: new Map(),
      options: {
        dryRun: options?.dryRun || false,
        conflictStrategy: options?.conflictStrategy || 'skip',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store job
    global.migrationJobs!.set(jobId, job);

    logger.info('Migration job created', { jobId });

    // Run migration synchronously for serverless environments
    await executeMigration(jobId, sourceOrg, targetOrg);

    // Return full job status after completion
    const completedJob = global.migrationJobs!.get(jobId);
    return NextResponse.json({
      success: true,
      jobId,
      message: 'Migration completed',
      status: completedJob?.status,
      progress: completedJob?.progress,
      totalAssets: completedJob?.totalAssets,
      completedAssets: completedJob?.completedAssets,
      failedAssets: completedJob?.failedAssets,
      skippedAssets: completedJob?.skippedAssets,
      logs: completedJob?.logs,
      assets: completedJob?.assets,
    });
  } catch (error) {
    logger.error('Error starting migration', { error });

    return NextResponse.json(
      { error: 'Failed to start migration' },
      { status: 500 }
    );
  }
}

async function executeMigration(jobId: string, sourceOrg: any, targetOrg: any) {
  const job = global.migrationJobs!.get(jobId);
  if (!job) return;

  job.status = 'running';
  addLog(job, 'info', 'Migration started');

  try {
    // Pre-flight check: Verify target org has permissions
    addLog(job, 'info', 'Verifying target organization permissions...');

    const targetTestService = createSchemaService(
      targetOrg.accessToken,
      targetOrg.credentials.clientId,
      targetOrg.credentials.orgId,
      targetOrg.credentials.sandboxName
    );

    try {
      // Try to list schemas to verify permissions
      await targetTestService.listSchemas();
      addLog(job, 'info', 'Target organization permissions verified');
    } catch (e: any) {
      const status = e.response?.status;
      const errorDetail = e.response?.data?.detail || e.response?.data?.message || e.message;

      if (status === 403) {
        addLog(job, 'error', `TARGET ORG ACCESS DENIED (403): ${errorDetail}`);
        addLog(job, 'error', 'The target organization credentials do not have Schema Registry permissions.');
        addLog(job, 'error', 'Please check in Adobe Developer Console that:');
        addLog(job, 'error', '1. The OAuth credentials have Adobe Experience Platform API enabled');
        addLog(job, 'error', '2. The product profile includes Schema Registry access');
        addLog(job, 'error', `3. The sandbox "${targetOrg.credentials.sandboxName}" is accessible`);
        job.status = 'failed';
        job.updatedAt = new Date();
        return;
      }

      addLog(job, 'warn', `Could not verify target permissions: ${errorDetail}`);
    }

    // Fetch full asset details from source
    addLog(job, 'info', 'Fetching asset details from source organization...');

    const sourceSchemaService = createSchemaService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const targetSchemaService = createSchemaService(
      targetOrg.accessToken,
      targetOrg.credentials.clientId,
      targetOrg.credentials.orgId,
      targetOrg.credentials.sandboxName
    );

    // Create dataset services
    const sourceDatasetService = createDatasetService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const targetDatasetService = createDatasetService(
      targetOrg.accessToken,
      targetOrg.credentials.clientId,
      targetOrg.credentials.orgId,
      targetOrg.credentials.sandboxName
    );

    // Log sandbox names for debugging
    addLog(job, 'info', `Source sandbox: ${sourceOrg.credentials.sandboxName}`);
    addLog(job, 'info', `Target sandbox: ${targetOrg.credentials.sandboxName}`);

    // Get all assets from source to resolve dependencies
    let allSchemas: any[] = [];
    let allFieldGroups: any[] = [];
    let allDatasets: any[] = [];
    let allAudiences: any[] = [];
    let allIdentityNamespaces: any[] = [];
    let allMergePolicies: any[] = [];
    let allComputedAttributes: any[] = [];
    let allFlowConnections: any[] = [];
    let allDataFlows: any[] = [];
    let allSandboxes: any[] = [];
    let allDataUsageLabels: any[] = [];
    let allGovernancePolicies: any[] = [];
    let targetAudiencesList: any[] = [];  // Store target audiences for segment ID mapping
    const segmentIdMapping: Map<string, string> = new Map();  // Source segment ID -> Target segment ID

    // Create all source services
    const sourceAudienceService = createAudienceService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const sourceIdentityService = createIdentityService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const sourceProfileService = createProfileService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const sourceFlowService = createFlowService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const sourceSandboxService = createSandboxToolingService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const sourcePolicyService = createPolicyService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    // Determine which asset types are needed based on selected asset IDs
    const selectedAssetIds = job.assets.map((a: MigrationAsset) => a.sourceId);

    // Helper to detect asset type from ID pattern
    const detectNeededTypes = (ids: string[]): Set<string> => {
      const types = new Set<string>();
      // UUID pattern for audience IDs (e.g., aac13b91-f326-4073-8cdb-aa40ac1989ac)
      const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

      for (const id of ids) {
        if (id.includes('/schemas/') || id.includes('_xdm.')) types.add('schema');
        if (id.includes('/mixins/') || id.includes('/fieldgroups/')) types.add('fieldGroup');
        if (id.startsWith('dataset_') || id.match(/^[a-f0-9]{24}$/i)) types.add('dataset');
        // Audience IDs can be UUIDs, contain 'segmentDefinition', or start with 'aud_'
        if (id.includes('segmentDefinition') || id.startsWith('aud_') || uuidPattern.test(id)) types.add('audience');
        if (id.startsWith('ns_') || !id.includes('/')) types.add('identityNamespace');
        if (id.startsWith('mp_') || id.includes('mergePolicy')) types.add('mergePolicy');
        if (id.startsWith('ca_') || id.includes('computedAttribute')) types.add('computedAttribute');
        if (id.startsWith('fc_') || id.includes('connection')) types.add('flowConnection');
        if (id.startsWith('df_') || id.includes('flow')) types.add('dataFlow');
        if (id.startsWith('sb_') || id.includes('sandbox')) types.add('sandbox');
        if (id.startsWith('label_')) types.add('dataUsageLabel');
        if (id.startsWith('policy_') || id.includes('governance')) types.add('governancePolicy');
      }
      // Always fetch schemas and field groups for dependency resolution
      types.add('schema');
      types.add('fieldGroup');
      return types;
    };

    const neededTypes = detectNeededTypes(selectedAssetIds);
    addLog(job, 'info', `Detected asset types needed: ${Array.from(neededTypes).join(', ')}`);

    // Fetch only needed asset types in parallel for speed
    addLog(job, 'info', 'Fetching assets from source organization (parallel)...');

    const fetchPromises: Promise<void>[] = [];

    // Always fetch schemas and field groups (needed for dependency resolution)
    fetchPromises.push(
      sourceSchemaService.listSchemas()
        .then(result => { allSchemas = result; addLog(job, 'info', `Found ${allSchemas.length} schemas`); })
        .catch(() => addLog(job, 'warn', 'Could not fetch schemas'))
    );

    fetchPromises.push(
      sourceSchemaService.listFieldGroups()
        .then(result => { allFieldGroups = result; addLog(job, 'info', `Found ${allFieldGroups.length} field groups`); })
        .catch(() => addLog(job, 'warn', 'Could not fetch field groups'))
    );

    if (neededTypes.has('dataset')) {
      fetchPromises.push(
        sourceDatasetService.listDatasets()
          .then(result => { allDatasets = result; addLog(job, 'info', `Found ${allDatasets.length} datasets`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch datasets'))
      );
    }

    if (neededTypes.has('audience')) {
      fetchPromises.push(
        sourceAudienceService.listAudiences()
          .then(result => { allAudiences = result; addLog(job, 'info', `Found ${allAudiences.length} audiences`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch audiences'))
      );
    }

    if (neededTypes.has('identityNamespace')) {
      fetchPromises.push(
        sourceIdentityService.listNamespaces()
          .then(result => { allIdentityNamespaces = result; addLog(job, 'info', `Found ${allIdentityNamespaces.length} identity namespaces`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch identity namespaces'))
      );
    }

    if (neededTypes.has('mergePolicy')) {
      fetchPromises.push(
        sourceProfileService.listMergePolicies()
          .then(result => { allMergePolicies = result; addLog(job, 'info', `Found ${allMergePolicies.length} merge policies`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch merge policies'))
      );
    }

    if (neededTypes.has('computedAttribute')) {
      fetchPromises.push(
        sourceProfileService.listComputedAttributes()
          .then(result => { allComputedAttributes = result; addLog(job, 'info', `Found ${allComputedAttributes.length} computed attributes`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch computed attributes'))
      );
    }

    if (neededTypes.has('flowConnection')) {
      fetchPromises.push(
        sourceFlowService.listConnections()
          .then(result => { allFlowConnections = result; addLog(job, 'info', `Found ${allFlowConnections.length} flow connections`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch flow connections'))
      );
    }

    if (neededTypes.has('dataFlow')) {
      fetchPromises.push(
        sourceFlowService.listFlows()
          .then(result => { allDataFlows = result; addLog(job, 'info', `Found ${allDataFlows.length} data flows`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch data flows'))
      );
    }

    if (neededTypes.has('sandbox')) {
      fetchPromises.push(
        sourceSandboxService.listSandboxes()
          .then(result => { allSandboxes = result; addLog(job, 'info', `Found ${allSandboxes.length} sandboxes`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch sandboxes'))
      );
    }

    if (neededTypes.has('dataUsageLabel')) {
      fetchPromises.push(
        sourcePolicyService.listLabels()
          .then(result => { allDataUsageLabels = result; addLog(job, 'info', `Found ${allDataUsageLabels.length} data usage labels`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch data usage labels'))
      );
    }

    if (neededTypes.has('governancePolicy')) {
      fetchPromises.push(
        sourcePolicyService.listPolicies()
          .then(result => { allGovernancePolicies = result; addLog(job, 'info', `Found ${allGovernancePolicies.length} governance policies`); })
          .catch(() => addLog(job, 'warn', 'Could not fetch governance policies'))
      );
    }

    // Wait for all fetches to complete in parallel
    await Promise.all(fetchPromises);
    addLog(job, 'info', 'Asset fetching complete');

    // Build dependency map with all asset types
    const assetMap = new Map<string, any>();
    allSchemas.forEach(s => assetMap.set(s.$id, { ...s, assetType: 'schema' }));
    allFieldGroups.forEach(fg => assetMap.set(fg.$id, { ...fg, assetType: 'fieldGroup' }));
    allDatasets.forEach(ds => assetMap.set(ds.id, { ...ds, assetType: 'dataset' }));
    allAudiences.forEach(a => assetMap.set(a.id, { ...a, assetType: 'audience' }));
    allIdentityNamespaces.forEach(ns => assetMap.set(ns.code, { ...ns, assetType: 'identityNamespace' }));
    allMergePolicies.forEach(mp => assetMap.set(mp.id, { ...mp, assetType: 'mergePolicy' }));
    allComputedAttributes.forEach(ca => assetMap.set(ca.id, { ...ca, assetType: 'computedAttribute' }));
    allFlowConnections.forEach(fc => assetMap.set(fc.id, { ...fc, assetType: 'flowConnection' }));
    allDataFlows.forEach(df => assetMap.set(df.id, { ...df, assetType: 'dataFlow' }));
    allSandboxes.forEach(sb => assetMap.set(sb.name, { ...sb, assetType: 'sandbox' }));
    allDataUsageLabels.forEach(l => assetMap.set(l.name, { ...l, assetType: 'dataUsageLabel' }));
    allGovernancePolicies.forEach(p => assetMap.set(p.id, { ...p, assetType: 'governancePolicy' }));

    // Build a set of all field group IDs for quick lookup
    const fieldGroupIds = new Set(allFieldGroups.map(fg => fg.$id));

    // Resolve dependencies for selected assets
    const selectedIds = new Set<string>(job.assets.map((a: MigrationAsset) => a.sourceId));
    const resolvedIds = new Set<string>();
    const migrationOrder: string[] = [];

    // Helper to check if a reference is a custom tenant reference (not standard Adobe)
    function isCustomReference(ref: string): boolean {
      // Standard Adobe references start with these prefixes
      const standardPrefixes = [
        'https://ns.adobe.com/xdm/',
        'https://ns.adobe.com/experience/',
      ];
      return !standardPrefixes.some(prefix => ref.startsWith(prefix));
    }

    async function resolveDependencies(assetId: string) {
      if (resolvedIds.has(assetId)) return;

      const asset = assetMap.get(assetId);
      if (!asset) {
        // Asset not found in map - still add to migration order with original ID
        addLog(job, 'warn', `Asset ${assetId.substring(0, 50)}... not found in fetched assets, will attempt migration anyway`);
        resolvedIds.add(assetId);
        migrationOrder.push(assetId);
        return;
      }

      // For schemas, fetch full details to get meta:extends (skip dependency check if it takes too long)
      if (asset.assetType === 'schema') {
        try {
          addLog(job, 'info', `Checking dependencies for schema: ${asset.title}`);
          const fullSchema = await sourceSchemaService.getSchemaFull(assetId);
          const metaExtends: string[] = fullSchema['meta:extends'] || [];

          // Find custom field group dependencies
          for (const ref of metaExtends) {
            if (isCustomReference(ref) && fieldGroupIds.has(ref)) {
              if (!selectedIds.has(ref)) {
                const fg = assetMap.get(ref);
                addLog(job, 'info', `Auto-adding required field group: ${fg?.title || ref}`);
                selectedIds.add(ref);
              }
              // Recursively resolve field group dependencies
              await resolveDependencies(ref);
            }
          }
        } catch (e: any) {
          addLog(job, 'warn', `Could not fetch schema details: ${e.message?.substring(0, 100)}`);
        }
      }

      // For field groups, check if they have dependencies on other field groups
      if (asset.assetType === 'fieldGroup') {
        try {
          const fullFG = await sourceSchemaService.getFieldGroupFull(assetId);
          const metaExtends: string[] = fullFG['meta:extends'] || [];

          for (const ref of metaExtends) {
            if (isCustomReference(ref) && fieldGroupIds.has(ref)) {
              if (!selectedIds.has(ref)) {
                const fg = assetMap.get(ref);
                addLog(job, 'info', `Auto-adding required field group dependency: ${fg?.title || ref}`);
                selectedIds.add(ref);
              }
              await resolveDependencies(ref);
            }
          }
        } catch (e: any) {
          // Field groups might not have meta:extends, that's ok
        }
      }

      resolvedIds.add(assetId);
      migrationOrder.push(assetId);
    }

    // Resolve all dependencies
    addLog(job, 'info', `Resolving dependencies for ${selectedIds.size} selected assets...`);
    let resolveCount = 0;
    for (const assetId of Array.from(selectedIds)) {
      resolveCount++;
      if (resolveCount % 5 === 0) {
        addLog(job, 'info', `Processing asset ${resolveCount}/${selectedIds.size}...`);
      }
      await resolveDependencies(assetId);
    }
    addLog(job, 'info', `Dependency resolution complete: ${migrationOrder.length} assets in queue`);

    // Build assets with type information
    const assetsWithTypes: MigrationAsset[] = migrationOrder.map(assetId => {
      const asset = assetMap.get(assetId);
      const existingAsset = job.assets.find((a: MigrationAsset) => a.sourceId === assetId);

      return {
        id: existingAsset?.id || `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sourceId: assetId,
        type: asset?.assetType || 'unknown',
        name: asset?.title || asset?.name || assetId,
        status: 'pending' as const,
      };
    });

    // Sort assets by dependency order from config
    const dependencyOrder = migrationConfig.dependencyOrder;
    const sortedAssets = assetsWithTypes.sort((a, b) => {
      const aIndex = dependencyOrder.indexOf(a.type as typeof dependencyOrder[number]);
      const bIndex = dependencyOrder.indexOf(b.type as typeof dependencyOrder[number]);
      // If type not in dependency order, put at end
      const aOrder = aIndex === -1 ? 999 : aIndex;
      const bOrder = bIndex === -1 ? 999 : bIndex;
      return aOrder - bOrder;
    });

    job.assets = sortedAssets;
    job.totalAssets = sortedAssets.length;

    // Log the migration order by type
    const typeCount: Record<string, number> = {};
    sortedAssets.forEach(a => {
      typeCount[a.type] = (typeCount[a.type] || 0) + 1;
    });
    addLog(job, 'info', `Migration order resolved: ${job.totalAssets} assets to migrate`);
    addLog(job, 'info', `Asset breakdown: ${Object.entries(typeCount).map(([t, c]) => `${t}(${c})`).join(', ')}`);

    // Get existing assets in target to check for conflicts (parallel fetch)
    let targetSchemas: any[] = [];
    let targetFieldGroups: any[] = [];
    let targetDatasets: any[] = [];
    let targetFetchFailed = false;

    addLog(job, 'info', 'Fetching existing assets from target organization (parallel)...');

    const targetFetchResults = await Promise.allSettled([
      targetSchemaService.listSchemas(),
      targetSchemaService.listFieldGroups(),
      targetDatasetService.listDatasets(),
    ]);

    // Process schemas result
    if (targetFetchResults[0].status === 'fulfilled') {
      targetSchemas = targetFetchResults[0].value;
      addLog(job, 'info', `Found ${targetSchemas.length} existing schemas in target`);
    } else {
      const e = targetFetchResults[0].reason;
      const errorMsg = e?.response?.data?.detail || e?.response?.data?.message || e?.message;
      const status = e?.response?.status;
      if (status === 403) {
        addLog(job, 'error', `Target org access denied (403): ${errorMsg}. Check that target credentials have Schema Registry permissions.`);
        job.status = 'failed';
        targetFetchFailed = true;
      } else {
        addLog(job, 'warn', `Could not fetch schemas from target: ${errorMsg}`);
      }
    }

    // Process field groups result
    if (targetFetchResults[1].status === 'fulfilled') {
      targetFieldGroups = targetFetchResults[1].value;
      addLog(job, 'info', `Found ${targetFieldGroups.length} existing field groups in target`);
    } else {
      const e = targetFetchResults[1].reason;
      const errorMsg = e?.response?.data?.detail || e?.response?.data?.message || e?.message;
      addLog(job, 'warn', `Could not fetch field groups from target: ${errorMsg}`);
    }

    // Process datasets result
    if (targetFetchResults[2].status === 'fulfilled') {
      targetDatasets = targetFetchResults[2].value;
      addLog(job, 'info', `Found ${targetDatasets.length} existing datasets in target`);
    } else {
      const e = targetFetchResults[2].reason;
      const errorMsg = e?.response?.data?.detail || e?.response?.data?.message || e?.message;
      addLog(job, 'warn', `Could not fetch datasets from target: ${errorMsg}`);
    }

    if (targetFetchFailed) {
      job.updatedAt = new Date();
      return;
    }

    const targetAssetsByTitle = new Map<string, any>();
    targetSchemas.forEach(s => targetAssetsByTitle.set(`schema:${s.title}`, s));
    targetFieldGroups.forEach(fg => targetAssetsByTitle.set(`fieldGroup:${fg.title}`, fg));
    targetDatasets.forEach(ds => targetAssetsByTitle.set(`dataset:${ds.name}`, ds));

    // Determine source and target tenant namespaces for transformation
    let sourceNamespace: string | null = null;
    let targetNamespace: string | null = null;

    // Get source namespace from first field group
    if (allFieldGroups.length > 0) {
      const match = allFieldGroups[0].$id?.match(/https:\/\/ns\.adobe\.com\/([^\/]+)\//);
      if (match) {
        sourceNamespace = match[1];
        addLog(job, 'info', `Source tenant namespace: ${sourceNamespace}`);
      }
    }

    // If no source namespace from field groups, try from audiences
    if (!sourceNamespace && allAudiences.length > 0) {
      for (const aud of allAudiences) {
        const pql = aud.expression?.value || '';
        const namespaceMatch = pql.match(/_([a-zA-Z0-9]+)\./);
        if (namespaceMatch) {
          sourceNamespace = namespaceMatch[1];
          addLog(job, 'info', `Source tenant namespace (from audience PQL): ${sourceNamespace}`);
          break;
        }
      }
    }

    // Get target namespace from target field groups (or we'll get it from first creation error)
    if (targetFieldGroups.length > 0) {
      const match = targetFieldGroups[0].$id?.match(/https:\/\/ns\.adobe\.com\/([^\/]+)\//);
      if (match) {
        targetNamespace = match[1];
        addLog(job, 'info', `Target tenant namespace: ${targetNamespace}`);
      }
    }

    // If target has no field groups, try to get namespace from schemas or make a test call
    if (!targetNamespace) {
      // Try to get from schemas
      if (targetSchemas.length > 0) {
        const match = targetSchemas[0].$id?.match(/https:\/\/ns\.adobe\.com\/([^\/]+)\//);
        if (match) {
          targetNamespace = match[1];
          addLog(job, 'info', `Target tenant namespace (from schemas): ${targetNamespace}`);
        }
      }
    }

    // Fetch target audiences for namespace detection AND segment ID mapping
    const targetAudienceService = createAudienceService(
      targetOrg.accessToken,
      targetOrg.credentials.clientId,
      targetOrg.credentials.orgId,
      targetOrg.credentials.sandboxName
    );
    try {
      targetAudiencesList = await targetAudienceService.listAudiences();
      addLog(job, 'info', `Found ${targetAudiencesList.length} existing audiences in target`);

      // Build segment ID mapping (source ID -> target ID) based on matching names
      // This is needed for audiences that use inSegment() to reference other audiences
      if (allAudiences.length > 0 && targetAudiencesList.length > 0) {
        const targetAudiencesByName = new Map<string, string>();
        for (const targetAud of targetAudiencesList) {
          if (targetAud.name && targetAud.id) {
            targetAudiencesByName.set(targetAud.name.toLowerCase().trim(), targetAud.id);
          }
        }

        for (const sourceAud of allAudiences) {
          const sourceName = (sourceAud.name || '').toLowerCase().trim();
          const targetId = targetAudiencesByName.get(sourceName);
          if (targetId && sourceAud.id) {
            segmentIdMapping.set(sourceAud.id, targetId);
          }
        }

        if (segmentIdMapping.size > 0) {
          addLog(job, 'info', `Built segment ID mapping: ${segmentIdMapping.size} source->target mappings for inSegment dependencies`);
        }
      }

      // Try to extract namespace from audience's PQL expression if not already set
      if (!targetNamespace && targetAudiencesList.length > 0) {
        for (const aud of targetAudiencesList) {
          const pql = aud.expression?.value || '';
          const namespaceMatch = pql.match(/_([a-zA-Z0-9]+)\./);
          if (namespaceMatch) {
            targetNamespace = namespaceMatch[1];
            addLog(job, 'info', `Target tenant namespace (from audience PQL): ${targetNamespace}`);
            break;
          }
        }
      }
    } catch (e) {
      addLog(job, 'warn', 'Could not fetch target audiences for namespace/segment mapping');
    }

    // If still no namespace, we'll extract it from the first error response
    if (!targetNamespace) {
      addLog(job, 'info', `Target namespace not yet determined, will extract from API error response`);
    }

    // Migrate each asset
    addLog(job, 'info', `Starting migration of ${job.assets.length} assets...`);

    for (let i = 0; i < job.assets.length; i++) {
      const asset = job.assets[i];
      const sourceAsset = assetMap.get(asset.sourceId);

      // Update progress at start of each iteration
      job.progress = Math.round((i / Math.max(job.assets.length, 1)) * 100);
      job.updatedAt = new Date();

      if (!sourceAsset) {
        asset.status = 'skipped';
        asset.error = 'Asset not found in source';
        job.skippedAssets++;
        addLog(job, 'warn', `[${i + 1}/${job.assets.length}] Skipped: ${asset.name} - not found in fetched assets`, asset.id);
        continue;
      }

      asset.status = 'in_progress';
      addLog(job, 'info', `[${i + 1}/${job.assets.length}] Migrating: ${sourceAsset.title} (${asset.type})`, asset.id);

      try {
        // Check if exists in target
        const targetKey = `${asset.type}:${sourceAsset.title}`;
        const existingTarget = targetAssetsByTitle.get(targetKey);

        if (existingTarget) {
          if (job.options.conflictStrategy === 'skip') {
            asset.status = 'skipped';
            asset.targetId = existingTarget.$id;
            job.skippedAssets++;
            job.idMappings.set(asset.sourceId, existingTarget.$id);
            addLog(job, 'info', `Skipped (exists): ${sourceAsset.title}`, asset.id);
            continue;
          }
          // For overwrite/rename, we'd handle differently
        }

        if (job.options.dryRun) {
          asset.status = 'completed';
          job.completedAssets++;
          addLog(job, 'info', `[DRY RUN] Would migrate: ${sourceAsset.title}`, asset.id);
        } else {
          // Actually create the asset in target
          if (asset.type === 'fieldGroup') {
            // Fetch full field group details from source
            addLog(job, 'info', `Fetching full field group details: ${sourceAsset.title}`, asset.id);
            let fullFieldGroup: any;
            try {
              fullFieldGroup = await sourceSchemaService.getFieldGroupFull(asset.sourceId);
            } catch (e: any) {
              addLog(job, 'warn', `Could not fetch full details, using listing data`, asset.id);
              fullFieldGroup = sourceAsset;
            }

            // Check if a matching field group already exists in target by title
            const matchingTargetFG = findMatchingFieldGroup(fullFieldGroup, targetFieldGroups);

            if (matchingTargetFG) {
              addLog(job, 'info', `Found matching field group in target: "${matchingTargetFG.title}" (${matchingTargetFG.$id})`, asset.id);
              asset.targetId = matchingTargetFG.$id;
              asset.status = 'skipped';
              job.skippedAssets++;
              job.idMappings.set(asset.sourceId, matchingTargetFG.$id);
              addLog(job, 'info', `Skipped (exists): ${sourceAsset.title}`, asset.id);
              continue;
            }

            // Debug: Log what xed-full+json returned
            const hasDefinitions = fullFieldGroup.definitions && Object.keys(fullFieldGroup.definitions).length > 0;
            const hasAllOf = fullFieldGroup.allOf && fullFieldGroup.allOf.length > 0;
            const hasProperties = fullFieldGroup.properties && Object.keys(fullFieldGroup.properties).length > 0;
            addLog(job, 'info', `Source FG structure: definitions=${hasDefinitions}, allOf=${hasAllOf}, properties=${hasProperties}`, asset.id);

            // If xed-full+json doesn't have definitions but has properties, we need to reconstruct
            // This happens when the API returns resolved/flattened structure
            let createPayload: any = {
              type: 'object',
              title: fullFieldGroup.title,
              description: fullFieldGroup.description || '',
            };

            // Check if we have definitions to use
            if (hasDefinitions) {
              createPayload.definitions = fullFieldGroup.definitions;
              if (hasAllOf) {
                createPayload.allOf = fullFieldGroup.allOf;
              }
            } else if (hasProperties) {
              // xed-full+json returns resolved properties but no definitions
              // We need to reconstruct the definitions structure for creation
              // Create a definition with the properties under the proper structure
              const defName = fullFieldGroup.title.replace(/[^a-zA-Z0-9]/g, '');
              createPayload.definitions = {
                [defName]: {
                  properties: fullFieldGroup.properties
                }
              };
              createPayload.allOf = [{ '$ref': `#/definitions/${defName}` }];
              addLog(job, 'info', `Reconstructed definitions from properties for: ${sourceAsset.title}`, asset.id);
            } else {
              addLog(job, 'warn', `Field group "${sourceAsset.title}" has no definitions or properties - cannot create`, asset.id);
              asset.status = 'failed';
              asset.error = 'Field group has no definitions or properties';
              job.failedAssets++;
              continue;
            }

            // meta:intendedToExtend is REQUIRED - specifies which class(es) this field group extends
            if (fullFieldGroup['meta:intendedToExtend']) {
              createPayload['meta:intendedToExtend'] = fullFieldGroup['meta:intendedToExtend'];
            }

            // Optional meta properties
            if (fullFieldGroup['meta:extensible'] !== undefined) {
              createPayload['meta:extensible'] = fullFieldGroup['meta:extensible'];
            }
            if (fullFieldGroup['meta:abstract'] !== undefined) {
              createPayload['meta:abstract'] = fullFieldGroup['meta:abstract'];
            }

            // NOTE: Do NOT include 'properties' - it's the resolved/computed structure from xed-full+json
            // Adobe computes properties from definitions + allOf during creation

            // Apply namespace transformation if we know both namespaces AND they differ
            if (sourceNamespace && targetNamespace && sourceNamespace !== targetNamespace) {
              addLog(job, 'info', `Transforming namespace: ${sourceNamespace} -> ${targetNamespace}`, asset.id);
              createPayload = transformNamespace(createPayload, sourceNamespace, targetNamespace);
            } else if (sourceNamespace && targetNamespace && sourceNamespace === targetNamespace) {
              addLog(job, 'info', `Same namespace in source and target: ${sourceNamespace} - no transformation needed`, asset.id);
            }

            // Clean up empty properties that cause XDM validation errors
            createPayload = cleanupEmptyProperties(createPayload);

            // Log payload details for debugging
            const defKeys = createPayload.definitions ? Object.keys(createPayload.definitions) : [];
            addLog(job, 'info', `Creating field group: title="${createPayload.title}", definitions=[${defKeys.join(',')}], allOf=${createPayload.allOf?.length || 0} refs`, asset.id);

            try {
              const created = await targetSchemaService.createFieldGroup(createPayload);
              asset.targetId = created.$id;
              job.idMappings.set(asset.sourceId, created.$id);
              // Add to cache so subsequent schema lookups can find it
              targetFieldGroups.push({ ...created, $id: created.$id, title: fullFieldGroup.title });
              addLog(job, 'info', `Created field group: ${sourceAsset.title} -> ${created.$id}`, asset.id);
            } catch (createError: any) {
              const errorData = createError.response?.data;
              const errorMessage = errorData?.report?.['detailed-message'] || errorData?.detail || errorData?.message || '';
              const errorTitle = errorData?.title || '';

              // Log full error for debugging
              addLog(job, 'warn', `API Error for "${sourceAsset.title}": ${errorTitle} - ${errorMessage}`, asset.id);

              // Handle "title not unique" error - field group already exists (XDM-1521-400)
              if (errorMessage.includes('title') || errorMessage.includes('unique') || errorData?.title === 'Title not unique') {
                addLog(job, 'info', `Field group "${sourceAsset.title}" already exists in target, looking up existing ID...`, asset.id);

                // Find existing field group by title (case-insensitive)
                const sourceTitleLower = (sourceAsset.title || '').trim().toLowerCase();
                const existingFG = targetFieldGroups.find((fg: any) =>
                  (fg.title || '').trim().toLowerCase() === sourceTitleLower
                );
                if (existingFG) {
                  asset.targetId = existingFG.$id;
                  asset.status = 'skipped';
                  job.skippedAssets++;
                  job.idMappings.set(asset.sourceId, existingFG.$id);
                  addLog(job, 'info', `Using existing field group: ${existingFG.$id}`, asset.id);
                  continue; // Skip to next asset
                } else {
                  // Try to refresh target field groups list
                  try {
                    const refreshedFGs = await targetSchemaService.listFieldGroups();
                    const foundFG = refreshedFGs.find((fg: any) =>
                      (fg.title || '').trim().toLowerCase() === sourceTitleLower
                    );
                    if (foundFG) {
                      asset.targetId = foundFG.$id;
                      asset.status = 'skipped';
                      job.skippedAssets++;
                      job.idMappings.set(asset.sourceId, foundFG.$id);
                      addLog(job, 'info', `Using existing field group (refreshed): ${foundFG.$id}`, asset.id);
                      targetFieldGroups = refreshedFGs; // Update cache
                      continue;
                    }
                  } catch (e) {
                    // Ignore refresh error
                  }
                  throw createError;
                }
              }

              // Handle "Field name conflict - Rename this field" error
              // This means we need to fix the casing to match what exists in target
              // Note: "Field name conflict" is in errorTitle, "Rename this field" is in errorMessage
              const isFieldNameConflict = errorTitle.includes('Field name conflict') ||
                                          errorTitle.includes('field name conflict') ||
                                          errorMessage.includes('Rename this field to match') ||
                                          errorMessage.includes('Rename this field');

              if (isFieldNameConflict) {
                addLog(job, 'info', `FIELD NAME CONFLICT for "${sourceAsset.title}" - attempting to fix casing...`, asset.id);

                // Extract source and target field names from error
                // Format: "productCategory has already been defined ... as ... ProductCategory"
                const casingMatch = errorMessage.match(/properties\/([a-zA-Z0-9_]+)\s+has already been defined.*?as.*?properties\/([a-zA-Z0-9_]+)/i);

                if (casingMatch) {
                  const sourceFieldName = casingMatch[1]; // e.g., "productCategory"
                  const targetFieldName = casingMatch[2]; // e.g., "ProductCategory"

                  addLog(job, 'info', `Fixing casing: "${sourceFieldName}" -> "${targetFieldName}"`, asset.id);

                  // Helper function to replace field name with correct casing in object
                  function fixFieldCasing(obj: any, oldName: string, newName: string): any {
                    if (obj === null || obj === undefined) return obj;
                    if (typeof obj === 'string') return obj;
                    if (Array.isArray(obj)) {
                      return obj.map(item => fixFieldCasing(item, oldName, newName));
                    }
                    if (typeof obj === 'object') {
                      const fixed: any = {};
                      for (const [key, value] of Object.entries(obj)) {
                        // Replace key if it matches (case-insensitive)
                        const newKey = key.toLowerCase() === oldName.toLowerCase() ? newName : key;
                        fixed[newKey] = fixFieldCasing(value, oldName, newName);
                      }
                      return fixed;
                    }
                    return obj;
                  }

                  // Fix the casing in the payload
                  let fixedPayload = fixFieldCasing(createPayload, sourceFieldName, targetFieldName);
                  // Clean up empty properties
                  fixedPayload = cleanupEmptyProperties(fixedPayload);

                  addLog(job, 'info', `Retrying creation with fixed casing...`, asset.id);

                  try {
                    const created = await targetSchemaService.createFieldGroup(fixedPayload);
                    asset.targetId = created.$id;
                    job.idMappings.set(asset.sourceId, created.$id);
                    targetFieldGroups.push({ ...created, $id: created.$id, title: fullFieldGroup.title });
                    addLog(job, 'info', `SUCCESS: Created field group with fixed casing: ${created.$id}`, asset.id);
                    asset.status = 'completed';
                    job.completedAssets++;
                    continue;
                  } catch (retryError: any) {
                    const retryMsg = retryError.response?.data?.detail || retryError.response?.data?.report?.['detailed-message'] || retryError.message;
                    addLog(job, 'warn', `Still failed after casing fix: ${retryMsg}`, asset.id);
                    // Fall through to handle as general conflict
                  }
                }
              }

              // Handle data type conflicts (object vs string, etc.) - these cannot be auto-resolved
              const isDataTypeConflict = errorMessage.includes('incompatible data types') ||
                                         errorMessage.includes('merge') ||
                                         (errorMessage.includes('already been defined') && errorMessage.includes('different data type'));

              if (isDataTypeConflict) {
                addLog(job, 'error', `DATA TYPE CONFLICT for "${sourceAsset.title}"`, asset.id);
                addLog(job, 'error', `Error: ${errorMessage.substring(0, 300)}`, asset.id);
                addLog(job, 'error', `The target org has this field defined with a different data type.`, asset.id);
                addLog(job, 'error', `Manual resolution required: Delete the conflicting schema/field group in target org.`, asset.id);

                asset.status = 'failed';
                asset.error = `Data type conflict - manual resolution required`;
                job.failedAssets++;
                continue;
              }

              // Handle other conflicts - try to find existing field group
              const hasOtherConflict = errorMessage.includes('already been defined') ||
                                       errorMessage.includes('conflict');

              if (hasOtherConflict) {
                addLog(job, 'info', `CONFLICT for "${sourceAsset.title}" - searching for existing match...`, asset.id);

                // Try to find exact title match in target
                const sourceTitleLower = sourceAsset.title.toLowerCase();
                const exactMatch = targetFieldGroups.find((fg: any) =>
                  fg.title.toLowerCase() === sourceTitleLower
                );

                if (exactMatch) {
                  addLog(job, 'info', `Found exact title match: "${exactMatch.title}" (${exactMatch.$id})`, asset.id);
                  asset.targetId = exactMatch.$id;
                  asset.status = 'skipped';
                  job.skippedAssets++;
                  job.idMappings.set(asset.sourceId, exactMatch.$id);
                  continue;
                }

                // No exact match - fail with clear message
                addLog(job, 'error', `No exact match found. Error: ${errorMessage.substring(0, 200)}`, asset.id);
                asset.status = 'failed';
                asset.error = `Field conflict - no matching field group in target`;
                job.failedAssets++;
                continue;
              }

              // Handle namespace error - extract correct namespace and retry
              if (errorMessage.includes('must be defined under a top-level field named _') ||
                  errorMessage.includes('must be prefixed with the text') ||
                  errorMessage.includes('invalid namespace') ||
                  errorTitle.includes('Namespace validation error')) {

                // Extract the correct namespace from the error
                // Format: "must be defined under a top-level field named _digiwebanaoptznapacptrsd"
                const nsMatch = errorMessage.match(/field named _([a-zA-Z0-9]+)/i) ||
                                errorMessage.match(/top-level field named _([a-zA-Z0-9]+)/i);

                if (nsMatch && !targetNamespace) {
                  targetNamespace = nsMatch[1];
                  addLog(job, 'info', `Detected target namespace from error: ${targetNamespace}`, asset.id);
                }

                if (targetNamespace && sourceNamespace) {
                  addLog(job, 'info', `Retrying with namespace transformation: ${sourceNamespace} -> ${targetNamespace}`, asset.id);

                  // Re-transform the payload with correct namespace
                  let retryPayload: any = {
                    type: 'object',
                    title: fullFieldGroup.title,
                    description: fullFieldGroup.description || '',
                  };

                  if (fullFieldGroup.definitions) {
                    retryPayload.definitions = fullFieldGroup.definitions;
                  }
                  if (fullFieldGroup.allOf) {
                    retryPayload.allOf = fullFieldGroup.allOf;
                  }
                  if (fullFieldGroup['meta:intendedToExtend']) {
                    retryPayload['meta:intendedToExtend'] = fullFieldGroup['meta:intendedToExtend'];
                  }

                  // Apply namespace transformation
                  retryPayload = transformNamespace(retryPayload, sourceNamespace, targetNamespace);
                  // Clean up empty properties
                  retryPayload = cleanupEmptyProperties(retryPayload);

                  try {
                    addLog(job, 'info', `Creating with transformed namespace...`, asset.id);
                    const created = await targetSchemaService.createFieldGroup(retryPayload);
                    asset.targetId = created.$id;
                    job.idMappings.set(asset.sourceId, created.$id);
                    targetFieldGroups.push({ ...created, $id: created.$id, title: fullFieldGroup.title });
                    addLog(job, 'info', `SUCCESS: Created field group: ${created.$id}`, asset.id);
                    asset.status = 'completed';
                    job.completedAssets++;
                    continue;
                  } catch (retryError: any) {
                    const retryMsg = retryError.response?.data?.detail || retryError.message;
                    addLog(job, 'error', `Still failed after namespace fix: ${retryMsg}`, asset.id);
                  }
                }

                addLog(job, 'error', `Field group "${sourceAsset.title}" namespace incompatible`, asset.id);
                asset.status = 'failed';
                asset.error = `Namespace transformation failed`;
                job.failedAssets++;
                continue;
              }

              // Unknown error - throw to outer catch
              throw createError;
            }
          } else if (asset.type === 'schema') {
            // Fetch full schema details from source
            addLog(job, 'info', `Fetching full schema details: ${sourceAsset.title}`, asset.id);
            let fullSchema: any;
            try {
              fullSchema = await sourceSchemaService.getSchemaFull(asset.sourceId);
            } catch (e: any) {
              addLog(job, 'warn', `Could not fetch full details, using listing data`, asset.id);
              fullSchema = sourceAsset;
            }

            // Get meta:extends which contains all class and field group references
            const metaExtends: string[] = fullSchema['meta:extends'] || [];
            addLog(job, 'info', `Schema has ${metaExtends.length} references in meta:extends`, asset.id);

            // Build allOf array from meta:extends
            // Each reference needs to be converted to {"$ref": "..."}
            // Use idMappings for migrated field groups, or lookup by title for existing ones
            // IMPORTANT: allOf can only include classes and field groups, NOT behaviors
            const allOfRefs: Array<{$ref: string}> = [];
            const missingRefs: string[] = [];

            // Behavior patterns that must be excluded from allOf
            // Behaviors are automatically applied based on the class, not included in allOf
            const behaviorPatterns = [
              'https://ns.adobe.com/xdm/data/time-series',
              'https://ns.adobe.com/xdm/data/record',
              'https://ns.adobe.com/xdm/data/adhoc',
              '/behaviors/',
              '/data/time-series',
              '/data/record',
              '/data/adhoc',
            ];

            const isBehaviorRef = (url: string): boolean => {
              return behaviorPatterns.some(pattern => url.includes(pattern));
            };

            // Helper to check if a reference is a datatype (not allowed in allOf)
            const isDatatypeRef = (url: string): boolean => {
              return url.includes('/datatypes/') || url.includes('/common/');
            };

            // Helper to check if a reference is a class (not field group)
            const isClassRef = (url: string): boolean => {
              return url.includes('/classes/');
            };

            // Helper to check if a reference is a field group (mixin)
            const isFieldGroupRef = (url: string): boolean => {
              return url.includes('/mixins/') || url.includes('/fieldgroups/');
            };

            for (const ref of metaExtends) {
              // Skip behavior references - they are NOT allowed in allOf
              if (isBehaviorRef(ref)) {
                addLog(job, 'info', `Skipping behavior reference (not allowed in allOf): ${ref}`, asset.id);
                continue;
              }

              // Skip datatype references - they are NOT allowed in allOf (only class/fieldgroup)
              if (isDatatypeRef(ref)) {
                addLog(job, 'info', `Skipping datatype reference (not allowed in allOf): ${ref}`, asset.id);
                continue;
              }

              // Check if this is a custom tenant reference that we already migrated
              if (job.idMappings.has(ref)) {
                allOfRefs.push({ $ref: job.idMappings.get(ref)! });
                continue;
              }

              // Check if it's a standard Adobe reference (not custom tenant)
              const isStandardRef = ref.startsWith('https://ns.adobe.com/xdm/') ||
                                    ref.startsWith('https://ns.adobe.com/experience/');
              if (isStandardRef) {
                allOfRefs.push({ $ref: ref });
                continue;
              }

              // Handle custom class references
              // For adhoc schemas, the class is created along with the schema
              // We need to include it as-is or transform namespace
              if (isClassRef(ref)) {
                // Custom class - transform namespace if needed
                if (sourceNamespace && targetNamespace && sourceNamespace !== targetNamespace) {
                  const transformedRef = ref.replace(
                    `https://ns.adobe.com/${sourceNamespace}/`,
                    `https://ns.adobe.com/${targetNamespace}/`
                  );
                  addLog(job, 'info', `Transformed custom class reference: ${ref} -> ${transformedRef}`, asset.id);
                  allOfRefs.push({ $ref: transformedRef });
                } else {
                  // Same namespace or unknown - include as-is (schema API will handle it)
                  addLog(job, 'info', `Including custom class reference as-is: ${ref}`, asset.id);
                  allOfRefs.push({ $ref: ref });
                }
                continue;
              }

              // It's a custom field group reference we haven't migrated - try to find it by extracting title
              // First check if a field group with matching ID exists in source to get its title
              const sourceFG = allFieldGroups.find((fg: any) => fg.$id === ref);
              if (sourceFG) {
                // Look for matching title in target
                const targetFG = targetFieldGroups.find((fg: any) => fg.title === sourceFG.title);
                if (targetFG) {
                  addLog(job, 'info', `Resolved unmapped reference "${sourceFG.title}" to target: ${targetFG.$id}`, asset.id);
                  job.idMappings.set(ref, targetFG.$id);
                  allOfRefs.push({ $ref: targetFG.$id });
                  continue;
                } else {
                  missingRefs.push(`Field Group: ${sourceFG.title} (${ref})`);
                }
              } else {
                // Unknown reference - could be a class or other type
                // Try transforming namespace and including it
                if (sourceNamespace && targetNamespace && sourceNamespace !== targetNamespace) {
                  const transformedRef = ref.replace(
                    `https://ns.adobe.com/${sourceNamespace}/`,
                    `https://ns.adobe.com/${targetNamespace}/`
                  );
                  addLog(job, 'info', `Transformed unknown reference: ${ref} -> ${transformedRef}`, asset.id);
                  allOfRefs.push({ $ref: transformedRef });
                } else {
                  addLog(job, 'warn', `Unknown reference type, including as-is: ${ref}`, asset.id);
                  allOfRefs.push({ $ref: ref });
                }
              }
            }

            if (missingRefs.length > 0) {
              addLog(job, 'error', `Schema references ${missingRefs.length} field groups not found in target: ${missingRefs.slice(0, 3).join(', ')}${missingRefs.length > 3 ? '...' : ''}`, asset.id);
              addLog(job, 'error', `Please migrate these field groups first, or ensure they exist in the target org with the same title.`, asset.id);
              throw new Error(`Missing ${missingRefs.length} required field groups in target org`);
            }

            addLog(job, 'info', `Built allOf with ${allOfRefs.length} references (all resolved)`, asset.id);

            // Build create payload - Adobe computes meta:extends from allOf
            // So we only need to provide: type, title, description, allOf
            let createPayload: any = {
              type: 'object',
              title: fullSchema.title,
              description: fullSchema.description || '',
              allOf: allOfRefs,
            };

            // Log the first few allOf refs for debugging
            const refSample = allOfRefs.slice(0, 3).map((r: any) => r.$ref);
            addLog(job, 'info', `allOf sample: ${refSample.join(', ')}...`, asset.id);

            // NOTE: Do NOT include meta:extends, meta:class, properties, definitions
            // These are computed by Adobe from the allOf references
            // Including them causes validation errors

            addLog(job, 'info', `Creating schema with payload keys: ${Object.keys(createPayload).join(', ')}`, asset.id);
            addLog(job, 'info', `Schema allOf count: ${allOfRefs.length}`, asset.id);

            try {
              const created = await targetSchemaService.createSchema(createPayload);
              asset.targetId = created.$id;
              job.idMappings.set(asset.sourceId, created.$id);
              addLog(job, 'info', `Created schema: ${sourceAsset.title}`, asset.id);

              // Copy schema settings (Profile enablement and Identity descriptors)
              try {
                // Check if source schema is profile-enabled
                const isProfileEnabled = sourceSchemaService.isSchemaProfileEnabled(fullSchema);
                if (isProfileEnabled) {
                  addLog(job, 'info', `Source schema is Profile-enabled, enabling target schema...`, asset.id);
                  await targetSchemaService.enableSchemaForProfile(created.$id);
                  addLog(job, 'info', `Target schema enabled for Profile`, asset.id);
                }

                // Fetch identity descriptors from SOURCE schema
                addLog(job, 'info', `Fetching identity descriptors from source schema...`, asset.id);
                const sourceDescriptors = await sourceSchemaService.getSchemaDescriptors(asset.sourceId);
                addLog(job, 'info', `Found ${sourceDescriptors.length} descriptors in source schema`, asset.id);

                if (sourceDescriptors.length > 0) {
                  // Create descriptors in TARGET schema
                  const namespaceMapping = new Map<string, string>();
                  if (sourceNamespace && targetNamespace && sourceNamespace !== targetNamespace) {
                    namespaceMapping.set(sourceNamespace, targetNamespace);
                  }
                  const descriptorResult = await targetSchemaService.createDescriptorsFromSource(
                    sourceDescriptors,
                    created.$id,
                    namespaceMapping
                  );
                  addLog(job, 'info', `Descriptors: ${descriptorResult.copied} created, ${descriptorResult.failed} failed`, asset.id);
                }
              } catch (settingsError: any) {
                addLog(job, 'warn', `Could not copy schema settings: ${settingsError.message}`, asset.id);
                // Don't fail the migration for settings errors
              }
            } catch (schemaError: any) {
              const errorData = schemaError.response?.data;
              const errorMessage = errorData?.detail || errorData?.title || errorData?.message || '';

              // Handle "title not unique" / "Object titles must be unique" error
              if (errorMessage.includes('title') && (errorMessage.includes('unique') || errorMessage.includes('Title not unique'))) {
                addLog(job, 'info', `Schema "${sourceAsset.title}" already exists in target, looking up existing ID...`, asset.id);

                // Find existing schema by title
                let existingSchema = targetSchemas.find((s: any) => s.title === sourceAsset.title);
                if (!existingSchema) {
                  // Try to refresh target schemas list
                  try {
                    const refreshedSchemas = await targetSchemaService.listSchemas();
                    existingSchema = refreshedSchemas.find((s: any) => s.title === sourceAsset.title);
                    if (existingSchema) {
                      targetSchemas = refreshedSchemas; // Update cache
                    }
                  } catch (e) {
                    // Ignore refresh error
                  }
                }

                if (existingSchema) {
                  asset.targetId = existingSchema.$id;
                  job.idMappings.set(asset.sourceId, existingSchema.$id);
                  addLog(job, 'info', `Using existing schema: ${existingSchema.$id}`, asset.id);

                  // Copy schema settings (Profile enablement and Identity descriptors) for existing schema too
                  try {
                    // Check if source schema is profile-enabled
                    const isProfileEnabled = sourceSchemaService.isSchemaProfileEnabled(fullSchema);
                    if (isProfileEnabled) {
                      addLog(job, 'info', `Source schema is Profile-enabled, enabling target schema...`, asset.id);
                      await targetSchemaService.enableSchemaForProfile(existingSchema.$id);
                      addLog(job, 'info', `Target schema enabled for Profile`, asset.id);
                    }

                    // Fetch identity descriptors from SOURCE schema
                    addLog(job, 'info', `Fetching identity descriptors from source schema...`, asset.id);
                    const sourceDescriptors = await sourceSchemaService.getSchemaDescriptors(asset.sourceId);
                    addLog(job, 'info', `Found ${sourceDescriptors.length} descriptors in source schema`, asset.id);

                    if (sourceDescriptors.length > 0) {
                      // Create descriptors in TARGET schema
                      const namespaceMapping = new Map<string, string>();
                      if (sourceNamespace && targetNamespace && sourceNamespace !== targetNamespace) {
                        namespaceMapping.set(sourceNamespace, targetNamespace);
                      }
                      const descriptorResult = await targetSchemaService.createDescriptorsFromSource(
                        sourceDescriptors,
                        existingSchema.$id,
                        namespaceMapping
                      );
                      addLog(job, 'info', `Descriptors: ${descriptorResult.copied} created, ${descriptorResult.failed} failed`, asset.id);
                    }
                  } catch (settingsError: any) {
                    addLog(job, 'warn', `Could not copy schema settings to existing schema: ${settingsError.message}`, asset.id);
                    // Don't fail the migration for settings errors
                  }

                  asset.status = 'skipped';
                  job.skippedAssets++;
                  continue;
                } else {
                  throw schemaError;
                }
              }

              // Handle merge conflict error
              if (errorMessage.includes('Cannot merge incompatible data types') ||
                  errorData?.title === 'Merge Schema Error') {
                const pathMatch = errorMessage.match(/The path ([^\s]+) has already been defined/);
                const conflictPath = pathMatch ? pathMatch[1] : 'unknown';
                addLog(job, 'warn', `Schema "${sourceAsset.title}" has merge conflict at path: ${conflictPath}`, asset.id);

                // Try to find existing schema with same title
                const existingByTitle = targetSchemas.find((s: any) => s.title === sourceAsset.title);
                if (existingByTitle) {
                  asset.targetId = existingByTitle.$id;
                  asset.status = 'skipped';
                  job.skippedAssets++;
                  job.idMappings.set(asset.sourceId, existingByTitle.$id);
                  addLog(job, 'info', `Using existing schema with same title: ${existingByTitle.$id}`, asset.id);
                  continue;
                }

                // Mark as failed with clear message
                asset.status = 'failed';
                asset.error = `Merge conflict: ${conflictPath} has incompatible data type`;
                job.failedAssets++;
                continue;
              }

              // Re-throw other errors
              throw schemaError;
            }
          } else if (asset.type === 'dataset') {
            // Dataset migration
            addLog(job, 'info', `Migrating dataset: ${sourceAsset.name}`, asset.id);

            // Get source dataset from listing data (more reliable than individual fetch)
            const listingData = allDatasets.find((d: any) => d.id === asset.sourceId);

            // Also try to get detailed dataset info
            let sourceDataset: any;
            try {
              sourceDataset = await sourceDatasetService.getDataset(asset.sourceId);
            } catch (e) {
              addLog(job, 'warn', `Could not fetch dataset details, using listing data`, asset.id);
              sourceDataset = {};
            }

            // Merge data - prefer listing data for basic fields
            const datasetName = listingData?.name || sourceDataset?.name || sourceAsset.name;
            const datasetDescription = listingData?.description || sourceDataset?.description || '';
            const schemaRef = listingData?.schemaRef || sourceDataset?.schemaRef;
            const tags = listingData?.tags || sourceDataset?.tags;
            const fileDescription = listingData?.fileDescription || sourceDataset?.fileDescription;

            // Debug: log the data sources
            addLog(job, 'info', `Dataset name: ${datasetName}`, asset.id);
            addLog(job, 'info', `Schema ref from listing: ${JSON.stringify(listingData?.schemaRef)}`, asset.id);
            addLog(job, 'info', `Schema ref from detail: ${JSON.stringify(sourceDataset?.schemaRef)}`, asset.id);

            // Validate dataset name
            if (!datasetName) {
              addLog(job, 'error', `Dataset has no name - cannot migrate`, asset.id);
              asset.status = 'failed';
              asset.error = 'Dataset has no name';
              job.failedAssets++;
              continue;
            }

            // Check if target schema exists (dataset depends on schema)
            let sourceSchemaId = schemaRef?.id;

            // Handle datasets without schema (some system datasets may not have one)
            if (!sourceSchemaId) {
              addLog(job, 'warn', `Dataset "${datasetName}" has no schemaRef - this may be a system dataset or data lake dataset`, asset.id);
              addLog(job, 'info', `Checking if dataset already exists in target...`, asset.id);

              // Try to find existing dataset by name
              try {
                const existingDataset = await targetDatasetService.findDatasetByName(datasetName);
                if (existingDataset) {
                  asset.targetId = existingDataset.id;
                  asset.status = 'skipped';
                  job.skippedAssets++;
                  addLog(job, 'info', `Dataset already exists in target: ${existingDataset.id}`, asset.id);
                  continue;
                }

                // Cannot create dataset without schema
                asset.status = 'failed';
                asset.error = 'Dataset has no schema reference - cannot migrate';
                job.failedAssets++;
                continue;
              } catch (e) {
                asset.status = 'failed';
                asset.error = 'Dataset has no schema reference - cannot migrate';
                job.failedAssets++;
                continue;
              }
            }

            addLog(job, 'info', `Source dataset schema: ${sourceSchemaId}`, asset.id);
            let targetSchemaId = job.idMappings.get(sourceSchemaId);

            if (!targetSchemaId) {
              // Try to find schema by matching title
              const sourceSchema = allSchemas.find(s => s.$id === sourceSchemaId);
              if (sourceSchema) {
                const targetSchema = targetSchemas.find(s => s.title === sourceSchema.title);
                if (targetSchema) {
                  targetSchemaId = targetSchema.$id;
                  job.idMappings.set(sourceSchemaId, targetSchemaId);
                  addLog(job, 'info', `Found matching target schema by title "${sourceSchema.title}": ${targetSchemaId}`, asset.id);
                }
              } else {
                addLog(job, 'warn', `Source schema ${sourceSchemaId} not found in schemas list`, asset.id);
              }
            }

            // Also try to find by transforming namespace
            if (!targetSchemaId && sourceNamespace && targetNamespace) {
              const transformedSchemaId = sourceSchemaId.replace(
                `https://ns.adobe.com/${sourceNamespace}/`,
                `https://ns.adobe.com/${targetNamespace}/`
              );
              const targetSchema = targetSchemas.find((s: any) => s.$id === transformedSchemaId);
              if (targetSchema) {
                targetSchemaId = targetSchema.$id;
                job.idMappings.set(sourceSchemaId, targetSchemaId);
                addLog(job, 'info', `Found target schema by namespace transformation: ${targetSchemaId}`, asset.id);
              }
            }

            if (!targetSchemaId) {
              addLog(job, 'error', `Target schema not found for dataset.`, asset.id);
              addLog(job, 'error', `Source schema: ${sourceSchemaId}`, asset.id);
              addLog(job, 'error', `Please migrate the schema first, or ensure it exists in the target org with the same title.`, asset.id);
              asset.status = 'failed';
              asset.error = 'Target schema not found - migrate schema first';
              job.failedAssets++;
              continue;
            }

            // Check if dataset already exists in target
            const existingDataset = await targetDatasetService.findDatasetByName(datasetName);
            if (existingDataset) {
              addLog(job, 'info', `Dataset "${datasetName}" already exists in target`, asset.id);
              asset.targetId = existingDataset.id;
              job.idMappings.set(asset.sourceId, existingDataset.id);
              asset.status = 'skipped';
              job.skippedAssets++;
              continue;
            }

            // Create new dataset in target
            try {
              // Filter out reserved/system tags that cannot be copied
              // Adobe reserves certain tag namespaces like 'adobe/*'
              const reservedTagPrefixes = [
                'adobe/',
                'aep/',
                'acp/',
                'xdm/',
              ];

              let filteredTags: Record<string, string[]> | undefined = undefined;
              if (tags && typeof tags === 'object') {
                filteredTags = {};
                for (const [key, value] of Object.entries(tags)) {
                  const isReserved = reservedTagPrefixes.some(prefix => key.toLowerCase().startsWith(prefix));
                  if (!isReserved) {
                    filteredTags[key] = value as string[];
                  } else {
                    addLog(job, 'info', `Skipping reserved tag: ${key}`, asset.id);
                  }
                }
                // If no user tags remain, set to undefined
                if (Object.keys(filteredTags).length === 0) {
                  filteredTags = undefined;
                }
              }

              const createPayload = {
                name: datasetName,
                description: datasetDescription,
                schemaRef: {
                  id: targetSchemaId,
                  contentType: schemaRef?.contentType || 'application/vnd.adobe.xed+json;version=1',
                },
                tags: filteredTags,
                fileDescription: fileDescription,
              };

              const createdDataset = await targetDatasetService.createDataset(createPayload);
              asset.targetId = createdDataset.id;
              job.idMappings.set(asset.sourceId, createdDataset.id);
              addLog(job, 'info', `Created dataset: ${datasetName} (${createdDataset.id})`, asset.id);

            } catch (datasetError: any) {
              const errorData = datasetError.response?.data;
              const errorMessage = errorData?.detail || errorData?.title || errorData?.message || datasetError.message;
              addLog(job, 'error', `Failed to create dataset: ${errorMessage}`, asset.id);
              throw datasetError;
            }
          } else if (asset.type === 'audience') {
            // Audience migration
            addLog(job, 'info', `Migrating audience: ${sourceAsset.name}`, asset.id);

            // Create audience services
            const sourceAudienceService = createAudienceService(
              sourceOrg.accessToken,
              sourceOrg.credentials.clientId,
              sourceOrg.credentials.orgId,
              sourceOrg.credentials.sandboxName
            );

            const targetAudienceService = createAudienceService(
              targetOrg.accessToken,
              targetOrg.credentials.clientId,
              targetOrg.credentials.orgId,
              targetOrg.credentials.sandboxName
            );

            // Get full audience details from source
            let sourceAudience: any;
            try {
              sourceAudience = await sourceAudienceService.getAudience(asset.sourceId);
              addLog(job, 'info', `Fetched audience: ${sourceAudience.name}`, asset.id);
            } catch (e: any) {
              addLog(job, 'error', `Could not fetch audience details: ${e.message}`, asset.id);
              throw e;
            }

            // Check if audience already exists in target
            const existingAudience = await targetAudienceService.findAudienceByName(sourceAudience.name);
            if (existingAudience) {
              addLog(job, 'info', `Audience "${sourceAudience.name}" already exists in target`, asset.id);
              asset.targetId = existingAudience.id;
              job.idMappings.set(asset.sourceId, existingAudience.id);
              asset.status = 'skipped';
              job.skippedAssets++;
              continue;
            }

            // Transform PQL expression if it contains namespace references
            let transformedExpression = sourceAudience.expression?.value || '';
            addLog(job, 'info', `Original PQL: ${transformedExpression.substring(0, 200)}...`, asset.id);
            addLog(job, 'info', `Source namespace: ${sourceNamespace || 'not set'}, Target namespace: ${targetNamespace || 'not set'}`, asset.id);

            // Try to extract namespace from PQL if not already set
            let effectiveSourceNamespace = sourceNamespace;
            if (!effectiveSourceNamespace) {
              // Look for _tenantId pattern in PQL expression
              const namespaceMatch = transformedExpression.match(/_([a-zA-Z0-9]+)\./);
              if (namespaceMatch) {
                effectiveSourceNamespace = namespaceMatch[1];
                addLog(job, 'info', `Extracted source namespace from PQL: ${effectiveSourceNamespace}`, asset.id);
              }
            }

            if (effectiveSourceNamespace && targetNamespace && effectiveSourceNamespace !== targetNamespace) {
              transformedExpression = transformedExpression
                .replace(new RegExp(`_${effectiveSourceNamespace}\\.`, 'g'), `_${targetNamespace}.`)
                .replace(new RegExp(`_${effectiveSourceNamespace}(?=[^a-zA-Z0-9])`, 'g'), `_${targetNamespace}`)
                .replace(new RegExp(`${effectiveSourceNamespace}:`, 'g'), `${targetNamespace}:`);
              addLog(job, 'info', `Transformed PQL expression namespace: ${effectiveSourceNamespace} -> ${targetNamespace}`, asset.id);
              addLog(job, 'info', `Transformed PQL: ${transformedExpression.substring(0, 200)}...`, asset.id);
            } else {
              addLog(job, 'warn', `No namespace transformation applied. Source: ${effectiveSourceNamespace}, Target: ${targetNamespace}`, asset.id);
            }

            // Transform segment IDs for inSegment dependencies
            // This is critical for audiences that reference other audiences
            if (segmentIdMapping.size > 0) {
              const { transformed, mappingsApplied } = transformSegmentIds(transformedExpression, segmentIdMapping);
              if (mappingsApplied > 0) {
                transformedExpression = transformed;
                addLog(job, 'info', `Transformed ${mappingsApplied} segment ID reference(s) in PQL for inSegment dependencies`, asset.id);
              }
            }

            // Check if audience has dependencies that couldn't be mapped
            if (sourceAudience.dependencies && sourceAudience.dependencies.length > 0) {
              const unmappedDeps = sourceAudience.dependencies.filter((depId: string) => !segmentIdMapping.has(depId));
              if (unmappedDeps.length > 0) {
                addLog(job, 'warn', `Audience has ${unmappedDeps.length} unmapped dependency(ies): ${unmappedDeps.join(', ')}`, asset.id);
                addLog(job, 'warn', `These referenced audiences may not exist in target. Migration may fail.`, asset.id);
              }
            }

            // Transform schema name if it contains namespace
            let transformedSchemaName = sourceAudience.schema?.name || '';
            if (effectiveSourceNamespace && targetNamespace && effectiveSourceNamespace !== targetNamespace) {
              transformedSchemaName = transformedSchemaName
                .replace(new RegExp(`_${effectiveSourceNamespace}`, 'g'), `_${targetNamespace}`);
              addLog(job, 'info', `Transformed schema name: ${sourceAudience.schema?.name} -> ${transformedSchemaName}`, asset.id);
            }

            // Create audience in target
            try {
              const createPayload = {
                name: sourceAudience.name,
                description: sourceAudience.description || '',
                expression: {
                  type: sourceAudience.expression?.type || 'PQL',
                  format: sourceAudience.expression?.format || 'pql/text',
                  value: transformedExpression,
                },
                evaluationInfo: sourceAudience.evaluationInfo,
                schema: {
                  name: transformedSchemaName,
                },
              };

              addLog(job, 'info', `Creating audience with PQL: ${transformedExpression.substring(0, 100)}...`, asset.id);

              const createdAudience = await targetAudienceService.createAudience(createPayload);
              asset.targetId = createdAudience.id;
              job.idMappings.set(asset.sourceId, createdAudience.id);
              addLog(job, 'info', `Created audience: ${sourceAudience.name} (${createdAudience.id})`, asset.id);

            } catch (audienceError: any) {
              const errorData = audienceError.response?.data;
              const errorMessage = errorData?.detail || errorData?.title || errorData?.message || audienceError.message;
              addLog(job, 'error', `Failed to create audience: ${errorMessage}`, asset.id);

              // Check for schema field not found error
              const errorStr = JSON.stringify(errorData || {});
              if (errorStr.includes('Field not found in schema')) {
                const fieldMatch = errorStr.match(/Field not found in schema: ([^\\"]+)/);
                const missingField = fieldMatch ? fieldMatch[1] : 'unknown';
                addLog(job, 'error', `SCHEMA DEPENDENCY ERROR: The audience PQL references field "${missingField}" which doesn't exist in the target schema.`, asset.id);
                addLog(job, 'error', `To fix this: First migrate the field groups and schemas that contain the fields referenced in this audience's PQL expression.`, asset.id);
                addLog(job, 'error', `Required steps: 1) Migrate field groups 2) Migrate schemas 3) Then migrate this audience`, asset.id);
              }

              if (errorData) {
                addLog(job, 'error', `API Response: ${JSON.stringify(errorData)}`, asset.id);
              }
              throw audienceError;
            }
          } else if (asset.type === 'identityNamespace') {
            // Identity Namespace migration
            addLog(job, 'info', `Migrating identity namespace: ${sourceAsset.name || sourceAsset.code}`, asset.id);

            const sourceIdentityService = createIdentityService(
              sourceOrg.accessToken,
              sourceOrg.credentials.clientId,
              sourceOrg.credentials.orgId,
              sourceOrg.credentials.sandboxName
            );

            const targetIdentityService = createIdentityService(
              targetOrg.accessToken,
              targetOrg.credentials.clientId,
              targetOrg.credentials.orgId,
              targetOrg.credentials.sandboxName
            );

            // Get source namespace
            const sourceNamespaceData = await sourceIdentityService.getNamespace(asset.sourceId);

            // Skip standard namespaces (non-custom)
            if (!sourceNamespaceData.custom) {
              addLog(job, 'info', `Skipping standard namespace: ${sourceNamespaceData.name}`, asset.id);
              asset.status = 'skipped';
              job.skippedAssets++;
              continue;
            }

            // Check if exists in target
            try {
              await targetIdentityService.getNamespace(sourceNamespaceData.code);
              addLog(job, 'info', `Identity namespace already exists: ${sourceNamespaceData.code}`, asset.id);
              asset.targetId = sourceNamespaceData.code;
              asset.status = 'skipped';
              job.skippedAssets++;
              job.idMappings.set(asset.sourceId, sourceNamespaceData.code);
              continue;
            } catch (e: any) {
              // Namespace doesn't exist, create it
            }

            const newNamespace = await targetIdentityService.createNamespace({
              name: sourceNamespaceData.name,
              code: sourceNamespaceData.code,
              idType: sourceNamespaceData.idType,
              description: sourceNamespaceData.description,
            });

            asset.targetId = newNamespace.code;
            job.idMappings.set(asset.sourceId, newNamespace.code);
            addLog(job, 'info', `Created identity namespace: ${newNamespace.code}`, asset.id);

          } else if (asset.type === 'mergePolicy') {
            // Merge Policy migration
            addLog(job, 'info', `Migrating merge policy: ${sourceAsset.name}`, asset.id);

            const sourceProfileService = createProfileService(
              sourceOrg.accessToken,
              sourceOrg.credentials.clientId,
              sourceOrg.credentials.orgId,
              sourceOrg.credentials.sandboxName
            );

            const targetProfileService = createProfileService(
              targetOrg.accessToken,
              targetOrg.credentials.clientId,
              targetOrg.credentials.orgId,
              targetOrg.credentials.sandboxName
            );

            const sourcePolicy = await sourceProfileService.getMergePolicy(asset.sourceId);

            // Check if exists in target
            const targetPolicies = await targetProfileService.listMergePolicies();
            const existing = targetPolicies.find((p: any) => p.name === sourcePolicy.name);
            if (existing) {
              addLog(job, 'info', `Merge policy already exists: ${sourcePolicy.name}`, asset.id);
              asset.targetId = existing.id;
              asset.status = 'skipped';
              job.skippedAssets++;
              job.idMappings.set(asset.sourceId, existing.id);
              continue;
            }

            const newPolicy = await targetProfileService.createMergePolicy({
              name: sourcePolicy.name,
              identityGraph: sourcePolicy.identityGraph,
              attributeMerge: sourcePolicy.attributeMerge,
              schema: sourcePolicy.schema,
              default: false,
            });

            asset.targetId = newPolicy.id;
            job.idMappings.set(asset.sourceId, newPolicy.id);
            addLog(job, 'info', `Created merge policy: ${newPolicy.name}`, asset.id);

          } else if (asset.type === 'computedAttribute') {
            // Computed Attribute migration
            addLog(job, 'info', `Migrating computed attribute: ${sourceAsset.name}`, asset.id);

            const sourceProfileService = createProfileService(
              sourceOrg.accessToken,
              sourceOrg.credentials.clientId,
              sourceOrg.credentials.orgId,
              sourceOrg.credentials.sandboxName
            );

            const targetProfileService = createProfileService(
              targetOrg.accessToken,
              targetOrg.credentials.clientId,
              targetOrg.credentials.orgId,
              targetOrg.credentials.sandboxName
            );

            const sourceAttr = await sourceProfileService.getComputedAttribute(asset.sourceId);

            // Check if exists in target
            const targetAttrs = await targetProfileService.listComputedAttributes();
            const existing = targetAttrs.find((a: any) => a.name === sourceAttr.name);
            if (existing) {
              addLog(job, 'info', `Computed attribute already exists: ${sourceAttr.name}`, asset.id);
              asset.targetId = existing.id;
              asset.status = 'skipped';
              job.skippedAssets++;
              job.idMappings.set(asset.sourceId, existing.id);
              continue;
            }

            const newAttr = await targetProfileService.createComputedAttribute({
              name: sourceAttr.name,
              displayName: sourceAttr.displayName,
              description: sourceAttr.description,
              expression: sourceAttr.expression,
              mergeFunction: sourceAttr.mergeFunction,
              duration: sourceAttr.duration,
              path: sourceAttr.path,
              schema: sourceAttr.schema,
            });

            asset.targetId = newAttr.id;
            job.idMappings.set(asset.sourceId, newAttr.id);
            addLog(job, 'info', `Created computed attribute: ${newAttr.name}`, asset.id);

          } else if (asset.type === 'flowConnection') {
            // Flow Connection migration
            addLog(job, 'info', `Migrating flow connection: ${sourceAsset.name}`, asset.id);

            const sourceFlowService = createFlowService(
              sourceOrg.accessToken,
              sourceOrg.credentials.clientId,
              sourceOrg.credentials.orgId,
              sourceOrg.credentials.sandboxName
            );

            const targetFlowService = createFlowService(
              targetOrg.accessToken,
              targetOrg.credentials.clientId,
              targetOrg.credentials.orgId,
              targetOrg.credentials.sandboxName
            );

            const sourceConnection = await sourceFlowService.getConnection(asset.sourceId);

            // Check if exists in target
            const targetConnections = await targetFlowService.listConnections();
            const existing = targetConnections.find((c: any) => c.name === sourceConnection.name);
            if (existing) {
              addLog(job, 'info', `Flow connection already exists: ${sourceConnection.name}`, asset.id);
              asset.targetId = existing.id;
              asset.status = 'skipped';
              job.skippedAssets++;
              job.idMappings.set(asset.sourceId, existing.id);
              continue;
            }

            const newConnection = await targetFlowService.createConnection({
              name: sourceConnection.name,
              description: sourceConnection.description,
              connectionSpec: sourceConnection.connectionSpec,
              auth: sourceConnection.auth,
            });

            asset.targetId = newConnection.id;
            job.idMappings.set(asset.sourceId, newConnection.id);
            addLog(job, 'info', `Created flow connection: ${newConnection.name}`, asset.id);

          } else if (asset.type === 'dataFlow') {
            // Data Flow migration
            addLog(job, 'info', `Migrating data flow: ${sourceAsset.name}`, asset.id);

            const sourceFlowService = createFlowService(
              sourceOrg.accessToken,
              sourceOrg.credentials.clientId,
              sourceOrg.credentials.orgId,
              sourceOrg.credentials.sandboxName
            );

            const targetFlowService = createFlowService(
              targetOrg.accessToken,
              targetOrg.credentials.clientId,
              targetOrg.credentials.orgId,
              targetOrg.credentials.sandboxName
            );

            const sourceFlow = await sourceFlowService.getFlow(asset.sourceId);

            // Map connection IDs
            const sourceConnectionIds = sourceFlow.sourceConnectionIds?.map((id: string) => {
              return job.idMappings.get(id) || id;
            }) || [];

            const targetConnectionIds = sourceFlow.targetConnectionIds?.map((id: string) => {
              return job.idMappings.get(id) || id;
            }) || [];

            const newFlow = await targetFlowService.createFlow({
              name: sourceFlow.name || `Flow-${Date.now()}`,
              description: sourceFlow.description,
              flowSpec: sourceFlow.flowSpec,
              sourceConnectionIds,
              targetConnectionIds,
              transformations: sourceFlow.transformations,
              scheduleParams: sourceFlow.scheduleParams,
            });

            asset.targetId = newFlow.id;
            job.idMappings.set(asset.sourceId, newFlow.id);
            addLog(job, 'info', `Created data flow: ${newFlow.name || newFlow.id}`, asset.id);

          } else if (asset.type === 'sandbox') {
            // Sandboxes cannot be migrated - just log info
            addLog(job, 'warn', `Sandbox "${sourceAsset.name}" must be created manually in target org`, asset.id);
            asset.status = 'skipped';
            job.skippedAssets++;
            continue;

          } else if (asset.type === 'dataUsageLabel') {
            // Data Usage Label migration
            addLog(job, 'info', `Migrating data usage label: ${sourceAsset.name}`, asset.id);

            const sourcePolicyService = createPolicyService(
              sourceOrg.accessToken,
              sourceOrg.credentials.clientId,
              sourceOrg.credentials.orgId,
              sourceOrg.credentials.sandboxName
            );

            const targetPolicyService = createPolicyService(
              targetOrg.accessToken,
              targetOrg.credentials.clientId,
              targetOrg.credentials.orgId,
              targetOrg.credentials.sandboxName
            );

            const sourceLabel = await sourcePolicyService.getLabel(asset.sourceId);

            // Skip system/non-custom labels
            if (!sourceLabel.custom) {
              addLog(job, 'info', `Skipping system label: ${sourceLabel.name}`, asset.id);
              asset.status = 'skipped';
              job.skippedAssets++;
              continue;
            }

            // Check if exists in target
            try {
              await targetPolicyService.getLabel(sourceLabel.name);
              addLog(job, 'info', `Data usage label already exists: ${sourceLabel.name}`, asset.id);
              asset.targetId = sourceLabel.name;
              asset.status = 'skipped';
              job.skippedAssets++;
              job.idMappings.set(asset.sourceId, sourceLabel.name);
              continue;
            } catch (e: any) {
              // Label doesn't exist, create it
            }

            const newLabel = await targetPolicyService.createLabel({
              name: sourceLabel.name,
              friendlyName: sourceLabel.friendlyName,
              description: sourceLabel.description,
              category: sourceLabel.category,
            });

            asset.targetId = newLabel.name;
            job.idMappings.set(asset.sourceId, newLabel.name);
            addLog(job, 'info', `Created data usage label: ${newLabel.name}`, asset.id);

          } else if (asset.type === 'governancePolicy') {
            // Governance Policy migration
            addLog(job, 'info', `Migrating governance policy: ${sourceAsset.name}`, asset.id);

            const sourcePolicyService = createPolicyService(
              sourceOrg.accessToken,
              sourceOrg.credentials.clientId,
              sourceOrg.credentials.orgId,
              sourceOrg.credentials.sandboxName
            );

            const targetPolicyService = createPolicyService(
              targetOrg.accessToken,
              targetOrg.credentials.clientId,
              targetOrg.credentials.orgId,
              targetOrg.credentials.sandboxName
            );

            const sourcePolicy = await sourcePolicyService.getPolicy(asset.sourceId);

            // Skip likely core/system policies based on naming patterns
            const corePolicyPrefixes = ['Adobe', 'Core', 'Default', 'System'];
            const isLikelyCorePolicy = corePolicyPrefixes.some(prefix =>
              sourcePolicy.name.startsWith(prefix)
            );
            if (isLikelyCorePolicy) {
              addLog(job, 'info', `Skipping likely core policy: ${sourcePolicy.name}`, asset.id);
              asset.status = 'skipped';
              job.skippedAssets++;
              continue;
            }

            // Check if exists in target
            const targetPolicies = await targetPolicyService.listPolicies();
            const existing = targetPolicies.find((p: any) => p.name === sourcePolicy.name);
            if (existing) {
              addLog(job, 'info', `Governance policy already exists: ${sourcePolicy.name}`, asset.id);
              asset.targetId = existing.id;
              asset.status = 'skipped';
              job.skippedAssets++;
              job.idMappings.set(asset.sourceId, existing.id);
              continue;
            }

            const newPolicy = await targetPolicyService.createPolicy({
              name: sourcePolicy.name,
              description: sourcePolicy.description,
              marketingActionRefs: sourcePolicy.marketingActionRefs,
              denyExpression: sourcePolicy.denyExpression,
            });

            asset.targetId = newPolicy.id;
            job.idMappings.set(asset.sourceId, newPolicy.id);
            addLog(job, 'info', `Created governance policy: ${newPolicy.name}`, asset.id);

          }

          asset.status = 'completed';
          job.completedAssets++;
        }
      } catch (error: any) {
        asset.status = 'failed';
        // Extract detailed error message from API response
        const errorDetail = error.response?.data?.detail ||
                           error.response?.data?.message ||
                           error.response?.data?.title ||
                           (error.response?.data ? JSON.stringify(error.response.data) : null) ||
                           error.message;
        const statusCode = error.response?.status;
        asset.error = statusCode ? `(${statusCode}) ${errorDetail}` : errorDetail;
        job.failedAssets++;
        addLog(job, 'error', `Failed: ${sourceAsset.title} - ${asset.error}`, asset.id);
        if (error.response?.data) {
          addLog(job, 'error', `API Response: ${JSON.stringify(error.response.data)}`, asset.id);
        }
      }

      // Update progress after each asset
      job.progress = Math.round(((i + 1) / job.assets.length) * 100);
      job.updatedAt = new Date();

      // Log progress every 5 assets or at end
      if ((i + 1) % 5 === 0 || i === job.assets.length - 1) {
        addLog(job, 'info', `Progress: ${job.progress}% (${i + 1}/${job.assets.length}) - Completed: ${job.completedAssets}, Failed: ${job.failedAssets}, Skipped: ${job.skippedAssets}`);
      }
    }

    // Complete
    job.status = job.failedAssets > 0 && job.completedAssets === 0 ? 'failed' : 'completed';
    job.progress = 100;
    job.updatedAt = new Date();
    addLog(job, 'success', `Migration completed: ${job.completedAssets} succeeded, ${job.failedAssets} failed, ${job.skippedAssets} skipped`);

  } catch (error) {
    job.status = 'failed';
    addLog(job, 'error', `Migration failed: ${(error as Error).message}`);
    logger.error('Migration execution failed', { jobId, error });
  }

  job.updatedAt = new Date();
}

function addLog(job: MigrationJob, level: 'info' | 'warn' | 'error' | 'success', message: string, assetId?: string) {
  job.logs.push({
    timestamp: new Date(),
    level: level === 'success' ? 'info' : level, // Map success to info for storage
    message,
    assetId,
  });
  const logData = { jobId: job.id, assetId };
  if (level === 'info' || level === 'success') {
    logger.info(message, logData);
  } else if (level === 'warn') {
    logger.warn(message, logData);
  } else {
    logger.error(message, logData);
  }
}
