import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type {
  Sandbox,
  SandboxType,
  SandboxPackage,
  PackageArtifact,
  PackageArtifactType,
  PackageImportJob,
  PackageComparison,
} from '@/types';

const logger = createLogger('SandboxToolingService');

// ============================================================================
// Types
// ============================================================================

interface SandboxListResponse {
  sandboxes?: Sandbox[];
}

interface PackageListResponse {
  packages?: SandboxPackage[];
}

interface JobListResponse {
  jobs?: PackageImportJob[];
}

interface CreatePackagePayload {
  name: string;
  description?: string;
  packageType: 'FULL' | 'PARTIAL';
  artifacts?: Array<{
    id: string;
    type: PackageArtifactType;
  }>;
}

interface ImportPackagePayload {
  targetSandbox: {
    name: string;
  };
  importOptions?: {
    conflictResolution?: 'SKIP' | 'OVERWRITE' | 'RENAME';
  };
}

interface ComparePackagePayload {
  targetSandbox: {
    name: string;
  };
}

// ============================================================================
// Sandbox Tooling Service
// ============================================================================

/**
 * Adobe Sandbox & Sandbox Tooling API Client
 *
 * Handles sandbox management and package-based migration between sandboxes.
 * Sandbox Tooling provides native Adobe functionality for migrating configurations
 * between sandboxes within the same organization.
 *
 * Key concepts:
 * - Sandbox: Isolated environment for development/testing/production
 * - Package: Collection of artifacts to be migrated together
 * - Job: Import/Export operation on a package
 */
export class SandboxToolingService extends AdobeBaseClient {
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
  // Sandbox Management
  // ==========================================================================

  /**
   * List all sandboxes in the organization
   */
  async listSandboxes(): Promise<Sandbox[]> {
    logger.info('Fetching all sandboxes');

    try {
      const response = await this.get<SandboxListResponse | Sandbox[]>(
        adobeEndpoints.sandbox.sandboxes
      );

      let sandboxes: Sandbox[];
      if (Array.isArray(response)) {
        sandboxes = response;
      } else if (response.sandboxes) {
        sandboxes = response.sandboxes;
      } else {
        sandboxes = [];
      }

      logger.info(`Found ${sandboxes.length} sandboxes`);
      return sandboxes;
    } catch (error: any) {
      logger.error('Failed to fetch sandboxes', { error: error.message });
      throw error;
    }
  }

  /**
   * Get a specific sandbox by name
   */
  async getSandbox(sandboxName: string): Promise<Sandbox> {
    logger.debug('Fetching sandbox', { sandboxName });

    const endpoint = adobeEndpoints.sandbox.sandboxByName.replace(
      '{SANDBOX_NAME}',
      sandboxName
    );

    return this.get<Sandbox>(endpoint);
  }

  /**
   * Create a new sandbox
   */
  async createSandbox(params: {
    name: string;
    title: string;
    type: 'development' | 'production';
  }): Promise<Sandbox> {
    logger.info('Creating sandbox', { name: params.name, type: params.type });

    const response = await this.post<Sandbox>(adobeEndpoints.sandbox.sandboxes, params);

    logger.info('Sandbox created successfully', { name: response.name });
    return response;
  }

  /**
   * Delete a sandbox
   */
  async deleteSandbox(sandboxName: string): Promise<void> {
    logger.info('Deleting sandbox', { sandboxName });

    const endpoint = adobeEndpoints.sandbox.sandboxByName.replace(
      '{SANDBOX_NAME}',
      sandboxName
    );

    await this.delete(endpoint);

    logger.info('Sandbox deleted successfully', { name: sandboxName });
  }

  /**
   * Reset a sandbox (removes all data but keeps configuration)
   */
  async resetSandbox(sandboxName: string): Promise<void> {
    logger.info('Resetting sandbox', { sandboxName });

    const endpoint = adobeEndpoints.sandbox.sandboxByName.replace(
      '{SANDBOX_NAME}',
      sandboxName
    );

    await this.put(endpoint, { action: 'reset' });

    logger.info('Sandbox reset initiated', { name: sandboxName });
  }

  /**
   * List sandbox types
   */
  async listSandboxTypes(): Promise<SandboxType[]> {
    logger.info('Fetching sandbox types');

    const response = await this.get<{ sandboxTypes?: SandboxType[] }>(
      adobeEndpoints.sandbox.sandboxTypes
    );

    return response.sandboxTypes || [];
  }

  /**
   * Get active sandboxes only
   */
  async listActiveSandboxes(): Promise<Sandbox[]> {
    const sandboxes = await this.listSandboxes();
    return sandboxes.filter((s) => s.state === 'active');
  }

  /**
   * Get production sandboxes only
   */
  async listProductionSandboxes(): Promise<Sandbox[]> {
    const sandboxes = await this.listSandboxes();
    return sandboxes.filter((s) => s.type === 'production' && s.state === 'active');
  }

  /**
   * Get development sandboxes only
   */
  async listDevelopmentSandboxes(): Promise<Sandbox[]> {
    const sandboxes = await this.listSandboxes();
    return sandboxes.filter((s) => s.type === 'development' && s.state === 'active');
  }

  // ==========================================================================
  // Packages
  // ==========================================================================

  /**
   * List all packages
   */
  async listPackages(): Promise<SandboxPackage[]> {
    logger.info('Fetching all packages');

    try {
      const response = await this.get<PackageListResponse | SandboxPackage[]>(
        adobeEndpoints.sandboxTooling.packages
      );

      let packages: SandboxPackage[];
      if (Array.isArray(response)) {
        packages = response;
      } else if (response.packages) {
        packages = response.packages;
      } else {
        packages = [];
      }

      logger.info(`Found ${packages.length} packages`);
      return packages;
    } catch (error: any) {
      logger.error('Failed to fetch packages', { error: error.message });
      throw error;
    }
  }

  /**
   * Get a specific package by ID
   */
  async getPackage(packageId: string): Promise<SandboxPackage> {
    logger.debug('Fetching package', { packageId });

    const endpoint = adobeEndpoints.sandboxTooling.packageById.replace(
      '{PACKAGE_ID}',
      packageId
    );

    return this.get<SandboxPackage>(endpoint);
  }

  /**
   * Create a new package
   */
  async createPackage(params: CreatePackagePayload): Promise<SandboxPackage> {
    logger.info('Creating package', { name: params.name, type: params.packageType });

    const response = await this.post<SandboxPackage>(
      adobeEndpoints.sandboxTooling.packages,
      params
    );

    logger.info('Package created successfully', { id: response.id });
    return response;
  }

  /**
   * Update a package (add/remove artifacts)
   */
  async updatePackage(
    packageId: string,
    updates: Partial<CreatePackagePayload>
  ): Promise<SandboxPackage> {
    logger.info('Updating package', { packageId });

    const endpoint = adobeEndpoints.sandboxTooling.packageById.replace(
      '{PACKAGE_ID}',
      packageId
    );

    const response = await this.patch<SandboxPackage>(endpoint, updates);

    logger.info('Package updated successfully', { id: packageId });
    return response;
  }

  /**
   * Delete a package
   */
  async deletePackage(packageId: string): Promise<void> {
    logger.info('Deleting package', { packageId });

    const endpoint = adobeEndpoints.sandboxTooling.packageById.replace(
      '{PACKAGE_ID}',
      packageId
    );

    await this.delete(endpoint);

    logger.info('Package deleted successfully', { id: packageId });
  }

  /**
   * Publish a package (makes it available for import)
   */
  async publishPackage(packageId: string): Promise<SandboxPackage> {
    logger.info('Publishing package', { packageId });

    const endpoint = adobeEndpoints.sandboxTooling.packagePublish.replace(
      '{PACKAGE_ID}',
      packageId
    );

    const response = await this.post<SandboxPackage>(endpoint, {});

    logger.info('Package published successfully', { id: packageId });
    return response;
  }

  /**
   * Find package by name
   */
  async findPackageByName(name: string): Promise<SandboxPackage | null> {
    const packages = await this.listPackages();
    return packages.find((p) => p.name === name) || null;
  }

  /**
   * List published packages only
   */
  async listPublishedPackages(): Promise<SandboxPackage[]> {
    const packages = await this.listPackages();
    return packages.filter((p) => p.status === 'PUBLISHED');
  }

  // ==========================================================================
  // Package Import/Export
  // ==========================================================================

  /**
   * Export a package as binary data
   */
  async exportPackage(packageId: string): Promise<Buffer> {
    logger.info('Exporting package', { packageId });

    const endpoint = adobeEndpoints.sandboxTooling.packageExport.replace(
      '{PACKAGE_ID}',
      packageId
    );

    const data = await this.getRaw(endpoint);

    logger.info('Package exported successfully', { packageId });
    return data;
  }

  /**
   * Import a package to a target sandbox
   */
  async importPackage(
    packageId: string,
    targetSandboxName: string,
    options?: {
      conflictResolution?: 'SKIP' | 'OVERWRITE' | 'RENAME';
    }
  ): Promise<PackageImportJob> {
    logger.info('Importing package', { packageId, targetSandbox: targetSandboxName });

    const endpoint = adobeEndpoints.sandboxTooling.packageImport.replace(
      '{PACKAGE_ID}',
      packageId
    );

    const payload: ImportPackagePayload = {
      targetSandbox: {
        name: targetSandboxName,
      },
    };

    if (options?.conflictResolution) {
      payload.importOptions = {
        conflictResolution: options.conflictResolution,
      };
    }

    const response = await this.post<PackageImportJob>(endpoint, payload);

    logger.info('Package import initiated', { jobId: response.id });
    return response;
  }

  /**
   * Compare a package with target sandbox to preview import
   */
  async comparePackage(
    packageId: string,
    targetSandboxName: string
  ): Promise<PackageComparison> {
    logger.info('Comparing package with target sandbox', {
      packageId,
      targetSandbox: targetSandboxName,
    });

    const endpoint = adobeEndpoints.sandboxTooling.packageCompare.replace(
      '{PACKAGE_ID}',
      packageId
    );

    const payload: ComparePackagePayload = {
      targetSandbox: {
        name: targetSandboxName,
      },
    };

    const response = await this.post<PackageComparison>(endpoint, payload);

    logger.info('Package comparison complete', {
      totalArtifacts: response.totalArtifacts,
      newArtifacts: response.newArtifacts,
      existingArtifacts: response.existingArtifacts,
    });

    return response;
  }

  // ==========================================================================
  // Jobs
  // ==========================================================================

  /**
   * List all import/export jobs
   */
  async listJobs(packageId?: string): Promise<PackageImportJob[]> {
    logger.info('Fetching jobs', { packageId });

    const params = packageId ? { packageId } : undefined;

    const response = await this.get<JobListResponse | PackageImportJob[]>(
      adobeEndpoints.sandboxTooling.jobs,
      params
    );

    let jobs: PackageImportJob[];
    if (Array.isArray(response)) {
      jobs = response;
    } else if (response.jobs) {
      jobs = response.jobs;
    } else {
      jobs = [];
    }

    logger.info(`Found ${jobs.length} jobs`);
    return jobs;
  }

  /**
   * Get a specific job by ID
   */
  async getJob(jobId: string): Promise<PackageImportJob> {
    logger.debug('Fetching job', { jobId });

    const endpoint = adobeEndpoints.sandboxTooling.jobById.replace('{JOB_ID}', jobId);

    return this.get<PackageImportJob>(endpoint);
  }

  /**
   * Wait for a job to complete
   */
  async waitForJobCompletion(
    jobId: string,
    options?: {
      pollIntervalMs?: number;
      timeoutMs?: number;
    }
  ): Promise<PackageImportJob> {
    const pollInterval = options?.pollIntervalMs || 5000;
    const timeout = options?.timeoutMs || 600000; // 10 minutes default
    const startTime = Date.now();

    logger.info('Waiting for job completion', { jobId, timeout });

    while (true) {
      const job = await this.getJob(jobId);

      if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
        logger.info('Job completed', { jobId, status: job.status });
        return job;
      }

      if (Date.now() - startTime > timeout) {
        throw new Error(`Job ${jobId} timed out after ${timeout}ms`);
      }

      logger.debug('Job still processing, waiting...', { jobId, status: job.status });
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // ==========================================================================
  // Migration Helpers
  // ==========================================================================

  /**
   * Create a migration package from selected assets
   */
  async createMigrationPackage(params: {
    name: string;
    description?: string;
    artifacts: Array<{
      id: string;
      type: PackageArtifactType;
    }>;
  }): Promise<SandboxPackage> {
    logger.info('Creating migration package', {
      name: params.name,
      artifactCount: params.artifacts.length,
    });

    // Create the package
    const pkg = await this.createPackage({
      name: params.name,
      description: params.description,
      packageType: 'PARTIAL',
      artifacts: params.artifacts,
    });

    // Publish the package
    const publishedPkg = await this.publishPackage(pkg.id);

    return publishedPkg;
  }

  /**
   * Perform a complete migration using Sandbox Tooling
   */
  async migrateToSandbox(params: {
    packageId: string;
    targetSandboxName: string;
    conflictResolution?: 'SKIP' | 'OVERWRITE' | 'RENAME';
    waitForCompletion?: boolean;
  }): Promise<{
    job: PackageImportJob;
    comparison?: PackageComparison;
  }> {
    logger.info('Starting sandbox migration', {
      packageId: params.packageId,
      targetSandbox: params.targetSandboxName,
    });

    // First, compare to preview changes
    const comparison = await this.comparePackage(
      params.packageId,
      params.targetSandboxName
    );

    // Start the import
    const job = await this.importPackage(
      params.packageId,
      params.targetSandboxName,
      { conflictResolution: params.conflictResolution || 'SKIP' }
    );

    // Optionally wait for completion
    if (params.waitForCompletion) {
      const completedJob = await this.waitForJobCompletion(job.id);
      return { job: completedJob, comparison };
    }

    return { job, comparison };
  }

  /**
   * Get migration status summary
   */
  async getMigrationStatus(jobId: string): Promise<{
    status: PackageImportJob['status'];
    progress: {
      total: number;
      completed: number;
      failed: number;
      skipped: number;
    };
    errors: string[];
  }> {
    const job = await this.getJob(jobId);

    const progress = {
      total: job.artifacts?.length || 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    const errors: string[] = [];

    for (const artifact of job.artifacts || []) {
      if (artifact.status === 'SUCCESS') {
        progress.completed++;
      } else if (artifact.status === 'FAILED') {
        progress.failed++;
        if (artifact.messages) {
          errors.push(...artifact.messages);
        }
      } else if (artifact.status === 'SKIPPED') {
        progress.skipped++;
      }
    }

    if (job.errorMessage) {
      errors.push(job.errorMessage);
    }

    return {
      status: job.status,
      progress,
      errors,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createSandboxToolingService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName: string
): SandboxToolingService {
  return new SandboxToolingService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
