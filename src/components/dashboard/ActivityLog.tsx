'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { formatDate } from '@/utils/api-helpers';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
  assetId?: string;
  assetType?: string;
}

interface ActivityLogProps {
  jobId: string;
}

const levelIcons = {
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
  success: CheckCircle,
};

const levelColors = {
  info: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
  warn: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
  error: 'text-red-500 bg-red-50 dark:bg-red-900/20',
  success: 'text-green-500 bg-green-50 dark:bg-green-900/20',
};

export function ActivityLog({ jobId }: ActivityLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: logs } = useQuery({
    queryKey: ['migration-logs', jobId],
    queryFn: async () => {
      const response = await fetch(`/api/migration/${jobId}/logs`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json() as Promise<LogEntry[]>;
    },
    refetchInterval: 2000, // Poll every 2 seconds
  });

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          Activity Log
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Real-time migration events
        </p>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 space-y-2"
      >
        {logs?.map((log) => {
          const Icon = levelIcons[log.level];
          const colorClass = levelColors[log.level];

          return (
            <div
              key={log.id}
              className={clsx(
                'p-3 rounded-lg text-sm animate-fade-in',
                colorClass
              )}
            >
              <div className="flex items-start">
                <Icon className="w-4 h-4 mt-0.5 mr-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {log.message}
                  </p>
                  {log.assetType && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {log.assetType}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {formatDate(log.timestamp)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {!logs?.length && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No activity yet</p>
            <p className="text-sm">Logs will appear here when migration starts</p>
          </div>
        )}
      </div>
    </div>
  );
}
