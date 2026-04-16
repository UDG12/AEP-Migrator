import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type {
  FlowConnection,
  ConnectionSpec,
  FlowSpec,
  DataFlow,
  SourceConnection,
  TargetConnection,
  FlowRun,
  AdobeApiResponse,
} from '@/types';

const logger = createLogger('FlowService');

// ============================================================================
// Types
// ============================================================================

interface FlowServiceResponse<T> {
  items?: T[];
  _page?: {
    count: number;
    total?: number;
  };
  _links?: {
    next?: { href: string };
  };
}

interface CreateConnectionPayload {
  name: string;
  description?: string;
  connectionSpec: {
    id: string;
    version: string;
  };
  auth?: {
    specName: string;
    params: Record<string, unknown>;
  };
  params?: Record<string, unknown>;
}

interface CreateFlowPayload {
  name: string;
  description?: string;
  flowSpec: {
    id: string;
    version: string;
  };
  sourceConnectionIds: string[];
  targetConnectionIds: string[];
  transformations?: Array<{
    name: string;
    params: Record<string, unknown>;
  }>;
  scheduleParams?: {
    startTime: number;
    frequency: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'once';
    interval: number;
    backfill?: boolean;
  };
}

interface CreateSourceConnectionPayload {
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
}

interface CreateTargetConnectionPayload {
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
}

// ============================================================================
// Flow Service
// ============================================================================

/**
 * Adobe Flow Service API Client
 *
 * Handles source connections, target connections, and data flows.
 * Flow Service is the backbone for data ingestion and activation in AEP.
 *
 * Key concepts:
 * - Connection Spec: Catalog of available connectors (read-only)
 * - Base Connection: Authentication and configuration for a source/destination
 * - Source Connection: Specifies where data comes from
 * - Target Connection: Specifies where data goes to
 * - Data Flow: Orchestrates the movement of data from source to target
 */
export class FlowService extends AdobeBaseClient {
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
  // Connection Specs (Catalog - Read Only)
  // ==========================================================================

  /**
   * List all available connection specifications
   * This is a catalog of available connectors
   */
  async listConnectionSpecs(): Promise<ConnectionSpec[]> {
    logger.info('Fetching connection specifications');

    const response = await this.get<FlowServiceResponse<ConnectionSpec>>(
      adobeEndpoints.flowService.connectionSpecs
    );

    const specs = response.items || [];
    logger.info(`Found ${specs.length} connection specifications`);
    return specs;
  }

  /**
   * Get a single connection spec by ID
   */
  async getConnectionSpec(specId: string): Promise<ConnectionSpec> {
    const endpoint = adobeEndpoints.flowService.connectionSpecById.replace(
      '{SPEC_ID}',
      specId
    );
    return this.get<ConnectionSpec>(endpoint);
  }

  /**
   * Find connection spec by name
   */
  async findConnectionSpecByName(name: string): Promise<ConnectionSpec | null> {
    const specs = await this.listConnectionSpecs();
    return specs.find((s) => s.name === name) || null;
  }

  /**
   * List source connection specs only
   */
  async listSourceConnectionSpecs(): Promise<ConnectionSpec[]> {
    const specs = await this.listConnectionSpecs();
    return specs.filter((s) => s.attributes?.isSource === true);
  }

  /**
   * List destination connection specs only
   */
  async listDestinationConnectionSpecs(): Promise<ConnectionSpec[]> {
    const specs = await this.listConnectionSpecs();
    return specs.filter((s) => s.attributes?.isDestination === true);
  }

  // ==========================================================================
  // Flow Specs (Catalog - Read Only)
  // ==========================================================================

  /**
   * List all available flow specifications
   */
  async listFlowSpecs(): Promise<FlowSpec[]> {
    logger.info('Fetching flow specifications');

    const response = await this.get<FlowServiceResponse<FlowSpec>>(
      adobeEndpoints.flowService.flowSpecs
    );

    const specs = response.items || [];
    logger.info(`Found ${specs.length} flow specifications`);
    return specs;
  }

  /**
   * Get a single flow spec by ID
   */
  async getFlowSpec(specId: string): Promise<FlowSpec> {
    const endpoint = adobeEndpoints.flowService.flowSpecById.replace(
      '{SPEC_ID}',
      specId
    );
    return this.get<FlowSpec>(endpoint);
  }

  // ==========================================================================
  // Base Connections
  // ==========================================================================

  /**
   * List all base connections
   */
  async listConnections(filters?: {
    connectionSpecId?: string;
    state?: 'enabled' | 'disabled' | 'draft';
  }): Promise<FlowConnection[]> {
    logger.info('Fetching base connections');

    const params: Record<string, string> = {};
    if (filters?.connectionSpecId) {
      params['connectionSpec.id'] = filters.connectionSpecId;
    }
    if (filters?.state) {
      params.state = filters.state;
    }

    const response = await this.get<FlowServiceResponse<FlowConnection>>(
      adobeEndpoints.flowService.connections,
      params
    );

    const connections = response.items || [];
    logger.info(`Found ${connections.length} base connections`);
    return connections;
  }

  /**
   * Get a single base connection by ID
   */
  async getConnection(connectionId: string): Promise<FlowConnection> {
    const endpoint = adobeEndpoints.flowService.connectionById.replace(
      '{CONNECTION_ID}',
      connectionId
    );
    return this.get<FlowConnection>(endpoint);
  }

  /**
   * Create a new base connection
   */
  async createConnection(payload: CreateConnectionPayload): Promise<FlowConnection> {
    logger.info('Creating base connection', { name: payload.name });

    const response = await this.post<FlowConnection>(
      adobeEndpoints.flowService.connections,
      payload
    );

    logger.info('Base connection created successfully', { id: response.id });
    return response;
  }

  /**
   * Update a base connection
   */
  async updateConnection(
    connectionId: string,
    updates: Partial<CreateConnectionPayload>
  ): Promise<FlowConnection> {
    logger.info('Updating base connection', { connectionId });

    const endpoint = adobeEndpoints.flowService.connectionById.replace(
      '{CONNECTION_ID}',
      connectionId
    );

    const response = await this.patch<FlowConnection>(endpoint, updates);

    logger.info('Base connection updated successfully', { id: connectionId });
    return response;
  }

  /**
   * Delete a base connection
   */
  async deleteConnection(connectionId: string): Promise<void> {
    logger.info('Deleting base connection', { connectionId });

    const endpoint = adobeEndpoints.flowService.connectionById.replace(
      '{CONNECTION_ID}',
      connectionId
    );

    await this.delete(endpoint);

    logger.info('Base connection deleted successfully', { id: connectionId });
  }

  /**
   * Find connection by name
   */
  async findConnectionByName(name: string): Promise<FlowConnection | null> {
    const connections = await this.listConnections();
    return connections.find((c) => c.name === name) || null;
  }

  // ==========================================================================
  // Source Connections
  // ==========================================================================

  /**
   * List all source connections
   */
  async listSourceConnections(): Promise<SourceConnection[]> {
    logger.info('Fetching source connections');

    const response = await this.get<FlowServiceResponse<SourceConnection>>(
      adobeEndpoints.flowService.sourceConnections
    );

    const connections = response.items || [];
    logger.info(`Found ${connections.length} source connections`);
    return connections;
  }

  /**
   * Get a single source connection by ID
   */
  async getSourceConnection(connectionId: string): Promise<SourceConnection> {
    const endpoint = adobeEndpoints.flowService.sourceConnectionById.replace(
      '{CONNECTION_ID}',
      connectionId
    );
    return this.get<SourceConnection>(endpoint);
  }

  /**
   * Create a source connection
   */
  async createSourceConnection(
    payload: CreateSourceConnectionPayload
  ): Promise<SourceConnection> {
    logger.info('Creating source connection', { name: payload.name });

    const response = await this.post<SourceConnection>(
      adobeEndpoints.flowService.sourceConnections,
      payload
    );

    logger.info('Source connection created successfully', { id: response.id });
    return response;
  }

  /**
   * Delete a source connection
   */
  async deleteSourceConnection(connectionId: string): Promise<void> {
    logger.info('Deleting source connection', { connectionId });

    const endpoint = adobeEndpoints.flowService.sourceConnectionById.replace(
      '{CONNECTION_ID}',
      connectionId
    );

    await this.delete(endpoint);

    logger.info('Source connection deleted successfully', { id: connectionId });
  }

  // ==========================================================================
  // Target Connections
  // ==========================================================================

  /**
   * List all target connections
   */
  async listTargetConnections(): Promise<TargetConnection[]> {
    logger.info('Fetching target connections');

    const response = await this.get<FlowServiceResponse<TargetConnection>>(
      adobeEndpoints.flowService.targetConnections
    );

    const connections = response.items || [];
    logger.info(`Found ${connections.length} target connections`);
    return connections;
  }

  /**
   * Get a single target connection by ID
   */
  async getTargetConnection(connectionId: string): Promise<TargetConnection> {
    const endpoint = adobeEndpoints.flowService.targetConnectionById.replace(
      '{CONNECTION_ID}',
      connectionId
    );
    return this.get<TargetConnection>(endpoint);
  }

  /**
   * Create a target connection
   */
  async createTargetConnection(
    payload: CreateTargetConnectionPayload
  ): Promise<TargetConnection> {
    logger.info('Creating target connection', { name: payload.name });

    const response = await this.post<TargetConnection>(
      adobeEndpoints.flowService.targetConnections,
      payload
    );

    logger.info('Target connection created successfully', { id: response.id });
    return response;
  }

  /**
   * Delete a target connection
   */
  async deleteTargetConnection(connectionId: string): Promise<void> {
    logger.info('Deleting target connection', { connectionId });

    const endpoint = adobeEndpoints.flowService.targetConnectionById.replace(
      '{CONNECTION_ID}',
      connectionId
    );

    await this.delete(endpoint);

    logger.info('Target connection deleted successfully', { id: connectionId });
  }

  // ==========================================================================
  // Data Flows
  // ==========================================================================

  /**
   * List all data flows
   */
  async listFlows(filters?: {
    flowSpecId?: string;
    state?: 'enabled' | 'disabled' | 'draft';
  }): Promise<DataFlow[]> {
    logger.info('Fetching data flows');

    const params: Record<string, string> = {};
    if (filters?.flowSpecId) {
      params['flowSpec.id'] = filters.flowSpecId;
    }
    if (filters?.state) {
      params.state = filters.state;
    }

    const response = await this.get<FlowServiceResponse<DataFlow>>(
      adobeEndpoints.flowService.flows,
      params
    );

    const flows = response.items || [];
    logger.info(`Found ${flows.length} data flows`);
    return flows;
  }

  /**
   * Get a single data flow by ID
   */
  async getFlow(flowId: string): Promise<DataFlow> {
    const endpoint = adobeEndpoints.flowService.flowById.replace('{FLOW_ID}', flowId);
    return this.get<DataFlow>(endpoint);
  }

  /**
   * Create a data flow
   */
  async createFlow(payload: CreateFlowPayload): Promise<DataFlow> {
    logger.info('Creating data flow', { name: payload.name });

    const response = await this.post<DataFlow>(
      adobeEndpoints.flowService.flows,
      payload
    );

    logger.info('Data flow created successfully', { id: response.id });
    return response;
  }

  /**
   * Update a data flow
   */
  async updateFlow(flowId: string, updates: Partial<CreateFlowPayload>): Promise<DataFlow> {
    logger.info('Updating data flow', { flowId });

    const endpoint = adobeEndpoints.flowService.flowById.replace('{FLOW_ID}', flowId);

    const response = await this.patch<DataFlow>(endpoint, updates);

    logger.info('Data flow updated successfully', { id: flowId });
    return response;
  }

  /**
   * Delete a data flow
   */
  async deleteFlow(flowId: string): Promise<void> {
    logger.info('Deleting data flow', { flowId });

    const endpoint = adobeEndpoints.flowService.flowById.replace('{FLOW_ID}', flowId);

    await this.delete(endpoint);

    logger.info('Data flow deleted successfully', { id: flowId });
  }

  /**
   * Find data flow by name
   */
  async findFlowByName(name: string): Promise<DataFlow | null> {
    const flows = await this.listFlows();
    return flows.find((f) => f.name === name) || null;
  }

  /**
   * Enable a data flow
   */
  async enableFlow(flowId: string): Promise<DataFlow> {
    return this.updateFlow(flowId, { state: 'enabled' } as any);
  }

  /**
   * Disable a data flow
   */
  async disableFlow(flowId: string): Promise<DataFlow> {
    return this.updateFlow(flowId, { state: 'disabled' } as any);
  }

  // ==========================================================================
  // Flow Runs
  // ==========================================================================

  /**
   * List runs for a specific flow
   */
  async listFlowRuns(flowId: string): Promise<FlowRun[]> {
    logger.info('Fetching flow runs', { flowId });

    const endpoint = adobeEndpoints.flowService.flowRuns.replace('{FLOW_ID}', flowId);
    const response = await this.get<FlowServiceResponse<FlowRun>>(endpoint);

    const runs = response.items || [];
    logger.info(`Found ${runs.length} flow runs`);
    return runs;
  }

  /**
   * Get a single flow run by ID
   */
  async getFlowRun(runId: string): Promise<FlowRun> {
    const endpoint = adobeEndpoints.flowService.runById.replace('{RUN_ID}', runId);
    return this.get<FlowRun>(endpoint);
  }

  // ==========================================================================
  // Migration Helpers
  // ==========================================================================

  /**
   * Get all flow-related assets for migration discovery
   */
  async discoverAllFlowAssets(): Promise<{
    connections: FlowConnection[];
    sourceConnections: SourceConnection[];
    targetConnections: TargetConnection[];
    flows: DataFlow[];
  }> {
    logger.info('Discovering all flow-related assets');

    const [connections, sourceConnections, targetConnections, flows] = await Promise.all([
      this.listConnections(),
      this.listSourceConnections(),
      this.listTargetConnections(),
      this.listFlows(),
    ]);

    logger.info('Flow asset discovery complete', {
      connections: connections.length,
      sourceConnections: sourceConnections.length,
      targetConnections: targetConnections.length,
      flows: flows.length,
    });

    return { connections, sourceConnections, targetConnections, flows };
  }

  /**
   * Copy a data flow to target organization
   * Note: This requires corresponding connections to exist in target
   */
  async copyFlow(
    sourceFlow: DataFlow,
    sourceToTargetConnectionMapping: Map<string, string>,
    conflictStrategy: 'skip' | 'overwrite' | 'rename' = 'skip'
  ): Promise<{ flow: DataFlow | null; action: 'created' | 'skipped' | 'updated' | 'renamed' }> {
    logger.info('Copying data flow', { name: sourceFlow.name });

    // Check if flow already exists
    const existingFlow = await this.findFlowByName(sourceFlow.name);

    if (existingFlow) {
      if (conflictStrategy === 'skip') {
        logger.info('Data flow already exists, skipping', { name: sourceFlow.name });
        return { flow: existingFlow, action: 'skipped' };
      } else if (conflictStrategy === 'rename') {
        // Create with modified name
        const newFlow = await this.createFlowFromSource(
          sourceFlow,
          sourceToTargetConnectionMapping,
          `${sourceFlow.name} (Migrated)`
        );
        return { flow: newFlow, action: 'renamed' };
      }
    }

    // Create new flow
    const newFlow = await this.createFlowFromSource(
      sourceFlow,
      sourceToTargetConnectionMapping
    );

    return { flow: newFlow, action: 'created' };
  }

  /**
   * Helper to create a flow from source with connection mapping
   */
  private async createFlowFromSource(
    sourceFlow: DataFlow,
    connectionMapping: Map<string, string>,
    name?: string
  ): Promise<DataFlow> {
    // Map source connection IDs to target
    const targetSourceConnectionIds = sourceFlow.sourceConnectionIds.map(
      (id) => connectionMapping.get(id) || id
    );

    // Map target connection IDs
    const targetTargetConnectionIds = sourceFlow.targetConnectionIds.map(
      (id) => connectionMapping.get(id) || id
    );

    const payload: CreateFlowPayload = {
      name: name || sourceFlow.name,
      description: sourceFlow.description,
      flowSpec: sourceFlow.flowSpec,
      sourceConnectionIds: targetSourceConnectionIds,
      targetConnectionIds: targetTargetConnectionIds,
      transformations: sourceFlow.transformations,
      scheduleParams: sourceFlow.scheduleParams,
    };

    return this.createFlow(payload);
  }

  /**
   * Get connection mapping between source and target organizations
   */
  async getConnectionMapping(
    sourceConnections: FlowConnection[]
  ): Promise<Map<string, string>> {
    const targetConnections = await this.listConnections();
    const mapping = new Map<string, string>();

    for (const sourceConn of sourceConnections) {
      const targetConn = targetConnections.find((c) => c.name === sourceConn.name);
      if (targetConn) {
        mapping.set(sourceConn.id, targetConn.id);
      }
    }

    logger.info(`Created connection mapping for ${mapping.size} connections`);
    return mapping;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createFlowService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName: string
): FlowService {
  return new FlowService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
