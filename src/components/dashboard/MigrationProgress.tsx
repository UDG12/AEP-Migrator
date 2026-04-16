'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Play,
  Pause,
  RotateCcw,
  ArrowLeft,
  Check,
  X,
  Clock,
  Loader2,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

interface MigrationAsset {
  id: string;
  name: string;
  type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

interface MigrationJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  totalAssets: number;
  completedAssets: number;
  failedAssets: number;
  assets: MigrationAsset[];
}

interface MigrationOptions {
  conflictStrategy: 'skip' | 'overwrite' | 'rename';
}

interface Credentials {
  clientId: string;
  clientSecret: string;
  orgId: string;
  sandboxName: string;
  accessToken: string;
}

interface MigrationProgressProps {
  sourceOrgId: string;
  targetOrgId: string;
  selectedAssets: string[];
  migrationOptions?: MigrationOptions;
  jobId: string | null;
  sourceCredentials?: Credentials;
  targetCredentials?: Credentials;
  onJobStarted: (jobId: string) => void;
  onComplete: () => void;
  onBack: () => void;
}

const statusIcons = {
  pending: Clock,
  in_progress: Loader2,
  completed: Check,
  failed: X,
  skipped: AlertTriangle,
};

const statusColors = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  skipped: 'text-yellow-500',
};

// CJA asset type prefixes to detect CJA migration
const CJA_ASSET_PREFIXES = ['cja', 'dv_', 'conn_', 'seg_', 'filter_', 'cm_'];

function isCjaAsset(assetId: string): boolean {
  return CJA_ASSET_PREFIXES.some(prefix => assetId.toLowerCase().startsWith(prefix));
}

export function MigrationProgress({
  sourceOrgId,
  targetOrgId,
  selectedAssets,
  migrationOptions,
  jobId,
  sourceCredentials,
  targetCredentials,
  onJobStarted,
  onComplete,
  onBack,
}: MigrationProgressProps) {
  const [isStarted, setIsStarted] = useState(!!jobId);
  const [isCjaMigration, setIsCjaMigration] = useState(false);

  // Detect if this is a CJA migration based on selected assets
  useEffect(() => {
    const hasCjaAssets = selectedAssets.some(id => isCjaAsset(id));
    setIsCjaMigration(hasCjaAssets);
  }, [selectedAssets]);

  // Start migration mutation
  const startMigration = useMutation({
    mutationFn: async () => {
      // Use CJA endpoint if CJA assets are selected
      const endpoint = isCjaMigration ? '/api/migration/cja/start' : '/api/migration/start';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceOrgId,
          targetOrgId,
          sourceCredentials,
          targetCredentials,
          assetIds: selectedAssets,
          options: {
            conflictStrategy: migrationOptions?.conflictStrategy || 'skip',
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to start migration');
      return response.json();
    },
    onSuccess: (data) => {
      onJobStarted(data.jobId);
      setIsStarted(true);
      toast.success(`${isCjaMigration ? 'CJA ' : ''}Migration started`);
    },
    onError: (error) => {
      toast.error((error as Error).message);
    },
  });

  // Poll for job status
  const { data: job, refetch } = useQuery({
    queryKey: ['migration-job', jobId, isCjaMigration],
    queryFn: async () => {
      if (!jobId) return null;
      const endpoint = isCjaMigration ? `/api/migration/cja/${jobId}` : `/api/migration/${jobId}`;
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch job status');
      return response.json() as Promise<MigrationJob>;
    },
    enabled: !!jobId && isStarted,
    refetchInterval: isStarted ? 2000 : false, // Poll every 2 seconds
  });

  // Check if migration is complete
  useEffect(() => {
    if (job?.status === 'completed' || job?.status === 'failed') {
      if (job.status === 'completed') {
        toast.success('Migration completed successfully');
        onComplete();
      }
    }
  }, [job?.status, onComplete]);

  const handleStart = () => {
    startMigration.mutate();
  };

  const handleRetry = async () => {
    if (!jobId) return;

    try {
      const endpoint = isCjaMigration ? `/api/migration/cja/${jobId}/retry` : `/api/migration/${jobId}/retry`;
      const response = await fetch(endpoint, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to retry migration');

      toast.success('Retrying failed assets...');
      refetch();
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleExportLogs = async () => {
    if (!jobId) return;

    try {
      const endpoint = isCjaMigration ? `/api/migration/cja/${jobId}/logs` : `/api/migration/${jobId}/logs`;
      const response = await fetch(endpoint);
      const logs = await response.json();

      const blob = new Blob([JSON.stringify(logs, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `migration-logs-${jobId}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success('Logs exported');
    } catch (error) {
      toast.error('Failed to export logs');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {isCjaMigration ? 'CJA ' : ''}Migration Progress
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {isStarted
            ? `Copying ${isCjaMigration ? 'CJA ' : ''}configurations to target organization...`
            : `Ready to migrate ${selectedAssets.length} ${isCjaMigration ? 'CJA ' : ''}assets`}
        </p>
      </div>

      {/* Progress Overview */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Overall Progress
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {job?.completedAssets || 0} of {job?.totalAssets || selectedAssets.length}{' '}
                assets processed
              </p>
            </div>

            <div className="flex items-center space-x-3">
              {!isStarted && (
                <button
                  onClick={handleStart}
                  disabled={startMigration.isPending}
                  className="btn-primary"
                >
                  {startMigration.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}
                  Start Migration
                </button>
              )}

              {job?.failedAssets && job.failedAssets > 0 && (
                <button onClick={handleRetry} className="btn-secondary">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Retry Failed
                </button>
              )}

              {jobId && (
                <button onClick={handleExportLogs} className="btn-ghost">
                  <Download className="w-4 h-4 mr-2" />
                  Export Logs
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${job?.progress || 0}%` }}
            />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {job?.totalAssets || selectedAssets.length}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {job?.completedAssets || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Completed</p>
            </div>
            <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {job?.failedAssets || 0}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Failed</p>
            </div>
            <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {job?.progress || 0}%
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Progress</p>
            </div>
          </div>
        </div>
      </div>

      {/* Asset Status List */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Asset Status
          </h3>
        </div>

        <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-96 overflow-y-auto">
          {(job?.assets || []).map((asset) => {
            const StatusIcon = statusIcons[asset.status];
            const statusColor = statusColors[asset.status];

            return (
              <div
                key={asset.id}
                className="px-6 py-3 flex items-center justify-between"
              >
                <div className="flex items-center">
                  <StatusIcon
                    className={clsx(
                      'w-5 h-5 mr-3',
                      statusColor,
                      asset.status === 'in_progress' && 'animate-spin'
                    )}
                  />
                  <div>
                    <p className="text-gray-900 dark:text-white font-medium">
                      {asset.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {asset.type}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={clsx(
                      'badge',
                      asset.status === 'completed' && 'badge-success',
                      asset.status === 'failed' && 'badge-error',
                      asset.status === 'in_progress' && 'badge-info',
                      asset.status === 'pending' && 'badge-gray',
                      asset.status === 'skipped' && 'badge-warning'
                    )}
                  >
                    {asset.status}
                  </span>
                  {asset.error && (
                    <p className="text-xs text-red-500 mt-1 max-w-xs truncate">
                      {asset.error}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {!job?.assets?.length && (
            <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
              Start migration to see asset status
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      {!isStarted && (
        <div className="mt-8">
          <button onClick={onBack} className="btn-secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Asset Selection
          </button>
        </div>
      )}
    </div>
  );
}
