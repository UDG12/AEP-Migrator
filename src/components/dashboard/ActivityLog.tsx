'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle,
  Filter,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
  isCjaMigration?: boolean;
}

const levelIcons = {
  info: Info,
  warn: AlertTriangle,
  error: XCircle,
  success: CheckCircle,
};

const levelColors = {
  info: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    border: 'border-l-blue-500',
    icon: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200',
  },
  warn: {
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    border: 'border-l-yellow-500',
    icon: 'text-yellow-500',
    badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200',
  },
  error: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-l-red-500',
    icon: 'text-red-500',
    badge: 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-l-green-500',
    icon: 'text-green-500',
    badge: 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200',
  },
};

type FilterType = 'all' | 'info' | 'warn' | 'error' | 'success';

export function ActivityLog({ jobId, isCjaMigration = false }: ActivityLogProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const { data: logs } = useQuery({
    queryKey: ['migration-logs', jobId, isCjaMigration],
    queryFn: async () => {
      // Use the correct endpoint based on migration type
      const endpoint = isCjaMigration
        ? `/api/migration/cja/${jobId}/logs`
        : `/api/migration/${jobId}/logs`;
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json() as Promise<LogEntry[]>;
    },
    refetchInterval: 2000,
  });

  // Apply filter (API already returns newest first)
  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    if (filter === 'all') return logs;
    return logs.filter(log => log.level === filter);
  }, [logs, filter]);

  // Count logs by level
  const logCounts = useMemo(() => {
    if (!logs) return { all: 0, info: 0, warn: 0, error: 0, success: 0 };
    return logs.reduce(
      (acc, log) => {
        acc.all++;
        acc[log.level]++;
        return acc;
      },
      { all: 0, info: 0, warn: 0, error: 0, success: 0 }
    );
  }, [logs]);

  const toggleLogExpand = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const filterOptions: { value: FilterType; label: string; count: number }[] = [
    { value: 'all', label: 'All Logs', count: logCounts.all },
    { value: 'success', label: 'Success', count: logCounts.success },
    { value: 'info', label: 'Info', count: logCounts.info },
    { value: 'warn', label: 'Warnings', count: logCounts.warn },
    { value: 'error', label: 'Errors', count: logCounts.error },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center">
            <Clock className="w-4 h-4 mr-2 text-gray-500" />
            Activity Log
          </h3>
          <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">
            {logCounts.all} events
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Latest events shown first
        </p>
      </div>

      {/* Filter Bar */}
      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
        <div className="relative">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center justify-between w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
          >
            <span className="flex items-center">
              <Filter className="w-4 h-4 mr-2 text-gray-500" />
              <span className="text-gray-700 dark:text-gray-300">
                {filterOptions.find(f => f.value === filter)?.label}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                ({filterOptions.find(f => f.value === filter)?.count})
              </span>
            </span>
            {isFilterOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-500" />
            )}
          </button>

          {isFilterOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 overflow-hidden">
              {filterOptions.map(option => (
                <button
                  key={option.value}
                  onClick={() => {
                    setFilter(option.value);
                    setIsFilterOpen(false);
                  }}
                  className={clsx(
                    'flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors',
                    filter === option.value && 'bg-adobe-red/10 text-adobe-red'
                  )}
                >
                  <span className="flex items-center">
                    {option.value !== 'all' && (
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full mr-2',
                          option.value === 'success' && 'bg-green-500',
                          option.value === 'info' && 'bg-blue-500',
                          option.value === 'warn' && 'bg-yellow-500',
                          option.value === 'error' && 'bg-red-500'
                        )}
                      />
                    )}
                    {option.label}
                  </span>
                  <span className="text-xs text-gray-500">{option.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Filter Badges */}
        <div className="flex gap-1 mt-2 flex-wrap">
          {logCounts.error > 0 && (
            <button
              onClick={() => setFilter('error')}
              className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                filter === 'error'
                  ? 'bg-red-500 text-white'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              )}
            >
              {logCounts.error} error{logCounts.error > 1 ? 's' : ''}
            </button>
          )}
          {logCounts.warn > 0 && (
            <button
              onClick={() => setFilter('warn')}
              className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                filter === 'warn'
                  ? 'bg-yellow-500 text-white'
                  : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
              )}
            >
              {logCounts.warn} warning{logCounts.warn > 1 ? 's' : ''}
            </button>
          )}
          {logCounts.success > 0 && (
            <button
              onClick={() => setFilter('success')}
              className={clsx(
                'px-2 py-0.5 rounded text-xs font-medium transition-colors',
                filter === 'success'
                  ? 'bg-green-500 text-white'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              )}
            >
              {logCounts.success} success
            </button>
          )}
        </div>
      </div>

      {/* Logs List */}
      <div className="flex-1 overflow-y-auto">
        {filteredLogs.length > 0 ? (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredLogs.map((log, index) => {
              const Icon = levelIcons[log.level];
              const colors = levelColors[log.level];
              const isExpanded = expandedLogs.has(log.id);
              const isLatest = index === 0;

              return (
                <div
                  key={log.id}
                  className={clsx(
                    'relative transition-all duration-200',
                    colors.bg,
                    'border-l-4',
                    colors.border,
                    isLatest && 'animate-pulse-once'
                  )}
                >
                  <button
                    onClick={() => toggleLogExpand(log.id)}
                    className="w-full px-4 py-3 text-left"
                  >
                    <div className="flex items-start">
                      <Icon className={clsx('w-4 h-4 mt-0.5 mr-3 flex-shrink-0', colors.icon)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', colors.badge)}>
                            {log.level.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {formatDate(log.timestamp)}
                          </span>
                        </div>
                        <p className={clsx(
                          'text-sm text-gray-900 dark:text-white',
                          !isExpanded && 'line-clamp-2'
                        )}>
                          {log.message}
                        </p>
                        {log.assetType && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5" />
                            {log.assetType}
                            {log.assetId && (
                              <span className="ml-2 font-mono text-gray-400">
                                ID: {log.assetId.substring(0, 8)}...
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-12 text-gray-500 dark:text-gray-400">
            {logs?.length === 0 ? (
              <>
                <Info className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">No activity yet</p>
                <p className="text-sm mt-1">Logs will appear here when migration starts</p>
              </>
            ) : (
              <>
                <Filter className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">No matching logs</p>
                <p className="text-sm mt-1">Try changing the filter</p>
                <button
                  onClick={() => setFilter('all')}
                  className="mt-3 text-sm text-adobe-red hover:underline"
                >
                  Show all logs
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Footer with summary */}
      {logs && logs.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Showing {filteredLogs.length} of {logs.length} logs
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                {logCounts.success}
              </span>
              <span className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-blue-500 mr-1" />
                {logCounts.info}
              </span>
              <span className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-yellow-500 mr-1" />
                {logCounts.warn}
              </span>
              <span className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-red-500 mr-1" />
                {logCounts.error}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
