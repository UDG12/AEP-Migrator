import { config, adobeEndpoints } from '@/config';
import { createLogger } from '@/utils/logger';
import { AdobeBaseClient, ClientOptions } from './base-client';
import type { Dataset, AdobeApiResponse } from '@/types';

const logger = createLogger('DatasetService');

// ============================================================================
// Types
// ============================================================================

// Raw API response has created/updated instead of createdAt/updatedAt
interface DatasetApiResponse {
  name?: string;
  description?: string;
  schemaRef?: { id: string; contentType?: string };
  tags?: Record<string, string[]>;
  state?: string;
  created?: number;
  updated?: number;
}

interface DatasetListResponse {
  [key: string]: DatasetApiResponse;
}

interface CreateDatasetPayload {
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
}

interface DatasetResponse {
  id: string;
  name: string;
  description?: string;
  schemaRef: {
    id: string;
    contentType: string;
  };
  tags?: Record<string, string[]>;
  state: 'DRAFT' | 'ENABLED' | 'DISABLED';
  created: number;
  updated: number;
}

interface BatchInfo {
  batchId: string;
  status: string;
  created: number;
  relatedObjects?: Array<{
    type: string;
    id: string;
    tag?: string;
  }>;
}

interface BatchFile {
  name: string;
  length: number;
  _links?: {
    self?: { href: string };
  };
}

interface DataFile {
  dataSetFileId: string;
  dataSetViewId: string;
  version: string;
  created: string;
  updated: string;
  isValid: boolean;
  _links?: {
    self?: { href: string };
  };
}

interface IngestionBatchResponse {
  id: string;
  imsOrg: string;
  status: string;
  created: number;
  updated: number;
  inputFormat?: {
    format: string;
  };
}

// ============================================================================
// Dataset Service (Catalog API)
// ============================================================================

export class DatasetService extends AdobeBaseClient {
  constructor(options: Omit<ClientOptions, 'baseUrl' | 'isReactor'>) {
    super({
      ...options,
      baseUrl: config.adobe.platformUrl,
      isReactor: false,
    });
  }

  /**
   * Fetch all datasets
   */
  async listDatasets(): Promise<Dataset[]> {
    logger.info('Fetching all datasets');

    const allDatasets: Dataset[] = [];
    let start = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const response = await this.get<DatasetListResponse>(
        adobeEndpoints.platform.datasets,
        {
          start,
          limit,
          properties: 'name,description,schemaRef,tags,state,created,updated',
        }
      );

      const datasets = Object.entries(response).map(([id, data]) => ({
        ...data,
        id,
        name: data.name || '',
        createdAt: data.created || Date.now(),
        updatedAt: data.updated || Date.now(),
      })) as Dataset[];

      allDatasets.push(...datasets);

      if (datasets.length < limit) {
        hasMore = false;
      } else {
        start += limit;
      }
    }

    logger.info(`Found ${allDatasets.length} datasets`);
    return allDatasets;
  }

  /**
   * Extract clean dataset ID from various formats
   * IDs can come as: "699c58c66f65ac750aae1960" or "@/dataSets/699c58c66f65ac750aae1960"
   */
  private cleanDatasetId(datasetId: string): string {
    if (!datasetId) return datasetId;
    // Extract just the ID if it contains a path
    const match = datasetId.match(/([a-f0-9]{24,})$/i);
    if (match) {
      return match[1];
    }
    // If it's a path like @/dataSets/id, extract the last part
    if (datasetId.includes('/')) {
      return datasetId.split('/').pop() || datasetId;
    }
    return datasetId;
  }

  /**
   * Get a single dataset by ID
   */
  async getDataset(datasetId: string): Promise<Dataset> {
    const cleanId = this.cleanDatasetId(datasetId);
    logger.debug('Fetching dataset', { datasetId, cleanId });

    const response = await this.get<DatasetResponse>(
      `${adobeEndpoints.platform.datasets}/${cleanId}`,
      {
        properties: 'name,description,schemaRef,tags,state,created,updated',
      }
    );

    return {
      ...response,
      id: cleanId,
      createdAt: response.created,
      updatedAt: response.updated,
    };
  }

  /**
   * Create a new dataset
   */
  async createDataset(payload: CreateDatasetPayload): Promise<Dataset> {
    logger.info('Creating dataset', { name: payload.name });

    const response = await this.post<string[]>(
      adobeEndpoints.platform.datasets,
      payload
    );

    // Response is array with created dataset ID
    const datasetId = response[0];
    logger.info('Dataset created successfully', { id: datasetId });

    // Fetch the created dataset to return full object
    return this.getDataset(datasetId);
  }

  /**
   * Check if a dataset exists by name
   */
  async findDatasetByName(name: string): Promise<Dataset | null> {
    const response = await this.get<DatasetListResponse>(
      adobeEndpoints.platform.datasets,
      {
        name,
        properties: 'name,description,schemaRef,tags,state,created,updated',
      }
    );

    const datasets = Object.entries(response).map(([id, data]) => ({
      ...data,
      id,
      name: data.name || '',
      createdAt: data.created || Date.now(),
      updatedAt: data.updated || Date.now(),
    })) as Dataset[];

    return datasets[0] || null;
  }

  /**
   * Copy a dataset from source to target
   */
  async copyDataset(
    sourceDataset: Dataset,
    schemaIdMapping: Map<string, string>
  ): Promise<Dataset> {
    logger.info('Copying dataset', { name: sourceDataset.name });

    // Get the target schema ID from mappings
    const sourceSchemaId = sourceDataset.schemaRef.id;
    const targetSchemaId = schemaIdMapping.get(sourceSchemaId);

    if (!targetSchemaId) {
      throw new Error(
        `Cannot copy dataset: Schema mapping not found for ${sourceSchemaId}`
      );
    }

    const payload: CreateDatasetPayload = {
      name: sourceDataset.name,
      description: sourceDataset.description,
      schemaRef: {
        id: targetSchemaId,
        contentType: sourceDataset.schemaRef.contentType,
      },
      tags: sourceDataset.tags,
      fileDescription: sourceDataset.fileDescription,
    };

    return this.createDataset(payload);
  }

  /**
   * Enable a dataset for Profile
   */
  async enableForProfile(datasetId: string): Promise<void> {
    const cleanId = this.cleanDatasetId(datasetId);
    logger.info('Enabling dataset for Profile', { datasetId: cleanId });

    await this.patch(`${adobeEndpoints.platform.datasets}/${cleanId}`, {
      tags: {
        'unifiedProfile': ['enabled:true'],
        'unifiedIdentity': ['enabled:true'],
      },
    });

    logger.info('Dataset enabled for Profile');
  }

  /**
   * Get datasets by schema ID
   */
  async getDatasetsBySchema(schemaId: string): Promise<Dataset[]> {
    logger.debug('Fetching datasets by schema', { schemaId });

    const response = await this.get<DatasetListResponse>(
      adobeEndpoints.platform.datasets,
      {
        'schemaRef.id': schemaId,
        properties: 'name,description,schemaRef,tags,state,created,updated',
      }
    );

    return Object.entries(response).map(([id, data]) => ({
      ...data,
      id,
      name: data.name || '',
      createdAt: data.created || Date.now(),
      updatedAt: data.updated || Date.now(),
    })) as Dataset[];
  }

  // ============================================================================
  // Data Export Methods (Data Access API)
  // ============================================================================

  /**
   * Get all batches for a dataset
   */
  async getDatasetBatches(datasetId: string): Promise<BatchInfo[]> {
    const cleanId = this.cleanDatasetId(datasetId);
    logger.info('Fetching batches for dataset', { datasetId: cleanId });

    // Try multiple query formats as Adobe API can be inconsistent
    let response: Record<string, any> = {};
    let allBatches: BatchInfo[] = [];

    // Helper to extract batches from response
    const extractBatches = (resp: Record<string, any>): BatchInfo[] => {
      return Object.entries(resp)
        .filter(([key, data]) => {
          // Skip metadata entries
          if (key.startsWith('_')) return false;
          if (!data || typeof data !== 'object') return false;
          // Must have status field
          if (!data.status) return false;
          return true;
        })
        .map(([batchId, data]) => ({
          batchId,
          status: data.status,
          created: data.created,
          relatedObjects: data.relatedObjects,
        }));
    };

    // Method 1: Try with dataSet filter (no status filter - get all, filter locally)
    try {
      logger.info(`Method 1: Querying batches with dataSet=${cleanId}`);
      response = await this.get<Record<string, any>>(
        adobeEndpoints.platform.batches,
        {
          dataSet: cleanId,
          orderBy: 'desc:created',
          limit: 100,
        }
      );
      const extracted = extractBatches(response);
      logger.info(`Method 1 found ${extracted.length} batches (raw keys: ${Object.keys(response).filter(k => !k.startsWith('_')).length})`);
      if (extracted.length > 0) {
        allBatches = extracted;
      }
    } catch (e: any) {
      logger.warn(`Method 1 failed: ${e.message}`);
    }

    // Method 2: If no batches found, try listing all batches and filter by relatedObjects
    if (allBatches.length === 0) {
      try {
        logger.info(`Method 2: Listing all recent batches and filtering by dataset`);
        response = await this.get<Record<string, any>>(
          adobeEndpoints.platform.batches,
          {
            orderBy: 'desc:created',
            limit: 100,
          }
        );
        const allExtracted = extractBatches(response);
        logger.info(`Method 2 found ${allExtracted.length} total batches`);

        // Filter to only batches that reference this dataset
        allBatches = allExtracted.filter(batch => {
          const relatedDatasets = batch.relatedObjects?.filter(
            (obj: any) => obj.type === 'dataSet' &&
              (obj.id === cleanId || obj.id?.includes(cleanId) || obj.id?.endsWith(cleanId))
          );
          return relatedDatasets && relatedDatasets.length > 0;
        });
        logger.info(`Method 2: After filtering by dataset, found ${allBatches.length} batches`);
      } catch (e: any) {
        logger.warn(`Method 2 failed: ${e.message}`);
      }
    }

    // Method 3: Try with createdClient filter (some batches are created by specific clients)
    if (allBatches.length === 0) {
      try {
        logger.info(`Method 3: Querying with different status values`);
        // Try with uppercase SUCCESS
        response = await this.get<Record<string, any>>(
          adobeEndpoints.platform.batches,
          {
            dataSet: cleanId,
            status: 'SUCCESS',
            limit: 100,
          }
        );
        allBatches = extractBatches(response);
        logger.info(`Method 3 (SUCCESS) found ${allBatches.length} batches`);
      } catch (e: any) {
        logger.warn(`Method 3 failed: ${e.message}`);
      }
    }

    // Filter to only successful batches (status could be 'success', 'SUCCESS', 'active', 'ACTIVE')
    const successfulBatches = allBatches.filter(batch => {
      const status = (batch.status || '').toLowerCase();
      return status === 'success' || status === 'active';
    });

    // Sort by created date descending
    successfulBatches.sort((a, b) => (b.created || 0) - (a.created || 0));

    logger.info(`Found ${successfulBatches.length} successful batches for dataset`, {
      datasetId: cleanId,
      batchIds: successfulBatches.map(b => b.batchId),
      created: successfulBatches.map(b => b.created ? new Date(b.created).toISOString() : 'unknown'),
    });

    return successfulBatches;
  }

  /**
   * Get files in a batch
   * Data Access API returns: { data: [{ name, length, _links }] }
   * But sometimes the structure varies - handle multiple formats
   */
  async getBatchFiles(batchId: string): Promise<BatchFile[]> {
    logger.info('Fetching files for batch', { batchId });

    try {
      const response = await this.get<any>(
        `${adobeEndpoints.platform.dataAccess.batchFiles}/${batchId}/files`
      );

      logger.info(`Raw batch files response for ${batchId}:`, {
        type: typeof response,
        isArray: Array.isArray(response),
        keys: response ? Object.keys(response) : [],
        dataType: response?.data ? typeof response.data : 'none',
      });

      // Handle different response formats
      let rawFiles: any[] = [];

      if (Array.isArray(response)) {
        rawFiles = response;
      } else if (response && typeof response === 'object') {
        if ('data' in response && Array.isArray(response.data)) {
          rawFiles = response.data;
        } else {
          // Sometimes the response is an object with file entries directly
          // e.g., { "fileId1": { ... }, "fileId2": { ... } }
          rawFiles = Object.entries(response)
            .filter(([key]) => !key.startsWith('_'))
            .map(([key, value]) => ({ id: key, ...value as object }));
        }
      }

      // Normalize file objects - extract name from various sources
      const files: BatchFile[] = rawFiles.map((file: any, index: number) => {
        // Try to get name from various properties
        let fileName = file.name;

        // If no name, try to extract from _links.self.href
        if (!fileName && file._links?.self?.href) {
          const parts = file._links.self.href.split('/');
          fileName = parts[parts.length - 1];
        }

        // If still no name, try dataSetFileId or id
        if (!fileName) {
          fileName = file.dataSetFileId || file.id || `file_${batchId}_${index}.parquet`;
        }

        // Get file size from various properties
        const fileLength = file.length || file.size || file.bytes || 0;

        return {
          name: fileName,
          length: fileLength,
          _links: file._links,
        };
      });

      logger.info(`Batch ${batchId} has ${files.length} files`, {
        fileNames: files.map(f => f.name),
        fileSizes: files.map(f => f.length),
      });

      return files;
    } catch (e: any) {
      logger.error(`Failed to get files for batch ${batchId}`, { error: e.message });
      throw e;
    }
  }

  /**
   * Download a data file (returns the file content as buffer)
   * The Data Access API returns file content in different ways:
   * - Small files: Direct content (binary)
   * - Large/multi-part files: JSON listing of parts that need to be downloaded individually
   */
  async downloadDataFile(dataSetFileId: string): Promise<Buffer> {
    logger.info('Downloading data file', { dataSetFileId });

    try {
      // First, try to get the file - it might be direct content or a listing of parts
      const response = await this.getRaw(
        `${adobeEndpoints.platform.dataAccess.files}/${dataSetFileId}`
      );

      // Check if response is a JSON listing of file parts
      // (starts with {"data":[ which indicates a parts listing)
      const firstChars = response.subarray(0, 20).toString('utf8');
      if (firstChars.startsWith('{"data":[')) {
        logger.info('File has multiple parts, downloading each part...', { dataSetFileId });

        // Parse the listing to get the actual file parts
        const listing = JSON.parse(response.toString('utf8'));
        const parts = listing.data || [];

        if (parts.length === 0) {
          logger.warn('No file parts found in listing', { dataSetFileId });
          return Buffer.alloc(0);
        }

        // Download each part and concatenate
        const allParts: Buffer[] = [];
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          // Extract the part path/name - it's usually in the _links.self.href or name
          const partHref = part._links?.self?.href;
          let partPath = '';

          if (partHref) {
            // href is like: https://platform.adobe.io/data/foundation/export/files/fileId?path=partName
            const pathMatch = partHref.match(/path=([^&]+)/);
            if (pathMatch) {
              partPath = decodeURIComponent(pathMatch[1]);
            }
          } else if (part.name) {
            partPath = part.name;
          }

          if (partPath) {
            logger.info(`Downloading part ${i + 1}/${parts.length}: ${partPath}`);
            try {
              const partData = await this.getRaw(
                `${adobeEndpoints.platform.dataAccess.files}/${dataSetFileId}`,
                { path: partPath }
              );
              allParts.push(partData);
              logger.info(`Downloaded part ${partPath}`, { size: partData.length });
            } catch (partError: any) {
              logger.warn(`Failed to download part ${partPath}`, { error: partError.message });
            }
          }
        }

        // Concatenate all parts
        const combined = Buffer.concat(allParts);
        logger.info(`Downloaded all parts for ${dataSetFileId}`, {
          totalParts: parts.length,
          downloadedParts: allParts.length,
          totalSize: combined.length
        });
        return combined;
      }

      // Direct content - return as-is
      logger.info(`Downloaded file ${dataSetFileId} (direct)`, { size: response.length });
      return response;
    } catch (e: any) {
      logger.error(`Failed to download file ${dataSetFileId}`, {
        error: e.message,
        status: e.response?.status,
      });
      throw e;
    }
  }

  /**
   * Export all data from a dataset
   * Returns an array of data chunks (each batch's files)
   */
  async exportDatasetData(datasetId: string): Promise<{ batchId: string; files: Array<{ name: string; data: Buffer }> }[]> {
    const cleanId = this.cleanDatasetId(datasetId);
    logger.info('=== EXPORT DATA START ===', { datasetId: cleanId });

    const batches = await this.getDatasetBatches(cleanId);

    if (batches.length === 0) {
      logger.warn('No batches found for dataset - dataset may be empty or have no successful ingestions');
      return [];
    }

    logger.info(`Found ${batches.length} batches to export:`, {
      batches: batches.map(b => ({
        id: b.batchId,
        status: b.status,
        created: b.created ? new Date(b.created).toISOString() : 'unknown',
      })),
    });

    const exportedData: { batchId: string; files: Array<{ name: string; data: Buffer }> }[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchDate = batch.created ? new Date(batch.created).toISOString() : 'unknown';
      logger.info(`Processing batch ${i + 1}/${batches.length}: ${batch.batchId}`, {
        status: batch.status,
        created: batchDate,
      });

      try {
        const files = await this.getBatchFiles(batch.batchId);

        if (files.length === 0) {
          logger.warn(`Batch ${batch.batchId} has no files - skipping`);
          continue;
        }

        logger.info(`Batch ${batch.batchId} contains ${files.length} files:`, {
          files: files.map(f => ({ name: f.name, size: f.length })),
        });

        const batchFiles: Array<{ name: string; data: Buffer }> = [];

        for (let j = 0; j < files.length; j++) {
          const file = files[j];
          try {
            logger.info(`Downloading file ${j + 1}/${files.length}: ${file.name}`, {
              size: file.length,
              selfLink: file._links?.self?.href,
            });

            // Extract file ID from the self link
            // Format: /data/foundation/export/files/{fileId}
            let fileId = file.name;
            if (file._links?.self?.href) {
              const parts = file._links.self.href.split('/');
              fileId = parts[parts.length - 1] || file.name;
            }

            logger.info(`Using file ID: ${fileId}`);
            const data = await this.downloadDataFile(fileId);
            logger.info(`Downloaded ${file.name}: ${data.length} bytes`);
            batchFiles.push({ name: file.name, data });
          } catch (fileError: any) {
            logger.error(`Failed to download file ${file.name}`, {
              error: fileError.message,
              status: fileError.response?.status,
            });
          }
        }

        if (batchFiles.length > 0) {
          exportedData.push({ batchId: batch.batchId, files: batchFiles });
          logger.info(`Batch ${batch.batchId}: Exported ${batchFiles.length} files`);
        } else {
          logger.warn(`Batch ${batch.batchId}: No files could be downloaded`);
        }
      } catch (batchError: any) {
        logger.error(`Failed to process batch ${batch.batchId}`, {
          error: batchError.message,
          status: batchError.response?.status,
        });
      }
    }

    logger.info(`=== EXPORT DATA COMPLETE ===`, {
      totalBatches: batches.length,
      exportedBatches: exportedData.length,
      totalFiles: exportedData.reduce((sum, b) => sum + b.files.length, 0),
    });

    return exportedData;
  }

  // ============================================================================
  // Data Import Methods (Batch Ingestion API)
  // ============================================================================

  /**
   * Create a new ingestion batch
   */
  async createIngestionBatch(datasetId: string, inputFormat: string = 'parquet'): Promise<string> {
    const cleanId = this.cleanDatasetId(datasetId);
    logger.info('Creating ingestion batch', { datasetId: cleanId, inputFormat });

    const response = await this.post<IngestionBatchResponse>(
      adobeEndpoints.platform.batchIngestion.batches,
      {
        datasetId: cleanId,
        inputFormat: { format: inputFormat },
      }
    );

    logger.info('Ingestion batch created', { batchId: response.id });
    return response.id;
  }

  /**
   * Upload a file to an ingestion batch
   */
  async uploadFileToBatch(batchId: string, datasetId: string, fileName: string, data: Buffer): Promise<void> {
    const cleanId = this.cleanDatasetId(datasetId);
    logger.info('Uploading file to batch', { batchId, datasetId: cleanId, fileName, size: data.length });

    await this.putRaw(
      `${adobeEndpoints.platform.batchIngestion.batches}/${batchId}/datasets/${cleanId}/files/${fileName}`,
      data,
      {
        'Content-Type': 'application/octet-stream',
      }
    );

    logger.info('File uploaded successfully');
  }

  /**
   * Complete an ingestion batch (signal that upload is done)
   */
  async completeIngestionBatch(batchId: string): Promise<void> {
    logger.info('Completing ingestion batch', { batchId });

    await this.post(
      `${adobeEndpoints.platform.batchIngestion.batches}/${batchId}?action=COMPLETE`,
      {}
    );

    logger.info('Batch completed successfully');
  }

  /**
   * Get ingestion batch status
   */
  async getIngestionBatchStatus(batchId: string): Promise<string> {
    const response = await this.get<{ status: string }>(
      `${adobeEndpoints.platform.batches}/${batchId}`
    );
    return response.status;
  }

  /**
   * Get detailed batch information including errors
   */
  async getBatchDetails(batchId: string): Promise<{
    status: string;
    errors?: Array<{ code: string; description: string }>;
    metrics?: Record<string, number>;
    failedRecordCount?: number;
    processedRecordCount?: number;
  }> {
    logger.info('Getting batch details', { batchId });

    const response = await this.get<any>(
      `${adobeEndpoints.platform.batches}/${batchId}`
    );

    // The Catalog API returns batch info in a nested structure: { batchId: { ... } }
    // Or sometimes directly as the batch object
    let batchData = response;

    // Check if response is nested (common format: { "batchId": { status: "...", ... } })
    if (response && typeof response === 'object' && !response.status) {
      const keys = Object.keys(response).filter(k => !k.startsWith('_'));
      if (keys.length === 1) {
        batchData = response[keys[0]];
      } else if (response[batchId]) {
        batchData = response[batchId];
      }
    }

    // Log FULL batch data for debugging
    logger.info('=== BATCH DETAILS ===', {
      batchId,
      status: batchData?.status,
      errors: batchData?.errors,
      metrics: batchData?.metrics,
      errorMessage: batchData?.errorMessage,
      errorCode: batchData?.errorCode,
      fullBatch: JSON.stringify(batchData, null, 2).substring(0, 3000),
    });

    // Extract relevant info from batch response
    const result = {
      status: batchData?.status || 'unknown',
      errors: batchData?.errors || [],
      metrics: batchData?.metrics || {},
      failedRecordCount: batchData?.metrics?.failedRecordCount || batchData?.failedRecordCount || 0,
      processedRecordCount: batchData?.metrics?.inputRecordCount || batchData?.recordCount || 0,
    };

    return result;
  }

  /**
   * Wait for batch processing to complete and return final status
   * AEP batch processing is async - this polls until complete or failed
   */
  async waitForBatchCompletion(
    batchId: string,
    maxWaitMs: number = 60000,
    pollIntervalMs: number = 5000
  ): Promise<{
    status: string;
    success: boolean;
    errors?: Array<{ code: string; description: string }>;
    message?: string;
  }> {
    logger.info('Waiting for batch processing', { batchId, maxWaitMs, pollIntervalMs });

    const startTime = Date.now();
    let lastStatus = '';

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const details = await this.getBatchDetails(batchId);
        lastStatus = details.status;

        // Terminal states
        if (details.status === 'success' || details.status === 'SUCCESS') {
          logger.info('Batch processing succeeded', { batchId, metrics: details.metrics });
          return {
            status: details.status,
            success: true,
            message: `Processed ${details.processedRecordCount} records`,
          };
        }

        if (details.status === 'failed' || details.status === 'FAILED') {
          logger.error('Batch processing failed', {
            batchId,
            errors: details.errors,
            failedRecordCount: details.failedRecordCount,
          });
          return {
            status: details.status,
            success: false,
            errors: details.errors,
            message: details.errors?.map(e => `${e.code}: ${e.description}`).join('; ') ||
                     `Failed with ${details.failedRecordCount} failed records`,
          };
        }

        if (details.status === 'stalled' || details.status === 'STALLED') {
          logger.warn('Batch processing stalled', { batchId });
          return {
            status: details.status,
            success: false,
            message: 'Batch processing stalled',
          };
        }

        // Still processing - wait and poll again
        logger.info(`Batch still processing: ${details.status}`, { batchId });
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

      } catch (e: any) {
        logger.warn('Error checking batch status', { batchId, error: e.message });
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      }
    }

    // Timeout
    logger.warn('Batch processing timeout', { batchId, lastStatus, elapsedMs: Date.now() - startTime });
    return {
      status: lastStatus || 'timeout',
      success: false,
      message: `Timeout waiting for batch processing (last status: ${lastStatus})`,
    };
  }

  /**
   * Detect input format from file extension
   */
  private detectInputFormatFromName(fileName: string | undefined): string {
    if (!fileName) {
      return 'json'; // Default to json as most AEP data exports are JSON
    }
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'parquet':
        return 'parquet';
      case 'json':
        return 'json';
      case 'csv':
        return 'csv';
      default:
        return 'json'; // Default to json
    }
  }

  /**
   * Detect input format from file content (magic bytes)
   * Parquet files start with "PAR1" (0x50 0x41 0x52 0x31)
   * JSON files typically start with '{' or '['
   */
  private detectInputFormatFromContent(data: Buffer): string {
    if (data.length < 4) {
      return 'json';
    }

    // Check for Parquet magic bytes "PAR1" at the start
    const parquetMagic = Buffer.from([0x50, 0x41, 0x52, 0x31]); // "PAR1"
    if (data.subarray(0, 4).equals(parquetMagic)) {
      logger.info('Detected Parquet format from magic bytes');
      return 'parquet';
    }

    // Check for JSON (starts with { or [)
    const firstChar = String.fromCharCode(data[0]);
    if (firstChar === '{' || firstChar === '[') {
      logger.info('Detected JSON format from content');
      return 'json';
    }

    // Check for CSV (typically starts with a letter or quote)
    // This is a rough heuristic
    const firstFewChars = data.subarray(0, 100).toString('utf8');
    if (firstFewChars.includes(',') && !firstFewChars.includes('{')) {
      logger.info('Detected CSV format from content');
      return 'csv';
    }

    // Default to JSON as AEP commonly uses JSON for data export
    logger.info('Could not detect format, defaulting to JSON');
    return 'json';
  }

  /**
   * Extract data array from wrapper without re-serializing individual records
   * This preserves exact field formats (dates, numbers, etc.)
   * Data Access API returns {"data": [...]} but batch ingestion expects just [...]
   */
  private extractDataArray(data: Buffer): Buffer {
    try {
      const content = data.toString('utf8').trim();

      // Check if it's wrapped in {"data": [...]} format
      // Use string manipulation to preserve exact record formatting
      if (content.startsWith('{"data":')) {
        // Find the start of the array (after "data":)
        const arrayStart = content.indexOf('[');
        const arrayEnd = content.lastIndexOf(']');

        if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
          // Extract just the array portion including brackets
          const arrayContent = content.substring(arrayStart, arrayEnd + 1);

          logger.info('Extracted data array from wrapper (preserving original format)', {
            originalSize: data.length,
            extractedSize: arrayContent.length,
          });

          return Buffer.from(arrayContent, 'utf8');
        }
      }

      // Check if it's already an array
      if (content.startsWith('[')) {
        logger.info('Data is already an array, using as-is');
        return data;
      }

      // Single object - wrap in array
      if (content.startsWith('{')) {
        const wrapped = '[' + content + ']';
        logger.info('Wrapped single object in array');
        return Buffer.from(wrapped, 'utf8');
      }

      // Return original if we can't process it
      logger.info('Using original data format');
      return data;
    } catch (e: any) {
      logger.warn('Could not extract data array, using original', { error: e.message });
      return data;
    }
  }

  /**
   * Import data to a dataset
   * Takes exported data and uploads it to the target dataset
   */
  async importDataToDataset(
    targetDatasetId: string,
    exportedData: { batchId: string; files: Array<{ name: string; data: Buffer }> }[]
  ): Promise<{ successBatches: number; failedBatches: number }> {
    logger.info('=== IMPORT DATA START ===', {
      targetDatasetId,
      batchCount: exportedData.length,
      totalFiles: exportedData.reduce((sum, b) => sum + b.files.length, 0),
    });

    let successBatches = 0;
    let failedBatches = 0;

    for (let i = 0; i < exportedData.length; i++) {
      const batch = exportedData[i];
      logger.info(`Importing batch ${i + 1}/${exportedData.length}: ${batch.batchId}`, {
        fileCount: batch.files.length,
        fileNames: batch.files.map(f => f.name),
        fileSizes: batch.files.map(f => f.data.length),
      });

      try {
        // Skip batches with no files
        if (batch.files.length === 0) {
          logger.warn(`Batch ${batch.batchId} has no files - skipping`);
          continue;
        }

        // Detect format from file content (not filename - more reliable)
        const firstFileData = batch.files[0].data;
        const inputFormat = this.detectInputFormatFromContent(firstFileData);
        logger.info(`Detected input format from content: ${inputFormat}`, {
          firstBytes: firstFileData.subarray(0, 20).toString('hex'),
          firstChars: firstFileData.subarray(0, 50).toString('utf8').substring(0, 50),
        });

        // Create a new ingestion batch for each source batch
        const newBatchId = await this.createIngestionBatch(targetDatasetId, inputFormat);
        logger.info(`Created ingestion batch: ${newBatchId}`);

        // Upload each file from the source batch
        for (let j = 0; j < batch.files.length; j++) {
          const file = batch.files[j];
          let fileData = file.data;
          const originalSize = fileData?.length || 0;

          if (originalSize === 0) {
            logger.warn(`File ${file.name} has no data - skipping`);
            continue;
          }

          // Extract data array from wrapper (preserves original record formatting)
          if (inputFormat === 'json') {
            fileData = this.extractDataArray(fileData);
          }

          // Ensure file name has correct extension based on detected format
          let fileName = file.name || `data_${batch.batchId}_${j}`;

          // Add or fix extension based on detected content format
          const extMap: Record<string, string> = { json: '.json', parquet: '.parquet', csv: '.csv' };
          const expectedExt = extMap[inputFormat] || '.json';

          // Remove any existing extension and add the correct one
          const baseName = fileName.replace(/\.(json|parquet|csv|gz)$/i, '');
          fileName = baseName + expectedExt;

          logger.info(`Uploading file ${j + 1}/${batch.files.length}: ${fileName} (${fileData.length} bytes, original: ${originalSize})`);
          await this.uploadFileToBatch(newBatchId, targetDatasetId, fileName, fileData);
        }

        // Complete the batch (signals upload is done)
        logger.info(`Completing batch ${newBatchId}...`);
        await this.completeIngestionBatch(newBatchId);

        // Wait for AEP to process the batch and check actual status
        logger.info(`Waiting for batch ${newBatchId} to be processed by AEP...`);
        const result = await this.waitForBatchCompletion(newBatchId, 120000, 5000); // 2 min timeout, poll every 5s

        if (result.success) {
          successBatches++;
          logger.info(`Batch ${batch.batchId} imported successfully as ${newBatchId}`, {
            status: result.status,
            message: result.message,
          });
        } else {
          failedBatches++;
          logger.error(`Batch ${batch.batchId} failed processing in AEP`, {
            newBatchId,
            status: result.status,
            errors: result.errors,
            message: result.message,
          });
        }
      } catch (error: any) {
        logger.error(`Failed to import batch ${batch.batchId}`, {
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
          status: error.response?.status,
          data: error.response?.data ? JSON.stringify(error.response.data).substring(0, 500) : undefined,
        });
        failedBatches++;
      }
    }

    logger.info('=== IMPORT DATA COMPLETE ===', { successBatches, failedBatches });
    return { successBatches, failedBatches };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createDatasetService(
  accessToken: string,
  clientId: string,
  orgId: string,
  sandboxName: string
): DatasetService {
  return new DatasetService({
    accessToken,
    clientId,
    orgId,
    sandboxName,
  });
}
