import { createLogger } from '@/utils/logger';
import { migrationConfig } from '@/config';
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
  adobeAuthService,
} from './adobe';
import { MigrationJob, Organization, IMigrationAsset } from '@/models';
import type {
  Schema,
  FieldGroup,
  Dataset,
  Audience,
  LaunchProperty,
  LaunchExtension,
  LaunchDataElement,
  LaunchRule,
  AssetType,
} from '@/types';

const logger = createLogger('MigrationService');

// ============================================================================
// Types
// ============================================================================

interface MigrationContext {
  sourceOrg: InstanceType<typeof Organization>;
  targetOrg: InstanceType<typeof Organization>;
  job: InstanceType<typeof MigrationJob>;
  idMappings: Map<string, string>;
  dryRun: boolean;
}

// ============================================================================
// Migration Service
// ============================================================================

export class MigrationService {
  /**
   * Execute a migration job
   */
  async executeMigration(jobId: string): Promise<void> {
    const job = await MigrationJob.findById(jobId)
      .populate('sourceOrg')
      .populate('targetOrg');

    if (!job) {
      throw new Error(`Migration job not found: ${jobId}`);
    }

    const sourceOrg = job.sourceOrg as unknown as InstanceType<typeof Organization>;
    const targetOrg = job.targetOrg as unknown as InstanceType<typeof Organization>;

    logger.info('Starting migration job', { jobId });

    // Update job status
    job.status = 'running';
    job.startedAt = new Date();
    job.addLog('info', 'Migration job started');
    await job.save();

    const context: MigrationContext = {
      sourceOrg,
      targetOrg,
      job,
      idMappings: new Map(),
      dryRun: job.options.dryRun,
    };

    try {
      // Sort assets by dependency order
      const sortedAssets = this.sortAssetsByDependency(job.assets);

      // Process each asset
      for (const asset of sortedAssets) {
        await this.processAsset(context, asset);
        await job.save();
      }

      // Complete job
      job.status = job.failedAssets > 0 ? 'failed' : 'completed';
      job.completedAt = new Date();
      job.addLog(
        job.status === 'completed' ? 'success' : 'warn',
        `Migration ${job.status}. ${job.completedAssets}/${job.totalAssets} assets processed.`
      );
      await job.save();

      logger.info('Migration job completed', {
        jobId,
        status: job.status,
        completed: job.completedAssets,
        failed: job.failedAssets,
      });
    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.addLog('error', `Migration failed: ${(error as Error).message}`);
      await job.save();

      logger.error('Migration job failed', { jobId, error });
      throw error;
    }
  }

  /**
   * Sort assets by dependency order
   */
  private sortAssetsByDependency(assets: IMigrationAsset[]): IMigrationAsset[] {
    const order = migrationConfig.dependencyOrder;

    return [...assets].sort((a, b) => {
      const aIndex = order.indexOf(a.type as typeof order[number]);
      const bIndex = order.indexOf(b.type as typeof order[number]);
      return aIndex - bIndex;
    });
  }

  /**
   * Process a single asset
   */
  private async processAsset(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<void> {
    const { job, dryRun } = context;

    logger.info(`Processing asset: ${asset.name}`, { type: asset.type });
    job.updateAssetStatus(asset.id, 'in_progress');
    job.addLog('info', `Processing ${asset.type}: ${asset.name}`, asset.id, asset.type);

    if (dryRun) {
      job.updateAssetStatus(asset.id, 'completed');
      job.addLog('info', `[DRY RUN] Would copy ${asset.type}: ${asset.name}`, asset.id, asset.type);
      return;
    }

    try {
      let targetId: string | undefined;

      switch (asset.type) {
        case 'fieldGroup':
          targetId = await this.copyFieldGroup(context, asset);
          break;
        case 'schema':
          targetId = await this.copySchema(context, asset);
          break;
        case 'dataset':
          targetId = await this.copyDataset(context, asset);
          break;
        case 'audience':
          targetId = await this.copyAudience(context, asset);
          break;
        case 'launchProperty':
          targetId = await this.copyLaunchProperty(context, asset);
          break;
        case 'launchExtension':
          targetId = await this.copyLaunchExtension(context, asset);
          break;
        case 'launchDataElement':
          targetId = await this.copyLaunchDataElement(context, asset);
          break;
        case 'launchRule':
          targetId = await this.copyLaunchRule(context, asset);
          break;
        // New asset types
        case 'identityNamespace':
          targetId = await this.copyIdentityNamespace(context, asset);
          break;
        case 'mergePolicy':
          targetId = await this.copyMergePolicy(context, asset);
          break;
        case 'computedAttribute':
          targetId = await this.copyComputedAttribute(context, asset);
          break;
        case 'flowConnection':
          targetId = await this.copyFlowConnection(context, asset);
          break;
        case 'dataFlow':
          targetId = await this.copyDataFlow(context, asset);
          break;
        case 'sandbox':
          // Sandboxes typically cannot be copied - they need to be created manually
          // This is informational only
          job.addLog('warn', `Sandbox "${asset.name}" must be created manually in target org`, asset.id, asset.type);
          targetId = asset.sourceId; // Keep the same ID reference
          break;
        case 'dataUsageLabel':
          targetId = await this.copyDataUsageLabel(context, asset);
          break;
        case 'governancePolicy':
          targetId = await this.copyGovernancePolicy(context, asset);
          break;
        default:
          throw new Error(`Unknown asset type: ${asset.type}`);
      }

      // Store ID mapping
      if (targetId) {
        context.idMappings.set(asset.sourceId, targetId);
        job.addIdMapping(asset.type, asset.sourceId, targetId, asset.name);
      }

      job.updateAssetStatus(asset.id, 'completed', targetId);
      job.addLog('success', `Successfully copied ${asset.type}: ${asset.name}`, asset.id, asset.type);
    } catch (error) {
      const errorMessage = (error as Error).message;

      // Handle conflict based on strategy
      if (
        errorMessage.includes('already exists') ||
        errorMessage.includes('conflict')
      ) {
        if (job.options.conflictStrategy === 'skip') {
          job.updateAssetStatus(asset.id, 'skipped');
          job.addLog('warn', `Skipped (already exists): ${asset.name}`, asset.id, asset.type);
          return;
        }
      }

      job.updateAssetStatus(asset.id, 'failed', undefined, errorMessage);
      job.addLog('error', `Failed to copy ${asset.type}: ${errorMessage}`, asset.id, asset.type);
      logger.error(`Failed to process asset: ${asset.name}`, { error: errorMessage });
    }
  }

  // ==========================================================================
  // Copy Methods
  // ==========================================================================

  private async copyFieldGroup(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createSchemaService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createSchemaService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source field group
    const sourceFieldGroup = await sourceService.getFieldGroup(asset.sourceId);

    // Check if exists in target
    const existing = await targetService.findFieldGroupByTitle(sourceFieldGroup.title);
    if (existing) {
      throw new Error(`Field group already exists: ${sourceFieldGroup.title}`);
    }

    // Copy field group
    const newFieldGroup = await targetService.copyFieldGroup(sourceFieldGroup, idMappings);

    return newFieldGroup.$id;
  }

  private async copySchema(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createSchemaService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createSchemaService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source schema
    const sourceSchema = await sourceService.getSchema(asset.sourceId);

    // Check if exists in target
    const existing = await targetService.findSchemaByTitle(sourceSchema.title);
    if (existing) {
      throw new Error(`Schema already exists: ${sourceSchema.title}`);
    }

    // Copy schema
    const newSchema = await targetService.copySchema(sourceSchema, idMappings);

    return newSchema.$id;
  }

  private async copyDataset(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createDatasetService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createDatasetService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source dataset
    const sourceDataset = await sourceService.getDataset(asset.sourceId);

    // Check if exists in target
    const existing = await targetService.findDatasetByName(sourceDataset.name);
    if (existing) {
      throw new Error(`Dataset already exists: ${sourceDataset.name}`);
    }

    // Copy dataset
    const newDataset = await targetService.copyDataset(sourceDataset, idMappings);

    return newDataset.id;
  }

  private async copyAudience(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createAudienceService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createAudienceService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source audience
    const sourceAudience = await sourceService.getAudience(asset.sourceId);

    // Check if exists in target
    const existing = await targetService.findAudienceByName(sourceAudience.name);
    if (existing) {
      throw new Error(`Audience already exists: ${sourceAudience.name}`);
    }

    // Copy audience
    const newAudience = await targetService.copyAudience(sourceAudience, idMappings);

    return newAudience.id;
  }

  private async copyLaunchProperty(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createReactorService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId
    );

    const targetService = createReactorService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId
    );

    // Get source property
    const sourceProperty = await sourceService.getProperty(asset.sourceId);

    // Check if exists in target
    const existing = await targetService.findPropertyByName(sourceProperty.attributes.name);
    if (existing) {
      throw new Error(`Property already exists: ${sourceProperty.attributes.name}`);
    }

    // Create property
    const newProperty = await targetService.createProperty(
      sourceProperty.attributes.name,
      sourceProperty.attributes.platform
    );

    return newProperty.id;
  }

  private async copyLaunchExtension(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { targetOrg, idMappings } = context;

    const targetCreds = targetOrg.getDecryptedCredentials();
    const targetToken = await this.getAccessToken(targetOrg);

    const targetService = createReactorService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId
    );

    // Get target property ID from mappings
    const targetPropertyId = idMappings.get(asset.metadata?.propertyId as string);
    if (!targetPropertyId) {
      throw new Error('Target property not found for extension');
    }

    // Find extension package
    const extensionPackage = await targetService.findExtensionPackage(
      asset.metadata?.extensionPackageName as string
    );
    if (!extensionPackage) {
      throw new Error(`Extension package not found: ${asset.metadata?.extensionPackageName}`);
    }

    // Install extension
    const newExtension = await targetService.installExtension(
      targetPropertyId,
      extensionPackage.id,
      asset.metadata?.settings as string
    );

    return newExtension.id;
  }

  private async copyLaunchDataElement(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { targetOrg, idMappings } = context;

    const targetCreds = targetOrg.getDecryptedCredentials();
    const targetToken = await this.getAccessToken(targetOrg);

    const targetService = createReactorService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId
    );

    // Get target property and extension IDs from mappings
    const targetPropertyId = idMappings.get(asset.metadata?.propertyId as string);
    const targetExtensionId = idMappings.get(asset.metadata?.extensionId as string);

    if (!targetPropertyId || !targetExtensionId) {
      throw new Error('Target property or extension not found for data element');
    }

    const metadata = asset.metadata as Record<string, unknown>;

    const newDataElement = await targetService.createDataElement(
      targetPropertyId,
      asset.name,
      targetExtensionId,
      metadata.delegateDescriptorId as string,
      metadata.settings as string,
      {
        storageDuration: metadata.storageDuration as 'pageview' | 'session' | 'visitor',
        defaultValue: metadata.defaultValue as string,
        forceLowerCase: metadata.forceLowerCase as boolean,
        cleanText: metadata.cleanText as boolean,
      }
    );

    return newDataElement.id;
  }

  private async copyLaunchRule(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createReactorService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId
    );

    const targetService = createReactorService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId
    );

    // Get target property ID from mappings
    const targetPropertyId = idMappings.get(asset.metadata?.propertyId as string);
    if (!targetPropertyId) {
      throw new Error('Target property not found for rule');
    }

    // Create rule
    const newRule = await targetService.createRule(targetPropertyId, asset.name);

    // Copy rule components
    const sourceComponents = await sourceService.listRuleComponents(asset.sourceId);

    for (const component of sourceComponents) {
      const targetExtensionId = idMappings.get(component.relationships.extension.data.id);
      if (!targetExtensionId) {
        logger.warn('Extension mapping not found for rule component', {
          componentId: component.id,
        });
        continue;
      }

      await targetService.createRuleComponent(
        targetPropertyId,
        newRule.id,
        targetExtensionId,
        component.attributes.name,
        component.attributes.delegateDescriptorId,
        component.attributes.order,
        component.attributes.settings,
        {
          negate: component.attributes.negate,
          ruleOrder: component.attributes.ruleOrder,
          timeout: component.attributes.timeout,
          delayNext: component.attributes.delayNext,
        }
      );
    }

    return newRule.id;
  }

  // ==========================================================================
  // New Asset Type Copy Methods
  // ==========================================================================

  private async copyIdentityNamespace(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createIdentityService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createIdentityService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source namespace
    const sourceNamespace = await sourceService.getNamespace(asset.sourceId);

    // Check if it's a standard namespace (can't be copied)
    if (!sourceNamespace.custom) {
      logger.info(`Skipping standard identity namespace: ${sourceNamespace.name}`);
      return sourceNamespace.code;
    }

    // Check if exists in target
    try {
      await targetService.getNamespace(sourceNamespace.code);
      throw new Error(`Identity namespace already exists: ${sourceNamespace.code}`);
    } catch (e: any) {
      if (!e.message.includes('not found') && !e.message.includes('404')) {
        throw e;
      }
    }

    // Create namespace in target
    const newNamespace = await targetService.createNamespace({
      name: sourceNamespace.name,
      code: sourceNamespace.code,
      idType: sourceNamespace.idType,
      description: sourceNamespace.description,
    });

    return newNamespace.code;
  }

  private async copyMergePolicy(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createProfileService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createProfileService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source merge policy
    const sourcePolicy = await sourceService.getMergePolicy(asset.sourceId);

    // Check if exists in target (by name)
    const existingPolicies = await targetService.listMergePolicies();
    const existing = existingPolicies.find(p => p.name === sourcePolicy.name);
    if (existing) {
      throw new Error(`Merge policy already exists: ${sourcePolicy.name}`);
    }

    // Map schema reference if needed
    let schemaName = sourcePolicy.schema?.name || '';
    if (schemaName && idMappings.has(schemaName)) {
      schemaName = idMappings.get(schemaName)!;
    }

    // Create merge policy in target
    const newPolicy = await targetService.createMergePolicy({
      name: sourcePolicy.name,
      identityGraph: sourcePolicy.identityGraph,
      attributeMerge: sourcePolicy.attributeMerge,
      schema: { name: schemaName },
      default: false, // Don't set as default initially
    });

    return newPolicy.id;
  }

  private async copyComputedAttribute(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createProfileService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createProfileService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source computed attribute
    const sourceAttr = await sourceService.getComputedAttribute(asset.sourceId);

    // Check if exists in target (by name)
    const existingAttrs = await targetService.listComputedAttributes();
    const existing = existingAttrs.find(a => a.name === sourceAttr.name);
    if (existing) {
      throw new Error(`Computed attribute already exists: ${sourceAttr.name}`);
    }

    // Create computed attribute in target
    const newAttr = await targetService.createComputedAttribute({
      name: sourceAttr.name,
      displayName: sourceAttr.displayName,
      description: sourceAttr.description,
      expression: sourceAttr.expression,
      mergeFunction: sourceAttr.mergeFunction,
      duration: sourceAttr.duration,
      path: sourceAttr.path,
      schema: sourceAttr.schema,
    });

    return newAttr.id;
  }

  private async copyFlowConnection(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createFlowService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createFlowService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source connection
    const sourceConnection = await sourceService.getConnection(asset.sourceId);

    // Check if exists in target (by name)
    const existingConnections = await targetService.listConnections();
    const existing = existingConnections.find(c => c.name === sourceConnection.name);
    if (existing) {
      throw new Error(`Flow connection already exists: ${sourceConnection.name}`);
    }

    // Create connection in target
    const newConnection = await targetService.createConnection({
      name: sourceConnection.name,
      description: sourceConnection.description,
      connectionSpec: sourceConnection.connectionSpec,
      auth: sourceConnection.auth,
    });

    return newConnection.id;
  }

  private async copyDataFlow(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg, idMappings, job } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createFlowService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createFlowService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source flow
    const sourceFlow = await sourceService.getFlow(asset.sourceId);

    // Map connection IDs
    const sourceConnectionIds = sourceFlow.sourceConnectionIds?.map(id => {
      return idMappings.get(id) || id;
    }) || [];

    const targetConnectionIds = sourceFlow.targetConnectionIds?.map(id => {
      return idMappings.get(id) || id;
    }) || [];

    // Warn if connections weren't mapped
    if (sourceFlow.sourceConnectionIds?.length && sourceConnectionIds.some((id, i) => id === sourceFlow.sourceConnectionIds![i])) {
      job.addLog('warn', `Some source connections for flow "${asset.name}" may not be mapped`, asset.id, asset.type);
    }

    // Create flow in target
    const newFlow = await targetService.createFlow({
      name: sourceFlow.name || `Flow-${Date.now()}`,
      description: sourceFlow.description,
      flowSpec: sourceFlow.flowSpec,
      sourceConnectionIds,
      targetConnectionIds,
      transformations: sourceFlow.transformations,
      scheduleParams: sourceFlow.scheduleParams,
    });

    return newFlow.id;
  }

  private async copyDataUsageLabel(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createPolicyService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createPolicyService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source label
    const sourceLabel = await sourceService.getLabel(asset.sourceId);

    // Check if it's a system label (can't be copied)
    if (!sourceLabel.custom) {
      logger.info(`Skipping system data usage label: ${sourceLabel.name}`);
      return sourceLabel.name;
    }

    // Check if exists in target
    try {
      await targetService.getLabel(sourceLabel.name);
      throw new Error(`Data usage label already exists: ${sourceLabel.name}`);
    } catch (e: any) {
      if (!e.message.includes('not found') && !e.message.includes('404')) {
        throw e;
      }
    }

    // Create label in target
    const newLabel = await targetService.createLabel({
      name: sourceLabel.name,
      friendlyName: sourceLabel.friendlyName,
      description: sourceLabel.description,
      category: sourceLabel.category,
    });

    return newLabel.name;
  }

  private async copyGovernancePolicy(
    context: MigrationContext,
    asset: IMigrationAsset
  ): Promise<string> {
    const { sourceOrg, targetOrg } = context;

    const sourceCreds = sourceOrg.getDecryptedCredentials();
    const targetCreds = targetOrg.getDecryptedCredentials();

    const sourceToken = await this.getAccessToken(sourceOrg);
    const targetToken = await this.getAccessToken(targetOrg);

    const sourceService = createPolicyService(
      sourceToken,
      sourceCreds.clientId,
      sourceCreds.orgId,
      sourceCreds.sandboxName
    );

    const targetService = createPolicyService(
      targetToken,
      targetCreds.clientId,
      targetCreds.orgId,
      targetCreds.sandboxName
    );

    // Get source policy
    const sourcePolicy = await sourceService.getPolicy(asset.sourceId);

    // Skip likely core/system policies based on naming patterns
    const corePolicyPrefixes = ['Adobe', 'Core', 'Default', 'System'];
    const isLikelyCorePolicy = corePolicyPrefixes.some(prefix =>
      sourcePolicy.name.startsWith(prefix)
    );
    if (isLikelyCorePolicy) {
      logger.info(`Skipping likely core governance policy: ${sourcePolicy.name}`);
      return sourcePolicy.id;
    }

    // Check if exists in target (by name)
    const existingPolicies = await targetService.listPolicies();
    const existing = existingPolicies.find(p => p.name === sourcePolicy.name);
    if (existing) {
      throw new Error(`Governance policy already exists: ${sourcePolicy.name}`);
    }

    // Create policy in target
    const newPolicy = await targetService.createPolicy({
      name: sourcePolicy.name,
      description: sourcePolicy.description,
      marketingActionRefs: sourcePolicy.marketingActionRefs,
      denyExpression: sourcePolicy.denyExpression,
    });

    return newPolicy.id;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async getAccessToken(org: InstanceType<typeof Organization>): Promise<string> {
    // Check if token is still valid
    if (org.isTokenValid()) {
      return org.getDecryptedToken()!;
    }

    // Get new token
    const credentials = org.getDecryptedCredentials();
    const authResponse = await adobeAuthService.getAccessToken(credentials);

    // Update org with new token
    org.setAccessToken(authResponse.accessToken, authResponse.expiresIn);
    await org.save();

    return authResponse.accessToken;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const migrationService = new MigrationService();
