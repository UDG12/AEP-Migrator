import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type {
  DataUsageLabel,
  MarketingAction,
  DataGovernancePolicy,
  PolicyDenyExpression,
  PolicyEvaluationResult,
  LabelCategory,
} from '@/types';

const logger = createLogger('PolicyService');

// ============================================================================
// Types
// ============================================================================

interface LabelListResponse {
  labels?: DataUsageLabel[];
  coreLabels?: DataUsageLabel[];
  customLabels?: DataUsageLabel[];
}

interface PolicyListResponse {
  policies?: DataGovernancePolicy[];
  children?: DataGovernancePolicy[];
}

interface MarketingActionListResponse {
  marketingActions?: MarketingAction[];
  children?: MarketingAction[];
}

interface CreateLabelPayload {
  name: string;
  friendlyName: string;
  description?: string;
  category?: LabelCategory;
}

interface CreateMarketingActionPayload {
  name: string;
  description?: string;
}

interface CreatePolicyPayload {
  name: string;
  description?: string;
  marketingActionRefs: string[];
  denyExpression: PolicyDenyExpression;
  status?: 'ENABLED' | 'DISABLED' | 'DRAFT';
}

// ============================================================================
// Policy Service
// ============================================================================

/**
 * Adobe Policy Service API Client (Data Governance)
 *
 * Handles data usage labels, marketing actions, and governance policies.
 * This is the core of Adobe's Data Usage Labeling and Enforcement (DULE) framework.
 *
 * Key concepts:
 * - Labels: Categorize data (identity, sensitive, contract, custom)
 * - Marketing Actions: Define how data will be used
 * - Policies: Rules that restrict data usage based on labels
 */
export class PolicyService extends AdobeBaseClient {
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
  // Data Usage Labels
  // ==========================================================================

  /**
   * List all data usage labels (core + custom)
   */
  async listLabels(): Promise<DataUsageLabel[]> {
    logger.info('Fetching all data usage labels');

    try {
      const response = await this.get<LabelListResponse | DataUsageLabel[]>(
        adobeEndpoints.policyService.labels
      );

      let labels: DataUsageLabel[];
      if (Array.isArray(response)) {
        labels = response;
      } else if (response.labels) {
        labels = response.labels;
      } else {
        // Combine core and custom labels if returned separately
        labels = [
          ...(response.coreLabels || []),
          ...(response.customLabels || []),
        ];
      }

      logger.info(`Found ${labels.length} data usage labels`);
      return labels;
    } catch (error: any) {
      logger.error('Failed to fetch labels', { error: error.message });
      throw error;
    }
  }

  /**
   * List core (Adobe) labels only
   */
  async listCoreLabels(): Promise<DataUsageLabel[]> {
    logger.info('Fetching core data usage labels');

    try {
      const response = await this.get<LabelListResponse | DataUsageLabel[]>(
        adobeEndpoints.policyService.coreLabels
      );

      let labels: DataUsageLabel[];
      if (Array.isArray(response)) {
        labels = response;
      } else if (response.labels) {
        labels = response.labels;
      } else if (response.coreLabels) {
        labels = response.coreLabels;
      } else {
        labels = [];
      }

      logger.info(`Found ${labels.length} core labels`);
      return labels;
    } catch (error: any) {
      // Fallback to filtering all labels
      const allLabels = await this.listLabels();
      return allLabels.filter((l) => !l.custom);
    }
  }

  /**
   * List custom labels only
   */
  async listCustomLabels(): Promise<DataUsageLabel[]> {
    logger.info('Fetching custom data usage labels');

    try {
      const response = await this.get<LabelListResponse | DataUsageLabel[]>(
        adobeEndpoints.policyService.customLabels
      );

      let labels: DataUsageLabel[];
      if (Array.isArray(response)) {
        labels = response;
      } else if (response.labels) {
        labels = response.labels;
      } else if (response.customLabels) {
        labels = response.customLabels;
      } else {
        labels = [];
      }

      logger.info(`Found ${labels.length} custom labels`);
      return labels;
    } catch (error: any) {
      // Fallback to filtering all labels
      const allLabels = await this.listLabels();
      return allLabels.filter((l) => l.custom);
    }
  }

  /**
   * Get a specific label by name
   */
  async getLabel(labelName: string): Promise<DataUsageLabel> {
    logger.debug('Fetching label', { labelName });

    const endpoint = adobeEndpoints.policyService.labelByName.replace(
      '{LABEL_NAME}',
      labelName
    );

    return this.get<DataUsageLabel>(endpoint);
  }

  /**
   * Create a custom label
   */
  async createLabel(payload: CreateLabelPayload): Promise<DataUsageLabel> {
    logger.info('Creating custom label', { name: payload.name });

    const response = await this.post<DataUsageLabel>(
      adobeEndpoints.policyService.customLabels,
      {
        ...payload,
        category: payload.category || 'CUSTOM',
      }
    );

    logger.info('Custom label created successfully', { name: response.name });
    return response;
  }

  /**
   * Update a custom label
   */
  async updateLabel(
    labelName: string,
    updates: Partial<CreateLabelPayload>
  ): Promise<DataUsageLabel> {
    logger.info('Updating label', { labelName });

    const endpoint = adobeEndpoints.policyService.labelByName.replace(
      '{LABEL_NAME}',
      labelName
    );

    const response = await this.put<DataUsageLabel>(endpoint, updates);

    logger.info('Label updated successfully', { name: labelName });
    return response;
  }

  /**
   * Delete a custom label
   */
  async deleteLabel(labelName: string): Promise<void> {
    logger.info('Deleting label', { labelName });

    const endpoint = adobeEndpoints.policyService.labelByName.replace(
      '{LABEL_NAME}',
      labelName
    );

    await this.delete(endpoint);

    logger.info('Label deleted successfully', { name: labelName });
  }

  /**
   * Find label by name
   */
  async findLabelByName(name: string): Promise<DataUsageLabel | null> {
    const labels = await this.listLabels();
    return labels.find((l) => l.name === name) || null;
  }

  // ==========================================================================
  // Marketing Actions
  // ==========================================================================

  /**
   * List all marketing actions (core + custom)
   */
  async listMarketingActions(): Promise<MarketingAction[]> {
    logger.info('Fetching all marketing actions');

    try {
      const response = await this.get<MarketingActionListResponse | MarketingAction[]>(
        adobeEndpoints.policyService.marketingActions
      );

      let actions: MarketingAction[];
      if (Array.isArray(response)) {
        actions = response;
      } else if (response.marketingActions) {
        actions = response.marketingActions;
      } else if (response.children) {
        actions = response.children;
      } else {
        actions = [];
      }

      logger.info(`Found ${actions.length} marketing actions`);
      return actions;
    } catch (error: any) {
      logger.error('Failed to fetch marketing actions', { error: error.message });
      throw error;
    }
  }

  /**
   * List core (Adobe) marketing actions only
   */
  async listCoreMarketingActions(): Promise<MarketingAction[]> {
    logger.info('Fetching core marketing actions');

    try {
      const response = await this.get<MarketingActionListResponse | MarketingAction[]>(
        adobeEndpoints.policyService.coreMarketingActions
      );

      let actions: MarketingAction[];
      if (Array.isArray(response)) {
        actions = response;
      } else if (response.marketingActions) {
        actions = response.marketingActions;
      } else if (response.children) {
        actions = response.children;
      } else {
        actions = [];
      }

      return actions;
    } catch (error: any) {
      // Fallback to filtering all actions
      const allActions = await this.listMarketingActions();
      return allActions.filter((a) => !a.custom);
    }
  }

  /**
   * List custom marketing actions only
   */
  async listCustomMarketingActions(): Promise<MarketingAction[]> {
    logger.info('Fetching custom marketing actions');

    try {
      const response = await this.get<MarketingActionListResponse | MarketingAction[]>(
        adobeEndpoints.policyService.customMarketingActions
      );

      let actions: MarketingAction[];
      if (Array.isArray(response)) {
        actions = response;
      } else if (response.marketingActions) {
        actions = response.marketingActions;
      } else if (response.children) {
        actions = response.children;
      } else {
        actions = [];
      }

      return actions;
    } catch (error: any) {
      // Fallback to filtering all actions
      const allActions = await this.listMarketingActions();
      return allActions.filter((a) => a.custom);
    }
  }

  /**
   * Create a custom marketing action
   */
  async createMarketingAction(
    payload: CreateMarketingActionPayload
  ): Promise<MarketingAction> {
    logger.info('Creating marketing action', { name: payload.name });

    const endpoint = adobeEndpoints.policyService.marketingActionByName.replace(
      '{ACTION_NAME}',
      payload.name
    );

    const response = await this.put<MarketingAction>(endpoint, payload);

    logger.info('Marketing action created successfully', { name: response.name });
    return response;
  }

  /**
   * Delete a custom marketing action
   */
  async deleteMarketingAction(actionName: string): Promise<void> {
    logger.info('Deleting marketing action', { actionName });

    const endpoint = adobeEndpoints.policyService.marketingActionByName.replace(
      '{ACTION_NAME}',
      actionName
    );

    await this.delete(endpoint);

    logger.info('Marketing action deleted successfully', { name: actionName });
  }

  /**
   * Find marketing action by name
   */
  async findMarketingActionByName(name: string): Promise<MarketingAction | null> {
    const actions = await this.listMarketingActions();
    return actions.find((a) => a.name === name) || null;
  }

  // ==========================================================================
  // Data Governance Policies
  // ==========================================================================

  /**
   * List all data governance policies
   */
  async listPolicies(): Promise<DataGovernancePolicy[]> {
    logger.info('Fetching all data governance policies');

    try {
      const response = await this.get<PolicyListResponse | DataGovernancePolicy[]>(
        adobeEndpoints.policyService.policies
      );

      let policies: DataGovernancePolicy[];
      if (Array.isArray(response)) {
        policies = response;
      } else if (response.policies) {
        policies = response.policies;
      } else if (response.children) {
        policies = response.children;
      } else {
        policies = [];
      }

      logger.info(`Found ${policies.length} data governance policies`);
      return policies;
    } catch (error: any) {
      logger.error('Failed to fetch policies', { error: error.message });
      throw error;
    }
  }

  /**
   * List core (Adobe) policies only
   */
  async listCorePolicies(): Promise<DataGovernancePolicy[]> {
    logger.info('Fetching core policies');

    try {
      const response = await this.get<PolicyListResponse | DataGovernancePolicy[]>(
        adobeEndpoints.policyService.corePolicies
      );

      let policies: DataGovernancePolicy[];
      if (Array.isArray(response)) {
        policies = response;
      } else if (response.policies) {
        policies = response.policies;
      } else if (response.children) {
        policies = response.children;
      } else {
        policies = [];
      }

      return policies;
    } catch (error: any) {
      logger.warn('Failed to fetch core policies separately', { error: error.message });
      return [];
    }
  }

  /**
   * List custom policies only
   */
  async listCustomPolicies(): Promise<DataGovernancePolicy[]> {
    logger.info('Fetching custom policies');

    try {
      const response = await this.get<PolicyListResponse | DataGovernancePolicy[]>(
        adobeEndpoints.policyService.customPolicies
      );

      let policies: DataGovernancePolicy[];
      if (Array.isArray(response)) {
        policies = response;
      } else if (response.policies) {
        policies = response.policies;
      } else if (response.children) {
        policies = response.children;
      } else {
        policies = [];
      }

      return policies;
    } catch (error: any) {
      logger.warn('Failed to fetch custom policies separately', { error: error.message });
      return [];
    }
  }

  /**
   * Get a specific policy by ID
   */
  async getPolicy(policyId: string): Promise<DataGovernancePolicy> {
    logger.debug('Fetching policy', { policyId });

    const endpoint = adobeEndpoints.policyService.policyById.replace(
      '{POLICY_ID}',
      policyId
    );

    return this.get<DataGovernancePolicy>(endpoint);
  }

  /**
   * Create a custom policy
   */
  async createPolicy(payload: CreatePolicyPayload): Promise<DataGovernancePolicy> {
    logger.info('Creating policy', { name: payload.name });

    const response = await this.post<DataGovernancePolicy>(
      adobeEndpoints.policyService.customPolicies,
      {
        ...payload,
        status: payload.status || 'ENABLED',
      }
    );

    logger.info('Policy created successfully', { id: response.id });
    return response;
  }

  /**
   * Update a policy
   */
  async updatePolicy(
    policyId: string,
    updates: Partial<CreatePolicyPayload>
  ): Promise<DataGovernancePolicy> {
    logger.info('Updating policy', { policyId });

    const endpoint = adobeEndpoints.policyService.policyById.replace(
      '{POLICY_ID}',
      policyId
    );

    const response = await this.put<DataGovernancePolicy>(endpoint, updates);

    logger.info('Policy updated successfully', { id: policyId });
    return response;
  }

  /**
   * Delete a policy
   */
  async deletePolicy(policyId: string): Promise<void> {
    logger.info('Deleting policy', { policyId });

    const endpoint = adobeEndpoints.policyService.policyById.replace(
      '{POLICY_ID}',
      policyId
    );

    await this.delete(endpoint);

    logger.info('Policy deleted successfully', { id: policyId });
  }

  /**
   * Enable a policy
   */
  async enablePolicy(policyId: string): Promise<DataGovernancePolicy> {
    return this.updatePolicy(policyId, { status: 'ENABLED' });
  }

  /**
   * Disable a policy
   */
  async disablePolicy(policyId: string): Promise<DataGovernancePolicy> {
    return this.updatePolicy(policyId, { status: 'DISABLED' });
  }

  /**
   * Find policy by name
   */
  async findPolicyByName(name: string): Promise<DataGovernancePolicy | null> {
    const policies = await this.listPolicies();
    return policies.find((p) => p.name === name) || null;
  }

  // ==========================================================================
  // Policy Evaluation
  // ==========================================================================

  /**
   * Evaluate a marketing action against data labels
   * Returns any policies that would be violated
   */
  async evaluatePolicy(
    marketingActionName: string,
    labels: string[]
  ): Promise<PolicyEvaluationResult> {
    logger.info('Evaluating policy', { marketingAction: marketingActionName, labels });

    const endpoint = adobeEndpoints.policyService.evaluation.replace(
      '{ACTION_NAME}',
      marketingActionName
    );

    const response = await this.get<PolicyEvaluationResult>(endpoint, {
      duleLabels: labels.join(','),
    });

    logger.info('Policy evaluation complete', {
      violatedPolicies: response.violatedPolicies?.length || 0,
    });

    return response;
  }

  /**
   * Bulk evaluate multiple marketing actions
   */
  async bulkEvaluate(
    evaluations: Array<{
      marketingActionRef: string;
      duleLabels: string[];
    }>
  ): Promise<PolicyEvaluationResult[]> {
    logger.info('Bulk evaluating policies', { count: evaluations.length });

    const response = await this.post<{ evaluations: PolicyEvaluationResult[] }>(
      adobeEndpoints.policyService.bulkEvaluation,
      { evaluations }
    );

    return response.evaluations || [];
  }

  // ==========================================================================
  // Migration Helpers
  // ==========================================================================

  /**
   * Copy a custom label to target organization
   */
  async copyLabel(
    sourceLabel: DataUsageLabel,
    conflictStrategy: 'skip' | 'overwrite' | 'rename' = 'skip'
  ): Promise<{
    label: DataUsageLabel | null;
    action: 'created' | 'skipped' | 'updated' | 'renamed';
  }> {
    logger.info('Copying label', { name: sourceLabel.name });

    // Check if label already exists
    const existingLabel = await this.findLabelByName(sourceLabel.name);

    if (existingLabel) {
      if (conflictStrategy === 'skip') {
        logger.info('Label already exists, skipping', { name: sourceLabel.name });
        return { label: existingLabel, action: 'skipped' };
      } else if (conflictStrategy === 'overwrite') {
        const updatedLabel = await this.updateLabel(sourceLabel.name, {
          friendlyName: sourceLabel.friendlyName,
          description: sourceLabel.description,
        });
        return { label: updatedLabel, action: 'updated' };
      } else if (conflictStrategy === 'rename') {
        const newLabel = await this.createLabel({
          name: `${sourceLabel.name}_migrated`,
          friendlyName: `${sourceLabel.friendlyName} (Migrated)`,
          description: sourceLabel.description,
          category: sourceLabel.category,
        });
        return { label: newLabel, action: 'renamed' };
      }
    }

    // Create new label
    const newLabel = await this.createLabel({
      name: sourceLabel.name,
      friendlyName: sourceLabel.friendlyName,
      description: sourceLabel.description,
      category: sourceLabel.category,
    });

    return { label: newLabel, action: 'created' };
  }

  /**
   * Copy a custom marketing action to target organization
   */
  async copyMarketingAction(
    sourceAction: MarketingAction,
    conflictStrategy: 'skip' | 'overwrite' | 'rename' = 'skip'
  ): Promise<{
    action: MarketingAction | null;
    result: 'created' | 'skipped' | 'updated' | 'renamed';
  }> {
    logger.info('Copying marketing action', { name: sourceAction.name });

    // Check if action already exists
    const existingAction = await this.findMarketingActionByName(sourceAction.name);

    if (existingAction) {
      if (conflictStrategy === 'skip') {
        logger.info('Marketing action already exists, skipping', {
          name: sourceAction.name,
        });
        return { action: existingAction, result: 'skipped' };
      } else if (conflictStrategy === 'overwrite' || conflictStrategy === 'rename') {
        // For marketing actions, create/update uses PUT with name in URL
        const newName =
          conflictStrategy === 'rename'
            ? `${sourceAction.name}_migrated`
            : sourceAction.name;

        const newAction = await this.createMarketingAction({
          name: newName,
          description: sourceAction.description,
        });
        return {
          action: newAction,
          result: conflictStrategy === 'rename' ? 'renamed' : 'updated',
        };
      }
    }

    // Create new action
    const newAction = await this.createMarketingAction({
      name: sourceAction.name,
      description: sourceAction.description,
    });

    return { action: newAction, result: 'created' };
  }

  /**
   * Copy a custom policy to target organization
   */
  async copyPolicy(
    sourcePolicy: DataGovernancePolicy,
    conflictStrategy: 'skip' | 'overwrite' | 'rename' = 'skip'
  ): Promise<{
    policy: DataGovernancePolicy | null;
    action: 'created' | 'skipped' | 'updated' | 'renamed';
  }> {
    logger.info('Copying policy', { name: sourcePolicy.name });

    // Check if policy already exists
    const existingPolicy = await this.findPolicyByName(sourcePolicy.name);

    if (existingPolicy) {
      if (conflictStrategy === 'skip') {
        logger.info('Policy already exists, skipping', { name: sourcePolicy.name });
        return { policy: existingPolicy, action: 'skipped' };
      } else if (conflictStrategy === 'overwrite') {
        const updatedPolicy = await this.updatePolicy(existingPolicy.id, {
          name: sourcePolicy.name,
          description: sourcePolicy.description,
          marketingActionRefs: sourcePolicy.marketingActionRefs,
          denyExpression: sourcePolicy.denyExpression,
          status: sourcePolicy.status,
        });
        return { policy: updatedPolicy, action: 'updated' };
      } else if (conflictStrategy === 'rename') {
        const newPolicy = await this.createPolicy({
          name: `${sourcePolicy.name} (Migrated)`,
          description: sourcePolicy.description,
          marketingActionRefs: sourcePolicy.marketingActionRefs,
          denyExpression: sourcePolicy.denyExpression,
          status: sourcePolicy.status,
        });
        return { policy: newPolicy, action: 'renamed' };
      }
    }

    // Create new policy
    const newPolicy = await this.createPolicy({
      name: sourcePolicy.name,
      description: sourcePolicy.description,
      marketingActionRefs: sourcePolicy.marketingActionRefs,
      denyExpression: sourcePolicy.denyExpression,
      status: sourcePolicy.status,
    });

    return { policy: newPolicy, action: 'created' };
  }

  /**
   * Get all custom governance assets for migration
   */
  async discoverCustomGovernanceAssets(): Promise<{
    labels: DataUsageLabel[];
    marketingActions: MarketingAction[];
    policies: DataGovernancePolicy[];
  }> {
    logger.info('Discovering custom governance assets');

    const [labels, marketingActions, policies] = await Promise.all([
      this.listCustomLabels(),
      this.listCustomMarketingActions(),
      this.listCustomPolicies(),
    ]);

    logger.info('Governance asset discovery complete', {
      labels: labels.length,
      marketingActions: marketingActions.length,
      policies: policies.length,
    });

    return { labels, marketingActions, policies };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createPolicyService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName: string
): PolicyService {
  return new PolicyService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
