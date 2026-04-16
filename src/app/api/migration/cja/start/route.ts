import { NextRequest, NextResponse } from 'next/server';
import {
  createCJAConnectionService,
  createCJADataViewService,
  createCJASegmentService,
  createCJACalculatedMetricService,
  createDatasetService,
} from '@/services/adobe';
import { createLogger } from '@/utils/logger';

const logger = createLogger('API:CJAMigration:Start');

// Access the global org store
declare global {
  var orgStore: Map<string, any> | undefined;
  var cjaMigrationJobs: Map<string, any> | undefined;
}

if (!global.cjaMigrationJobs) {
  global.cjaMigrationJobs = new Map();
}

interface CJAMigrationAsset {
  id: string;
  sourceId: string;
  type: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  error?: string;
  targetId?: string;
}

interface CJAMigrationLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  assetId?: string;
}

interface CJAMigrationJob {
  id: string;
  sourceOrgId: string;
  targetOrgId: string;
  assets: CJAMigrationAsset[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalAssets: number;
  completedAssets: number;
  failedAssets: number;
  skippedAssets: number;
  logs: CJAMigrationLog[];
  idMappings: Map<string, string>;
  options: {
    dryRun: boolean;
    conflictStrategy: 'skip' | 'overwrite' | 'rename';
    migrateSegmentsFirst: boolean;
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

    logger.info('Creating CJA migration job', {
      sourceOrgId,
      targetOrgId,
      assetCount: assetIds.length,
      options: JSON.stringify(options),
    });

    // Create job ID
    const jobId = `cja_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create migration job
    const job: CJAMigrationJob = {
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
        migrateSegmentsFirst: options?.migrateSegmentsFirst || true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store job
    global.cjaMigrationJobs!.set(jobId, job);

    logger.info('CJA migration job created', { jobId });

    // Start migration in background
    executeCJAMigration(jobId, sourceOrg, targetOrg);

    return NextResponse.json({
      success: true,
      jobId,
      message: 'CJA migration job started',
    });
  } catch (error) {
    logger.error('Error starting CJA migration', { error });

    return NextResponse.json(
      { error: 'Failed to start CJA migration' },
      { status: 500 }
    );
  }
}

async function executeCJAMigration(jobId: string, sourceOrg: any, targetOrg: any) {
  const job = global.cjaMigrationJobs!.get(jobId);
  if (!job) return;

  job.status = 'running';
  addLog(job, 'info', 'CJA Migration started');

  try {
    // Create services for source and target
    const sourceConnectionService = createCJAConnectionService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const targetConnectionService = createCJAConnectionService(
      targetOrg.accessToken,
      targetOrg.credentials.clientId,
      targetOrg.credentials.orgId,
      targetOrg.credentials.sandboxName
    );

    const sourceDataViewService = createCJADataViewService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const targetDataViewService = createCJADataViewService(
      targetOrg.accessToken,
      targetOrg.credentials.clientId,
      targetOrg.credentials.orgId,
      targetOrg.credentials.sandboxName
    );

    const sourceSegmentService = createCJASegmentService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const targetSegmentService = createCJASegmentService(
      targetOrg.accessToken,
      targetOrg.credentials.clientId,
      targetOrg.credentials.orgId,
      targetOrg.credentials.sandboxName
    );

    const sourceCalcMetricService = createCJACalculatedMetricService(
      sourceOrg.accessToken,
      sourceOrg.credentials.clientId,
      sourceOrg.credentials.orgId,
      sourceOrg.credentials.sandboxName
    );

    const targetCalcMetricService = createCJACalculatedMetricService(
      targetOrg.accessToken,
      targetOrg.credentials.clientId,
      targetOrg.credentials.orgId,
      targetOrg.credentials.sandboxName
    );

    // Create dataset service for dataset ID mapping
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

    // Fetch all CJA assets from source
    addLog(job, 'info', 'Fetching CJA assets from source organization...');

    let allConnections: any[] = [];
    let allDataViews: any[] = [];
    let allSegments: any[] = [];
    let allFilters: any[] = [];
    let allCalcMetrics: any[] = [];

    try {
      allConnections = await sourceConnectionService.listConnections();
      addLog(job, 'info', `Found ${allConnections.length} connections in source`);
    } catch (e: any) {
      addLog(job, 'warn', `Could not fetch connections: ${e.message}`);
    }

    try {
      allDataViews = await sourceDataViewService.listDataViews();
      addLog(job, 'info', `Found ${allDataViews.length} data views in source`);
    } catch (e: any) {
      addLog(job, 'warn', `Could not fetch data views: ${e.message}`);
    }

    try {
      allSegments = await sourceSegmentService.listSegments();
      addLog(job, 'info', `Found ${allSegments.length} segments in source`);
    } catch (e: any) {
      addLog(job, 'warn', `Could not fetch segments: ${e.message}`);
    }

    try {
      allFilters = await sourceSegmentService.listFilters();
      addLog(job, 'info', `Found ${allFilters.length} filters in source`);
    } catch (e: any) {
      addLog(job, 'warn', `Could not fetch filters: ${e.message}`);
    }

    try {
      allCalcMetrics = await sourceCalcMetricService.listCalculatedMetrics();
      addLog(job, 'info', `Found ${allCalcMetrics.length} calculated metrics in source`);
    } catch (e: any) {
      addLog(job, 'warn', `Could not fetch calculated metrics: ${e.message}`);
    }

    // Build asset map
    const assetMap = new Map<string, any>();
    allConnections.forEach((c) => assetMap.set(c.id, { ...c, assetType: 'cjaConnection' }));
    allDataViews.forEach((dv) => assetMap.set(dv.id, { ...dv, assetType: 'cjaDataView' }));
    allSegments.forEach((s) => assetMap.set(s.id, { ...s, assetType: 'cjaSegment' }));
    allFilters.forEach((f) => assetMap.set(f.id, { ...f, assetType: 'cjaFilter' }));
    allCalcMetrics.forEach((m) => assetMap.set(m.id, { ...m, assetType: 'cjaCalculatedMetric' }));

    // Fetch datasets for mapping
    let sourceDatasets: any[] = [];
    let targetDatasets: any[] = [];

    try {
      sourceDatasets = await sourceDatasetService.listDatasets();
      addLog(job, 'info', `Found ${sourceDatasets.length} datasets in source`);
    } catch (e: any) {
      addLog(job, 'warn', `Could not fetch source datasets: ${e.message}`);
    }

    try {
      targetDatasets = await targetDatasetService.listDatasets();
      addLog(job, 'info', `Found ${targetDatasets.length} datasets in target`);
    } catch (e: any) {
      addLog(job, 'warn', `Could not fetch target datasets: ${e.message}`);
    }

    // Build dataset name mapping (source dataset ID -> target dataset ID)
    const datasetMapping = new Map<string, string>();
    for (const sourceDs of sourceDatasets) {
      const targetDs = targetDatasets.find((t) => t.name === sourceDs.name);
      if (targetDs) {
        datasetMapping.set(sourceDs.id, targetDs.id);
      }
    }
    addLog(job, 'info', `Mapped ${datasetMapping.size} datasets between orgs`);

    // Fetch existing target assets for conflict detection
    let targetConnections: any[] = [];
    let targetDataViews: any[] = [];
    let targetSegments: any[] = [];
    let targetFilters: any[] = [];
    let targetCalcMetrics: any[] = [];

    try {
      targetConnections = await targetConnectionService.listConnections();
      addLog(job, 'info', `Found ${targetConnections.length} existing connections in target`);
    } catch (e) {}

    try {
      targetDataViews = await targetDataViewService.listDataViews();
      addLog(job, 'info', `Found ${targetDataViews.length} existing data views in target`);
    } catch (e) {}

    try {
      targetSegments = await targetSegmentService.listSegments();
      addLog(job, 'info', `Found ${targetSegments.length} existing segments in target`);
    } catch (e) {}

    try {
      targetFilters = await targetSegmentService.listFilters();
      addLog(job, 'info', `Found ${targetFilters.length} existing filters in target`);
    } catch (e) {}

    try {
      targetCalcMetrics = await targetCalcMetricService.listCalculatedMetrics();
      addLog(job, 'info', `Found ${targetCalcMetrics.length} existing calculated metrics in target`);
    } catch (e) {}

    // Build target asset name maps
    const targetAssetsByName = new Map<string, any>();
    targetConnections.forEach((c) => targetAssetsByName.set(`cjaConnection:${c.name}`, c));
    targetDataViews.forEach((dv) => targetAssetsByName.set(`cjaDataView:${dv.name}`, dv));
    targetSegments.forEach((s) => targetAssetsByName.set(`cjaSegment:${s.name}`, s));
    targetFilters.forEach((f) => targetAssetsByName.set(`cjaFilter:${f.name}`, f));
    targetCalcMetrics.forEach((m) => targetAssetsByName.set(`cjaCalculatedMetric:${m.name}`, m));

    // Resolve dependencies and build migration order
    // Order: Connections -> DataViews -> Segments (if migrateSegmentsFirst) -> CalcMetrics -> Filters
    const selectedIds = new Set<string>(job.assets.map((a: CJAMigrationAsset) => a.sourceId));
    const migrationOrder: string[] = [];
    const resolvedIds = new Set<string>();

    // Helper to resolve dependencies
    function resolveDependencies(assetId: string) {
      if (resolvedIds.has(assetId)) return;

      const asset = assetMap.get(assetId);
      if (!asset) return;

      // Resolve dependencies first
      if (asset.assetType === 'cjaDataView' && asset.parentDataGroupId) {
        if (selectedIds.has(asset.parentDataGroupId) || assetMap.has(asset.parentDataGroupId)) {
          if (!selectedIds.has(asset.parentDataGroupId)) {
            selectedIds.add(asset.parentDataGroupId);
            addLog(job, 'info', `Auto-adding required connection: ${assetMap.get(asset.parentDataGroupId)?.name}`);
          }
          resolveDependencies(asset.parentDataGroupId);
        }
      }

      if ((asset.assetType === 'cjaSegment' || asset.assetType === 'cjaFilter' || asset.assetType === 'cjaCalculatedMetric') && asset.dataId) {
        if (selectedIds.has(asset.dataId) || assetMap.has(asset.dataId)) {
          if (!selectedIds.has(asset.dataId)) {
            selectedIds.add(asset.dataId);
            addLog(job, 'info', `Auto-adding required data view: ${assetMap.get(asset.dataId)?.name}`);
          }
          resolveDependencies(asset.dataId);
        }
      }

      resolvedIds.add(assetId);
      migrationOrder.push(assetId);
    }

    // Resolve all dependencies
    for (const assetId of Array.from(selectedIds)) {
      resolveDependencies(assetId);
    }

    // Sort migration order by asset type
    const typeOrder = ['cjaConnection', 'cjaDataView', 'cjaSegment', 'cjaCalculatedMetric', 'cjaFilter'];
    migrationOrder.sort((a, b) => {
      const typeA = assetMap.get(a)?.assetType || '';
      const typeB = assetMap.get(b)?.assetType || '';
      return typeOrder.indexOf(typeA) - typeOrder.indexOf(typeB);
    });

    // Update job assets
    const updatedAssets: CJAMigrationAsset[] = migrationOrder.map((assetId: string) => {
      const asset = assetMap.get(assetId);
      const existingAsset = job.assets.find((a: CJAMigrationAsset) => a.sourceId === assetId);

      return {
        id: existingAsset?.id || `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sourceId: assetId,
        type: asset?.assetType || 'unknown',
        name: asset?.name || assetId,
        status: 'pending' as const,
      };
    });

    job.assets = updatedAssets;
    job.totalAssets = updatedAssets.length;

    addLog(job, 'info', `Migration order resolved: ${job.totalAssets} assets to migrate`);

    // Migrate each asset
    for (let i = 0; i < job.assets.length; i++) {
      const asset = job.assets[i];
      const sourceAsset = assetMap.get(asset.sourceId);

      if (!sourceAsset) {
        asset.status = 'skipped';
        asset.error = 'Asset not found in source';
        job.skippedAssets++;
        addLog(job, 'warn', `Skipped: ${asset.name} - not found`, asset.id);
        continue;
      }

      asset.status = 'in_progress';
      addLog(job, 'info', `Migrating: ${sourceAsset.name} (${asset.type})`, asset.id);

      try {
        // Check if exists in target
        const targetKey = `${asset.type}:${sourceAsset.name}`;
        const existingTarget = targetAssetsByName.get(targetKey);

        if (existingTarget) {
          if (job.options.conflictStrategy === 'skip') {
            asset.status = 'skipped';
            asset.targetId = existingTarget.id;
            job.skippedAssets++;
            job.idMappings.set(asset.sourceId, existingTarget.id);
            addLog(job, 'info', `Skipped (exists): ${sourceAsset.name}`, asset.id);
            continue;
          }
        }

        if (job.options.dryRun) {
          asset.status = 'completed';
          job.completedAssets++;
          addLog(job, 'info', `[DRY RUN] Would migrate: ${sourceAsset.name}`, asset.id);
        } else {
          // Migrate based on asset type
          if (asset.type === 'cjaConnection') {
            // Migrate connection
            const fullConnection = await sourceConnectionService.getConnection(asset.sourceId);

            const created = await targetConnectionService.copyConnection(
              fullConnection,
              datasetMapping
            );

            asset.targetId = created.id;
            job.idMappings.set(asset.sourceId, created.id);
            addLog(job, 'info', `Created connection: ${sourceAsset.name} -> ${created.id}`, asset.id);

          } else if (asset.type === 'cjaDataView') {
            // Migrate data view
            const fullDataView = await sourceDataViewService.getDataView(asset.sourceId);

            // Get target connection ID
            const targetConnectionId = job.idMappings.get(fullDataView.parentDataGroupId || '');
            if (!targetConnectionId) {
              throw new Error(`Target connection not found for data view. Please migrate the connection first.`);
            }

            const created = await targetDataViewService.copyDataViewFull(
              fullDataView,
              targetConnectionId,
              job.idMappings
            );

            asset.targetId = created.id;
            job.idMappings.set(asset.sourceId, created.id);
            addLog(job, 'info', `Created data view: ${sourceAsset.name} -> ${created.id}`, asset.id);

          } else if (asset.type === 'cjaSegment') {
            // Migrate segment
            const fullSegment = await sourceSegmentService.getSegment(asset.sourceId);

            // Get target data view ID
            const targetDataViewId = job.idMappings.get(fullSegment.dataId || fullSegment.rsid || '');

            const created = await targetSegmentService.copySegment(
              fullSegment,
              targetDataViewId,
              job.idMappings
            );

            asset.targetId = created.id;
            job.idMappings.set(asset.sourceId, created.id);
            addLog(job, 'info', `Created segment: ${sourceAsset.name} -> ${created.id}`, asset.id);

          } else if (asset.type === 'cjaFilter') {
            // Migrate filter
            const fullFilter = await sourceSegmentService.getFilter(asset.sourceId);

            // Get target data view ID
            const targetDataViewId = job.idMappings.get(fullFilter.dataId || '');

            const created = await targetSegmentService.copyFilter(
              fullFilter,
              targetDataViewId,
              job.idMappings
            );

            asset.targetId = created.id;
            job.idMappings.set(asset.sourceId, created.id);
            addLog(job, 'info', `Created filter: ${sourceAsset.name} -> ${created.id}`, asset.id);

          } else if (asset.type === 'cjaCalculatedMetric') {
            // Migrate calculated metric
            const fullMetric = await sourceCalcMetricService.getCalculatedMetric(asset.sourceId);

            // Get target data view ID
            const targetDataViewId = job.idMappings.get(fullMetric.dataId || fullMetric.rsid || '');

            const created = await targetCalcMetricService.copyCalculatedMetric(
              fullMetric,
              targetDataViewId,
              job.idMappings
            );

            asset.targetId = created.id;
            job.idMappings.set(asset.sourceId, created.id);
            addLog(job, 'info', `Created calculated metric: ${sourceAsset.name} -> ${created.id}`, asset.id);
          }

          asset.status = 'completed';
          job.completedAssets++;
        }
      } catch (error: any) {
        asset.status = 'failed';
        const errorDetail =
          error.response?.data?.detail ||
          error.response?.data?.message ||
          error.response?.data?.title ||
          error.message;
        const statusCode = error.response?.status;
        asset.error = statusCode ? `(${statusCode}) ${errorDetail}` : errorDetail;
        job.failedAssets++;
        addLog(job, 'error', `Failed: ${sourceAsset.name} - ${asset.error}`, asset.id);
        if (error.response?.data) {
          addLog(job, 'error', `API Response: ${JSON.stringify(error.response.data)}`, asset.id);
        }
      }

      // Update progress
      job.progress = Math.round(((i + 1) / job.assets.length) * 100);
      job.updatedAt = new Date();
    }

    // Complete
    job.status = job.failedAssets > 0 ? 'failed' : 'completed';
    job.progress = 100;
    addLog(
      job,
      'info',
      `CJA Migration completed: ${job.completedAssets} succeeded, ${job.failedAssets} failed, ${job.skippedAssets} skipped`
    );
  } catch (error) {
    job.status = 'failed';
    addLog(job, 'error', `CJA Migration failed: ${(error as Error).message}`);
    logger.error('CJA Migration execution failed', { jobId, error });
  }

  job.updatedAt = new Date();
}

function addLog(
  job: CJAMigrationJob,
  level: 'info' | 'warn' | 'error',
  message: string,
  assetId?: string
) {
  job.logs.push({
    timestamp: new Date(),
    level,
    message,
    assetId,
  });
  const logData = { jobId: job.id, assetId };
  switch (level) {
    case 'info':
      logger.info(message, logData);
      break;
    case 'warn':
      logger.warn(message, logData);
      break;
    case 'error':
      logger.error(message, logData);
      break;
  }
}
