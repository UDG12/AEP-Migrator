'use client';

import { useState, useEffect, memo } from 'react';
import {
  Database,
  FileJson,
  Users,
  Tag,
  Code,
  Workflow,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Package,
  Search,
  X,
  Link,
  LayoutDashboard,
  Filter,
  Calculator,
  BarChart3,
  Settings,
  Layers,
  Download,
  Fingerprint,
  GitMerge,
  Activity,
  Box,
  Shield,
  Tags,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

// SearchBar component - defined outside to prevent re-creation on each render
const SearchBar = memo(function SearchBar({
  categoryId,
  placeholder,
  value,
  onChange,
  onClear,
}: {
  categoryId: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="px-4 py-2 bg-white border-b border-gray-100">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-adobe-red focus:border-adobe-red bg-gray-50"
        />
        {value && (
          <button
            onClick={onClear}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
});

interface Asset {
  id: string;
  name: string;
  type: string;
  dependencies?: string[];
  // Additional details
  description?: string;
  owner?: string;
  createdDate?: string;
  modifiedDate?: string;
  tags?: string[];
  parentId?: string;
  parentName?: string;
  // CJA specific
  dataViewId?: string;
  dataViewName?: string;
  connectionId?: string;
  connectionName?: string;
  datasetsCount?: number;
  dimensionsCount?: number;
  metricsCount?: number;
  // CJA Data View specific
  timezoneDesignator?: string;
  sessionDefinition?: {
    sessionTimeout?: number;
    sessionTimeoutUnit?: string | { name?: string };
  };
  components?: {
    dimensions?: Array<{ id: string; name: string; schemaPath?: string }>;
    metrics?: Array<{ id: string; name: string; schemaPath?: string }>;
    derivedFields?: Array<{ id: string; name: string }>;
  };
}

interface CJAFlatData {
  connections: Asset[];
  dataViews: Asset[];
  segments: Asset[];
  filters: Asset[];
  calculatedMetrics: Asset[];
  projects: Asset[];
}

interface LaunchPropertyHierarchy {
  property: {
    id: string;
    name: string;
  };
  extensions: Asset[];
  dataElements: Asset[];
  rules: Asset[];
}

interface CJAConnectionHierarchy {
  connection: {
    id: string;
    name: string;
    datasets?: {
      id: string;
      name?: string;
      type: string;
    }[];
  };
  dataViews: {
    id: string;
    name: string;
    segments: Asset[];
    filters: Asset[];
    calculatedMetrics: Asset[];
  }[];
}

interface AssetCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  apiType: string;
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

interface AssetSelectorProps {
  sourceOrgId: string;
  targetOrgId: string;
  sourceSandbox?: string;
  targetSandbox?: string;
  sourceCredentials: Credentials;
  targetCredentials: Credentials;
  onBack: () => void;
  onNext: (selectedAssets: string[], options?: MigrationOptions) => void;
}

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

interface CategoryState {
  status: LoadingState;
  assets: Asset[];
  error?: string;
}

// AEP asset categories organized into groups
interface AssetCategoryGroup {
  id: string;
  label: string;
  description: string;
  color: string;
  categories: AssetCategory[];
}

const aepCategoryGroups: AssetCategoryGroup[] = [
  {
    id: 'schema-data',
    label: 'Schema & Data',
    description: 'XDM schemas, field groups, and datasets',
    color: 'blue',
    categories: [
      { id: 'schemas', label: 'Schemas', icon: FileJson, apiType: 'schemas' },
      { id: 'fieldGroups', label: 'Field Groups', icon: Layers, apiType: 'fieldGroups' },
      { id: 'datasets', label: 'Datasets', icon: Database, apiType: 'datasets' },
    ],
  },
  {
    id: 'identity-profile',
    label: 'Identity & Profile',
    description: 'Identity namespaces, audiences, and profile settings',
    color: 'purple',
    categories: [
      { id: 'identityNamespaces', label: 'Identity Namespaces', icon: Fingerprint, apiType: 'identityNamespaces' },
      { id: 'audiences', label: 'Audiences', icon: Users, apiType: 'audiences' },
      { id: 'mergePolicies', label: 'Merge Policies', icon: GitMerge, apiType: 'mergePolicies' },
      { id: 'computedAttributes', label: 'Computed Attributes', icon: Calculator, apiType: 'computedAttributes' },
    ],
  },
  {
    id: 'data-integration',
    label: 'Data Integration',
    description: 'Sources, destinations, and data flows',
    color: 'green',
    categories: [
      { id: 'connections', label: 'Connections', icon: Link, apiType: 'connections' },
      { id: 'dataFlows', label: 'Data Flows', icon: Activity, apiType: 'dataFlows' },
    ],
  },
  {
    id: 'governance',
    label: 'Governance & Admin',
    description: 'Sandboxes, policies, and data governance',
    color: 'orange',
    categories: [
      { id: 'sandboxes', label: 'Sandboxes', icon: Box, apiType: 'sandboxes' },
      { id: 'dataUsageLabels', label: 'Data Usage Labels', icon: Tags, apiType: 'dataUsageLabels' },
      { id: 'governancePolicies', label: 'Governance Policies', icon: Shield, apiType: 'governancePolicies' },
    ],
  },
];

// Flatten for backward compatibility
const aepCategories: AssetCategory[] = aepCategoryGroups.flatMap(g => g.categories);

export function AssetSelector({
  sourceOrgId,
  targetOrgId,
  sourceSandbox,
  targetSandbox,
  sourceCredentials,
  targetCredentials,
  onBack,
  onNext,
}: AssetSelectorProps) {
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['schemas']));
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'overwrite' | 'rename'>('skip');

  // Search state for each category
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  const updateSearch = (categoryId: string, term: string) => {
    setSearchTerms(prev => ({ ...prev, [categoryId]: term }));
  };

  const clearSearch = (categoryId: string) => {
    setSearchTerms(prev => ({ ...prev, [categoryId]: '' }));
  };

  const filterAssets = (assets: Asset[], categoryId: string) => {
    const term = searchTerms[categoryId]?.toLowerCase() || '';
    if (!term) return assets;
    return assets.filter(a => a.name.toLowerCase().includes(term));
  };

  // AEP categories state
  const [categoryStates, setCategoryStates] = useState<Record<string, CategoryState>>(() => {
    const initial: Record<string, CategoryState> = {};
    aepCategories.forEach(cat => {
      initial[cat.id] = { status: 'idle', assets: [] };
    });
    return initial;
  });

  // Launch hierarchy state
  const [launchState, setLaunchState] = useState<{
    status: LoadingState;
    properties: LaunchPropertyHierarchy[];
    error?: string;
  }>({ status: 'idle', properties: [] });

  // CJA flat state (separate sections)
  const [cjaFlatState, setCjaFlatState] = useState<{
    status: LoadingState;
    data: CJAFlatData;
    error?: string;
  }>({ status: 'idle', data: { connections: [], dataViews: [], segments: [], filters: [], calculatedMetrics: [], projects: [] } });

  // Keep legacy hierarchy state for backwards compatibility (will be removed)
  const [cjaState, setCjaState] = useState<{
    status: LoadingState;
    connections: CJAConnectionHierarchy[];
    error?: string;
  }>({ status: 'idle', connections: [] });

  // Expanded CJA connections and dataviews
  const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());
  const [expandedDataViews, setExpandedDataViews] = useState<Set<string>>(new Set());
  const [expandedDataViewDetails, setExpandedDataViewDetails] = useState<Set<string>>(new Set());

  const toggleDataViewDetails = (id: string) => {
    setExpandedDataViewDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const [currentAepIndex, setCurrentAepIndex] = useState(0);
  const [aepLoadingComplete, setAepLoadingComplete] = useState(false);

  // Load AEP assets sequentially
  useEffect(() => {
    const loadNextCategory = async () => {
      if (currentAepIndex >= aepCategories.length) {
        setAepLoadingComplete(true);
        return;
      }

      const category = aepCategories[currentAepIndex];

      setCategoryStates(prev => ({
        ...prev,
        [category.id]: { ...prev[category.id], status: 'loading' }
      }));

      try {
        const response = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credentials: sourceCredentials,
            type: category.apiType,
          }),
        });
        if (!response.ok) throw new Error(`Failed to fetch ${category.label}`);
        const assets = await response.json() as Asset[];

        setCategoryStates(prev => ({
          ...prev,
          [category.id]: { status: 'success', assets }
        }));

        setExpandedCategories(prev => new Set([...prev, category.id]));
      } catch (error) {
        setCategoryStates(prev => ({
          ...prev,
          [category.id]: { status: 'error', assets: [], error: (error as Error).message }
        }));
      }

      setCurrentAepIndex(prev => prev + 1);
    };

    loadNextCategory();
  }, [currentAepIndex, sourceCredentials]);

  // Load CJA flat data after AEP assets are done (load first, before Launch)
  useEffect(() => {
    if (!aepLoadingComplete) return;

    const loadCjaFlatData = async () => {
      setCjaFlatState({ status: 'loading', data: { connections: [], dataViews: [], segments: [], filters: [], calculatedMetrics: [], projects: [] } });
      setCjaState({ status: 'loading', connections: [] });

      try {
        const response = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credentials: sourceCredentials,
            type: 'cjaFlat',
          }),
        });
        if (!response.ok) throw new Error('Failed to fetch CJA data');
        const data = await response.json() as CJAFlatData;

        // Debug logging
        console.log('CJA Flat Data received:', {
          connections: data.connections?.length || 0,
          dataViews: data.dataViews?.length || 0,
          segments: data.segments?.length || 0,
          filters: data.filters?.length || 0,
          calculatedMetrics: data.calculatedMetrics?.length || 0,
          connectionsData: data.connections
        });

        setCjaFlatState({ status: 'success', data });
        setCjaState({ status: 'success', connections: [] }); // Mark as loaded for progress
        setExpandedCategories(prev => new Set([...prev, 'cja']));
      } catch (error) {
        setCjaFlatState({ status: 'error', data: { connections: [], dataViews: [], segments: [], filters: [], calculatedMetrics: [], projects: [] }, error: (error as Error).message });
        setCjaState({ status: 'error', connections: [], error: (error as Error).message });
      }
    };

    loadCjaFlatData();
  }, [aepLoadingComplete, sourceCredentials]);

  // Load Launch hierarchy after AEP assets are done
  useEffect(() => {
    if (!aepLoadingComplete) return;

    const loadLaunchHierarchy = async () => {
      setLaunchState({ status: 'loading', properties: [] });

      try {
        const response = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            credentials: sourceCredentials,
            type: 'launchHierarchy',
          }),
        });
        if (!response.ok) throw new Error('Failed to fetch Launch properties');
        const properties = await response.json() as LaunchPropertyHierarchy[];

        setLaunchState({ status: 'success', properties });
        setExpandedCategories(prev => new Set([...prev, 'launch']));
      } catch (error) {
        setLaunchState({ status: 'error', properties: [], error: (error as Error).message });
      }
    };

    loadLaunchHierarchy();
  }, [aepLoadingComplete, sourceCredentials]);

  // Allow migration once AEP assets are loaded (Launch and CJA load in background)
  const isLoadingComplete = aepLoadingComplete;
  const isLaunchLoading = launchState.status === 'loading' || launchState.status === 'idle';
  const isCjaLoading = cjaState.status === 'loading' || cjaState.status === 'idle';

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const toggleProperty = (propertyId: string) => {
    setExpandedProperties(prev => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  };

  const toggleConnection = (connectionId: string) => {
    setExpandedConnections(prev => {
      const next = new Set(prev);
      if (next.has(connectionId)) next.delete(connectionId);
      else next.add(connectionId);
      return next;
    });
  };

  const toggleDataView = (dataViewId: string) => {
    setExpandedDataViews(prev => {
      const next = new Set(prev);
      if (next.has(dataViewId)) next.delete(dataViewId);
      else next.add(dataViewId);
      return next;
    });
  };

  const toggleAsset = (assetId: string) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const selectAllInCategory = (categoryId: string) => {
    const assets = categoryStates[categoryId]?.assets || [];
    setSelectedAssets(prev => {
      const next = new Set(prev);
      assets.forEach(a => next.add(a.id));
      return next;
    });
  };

  const deselectAllInCategory = (categoryId: string) => {
    const assets = categoryStates[categoryId]?.assets || [];
    setSelectedAssets(prev => {
      const next = new Set(prev);
      assets.forEach(a => next.delete(a.id));
      return next;
    });
  };

  const selectAllInProperty = (property: LaunchPropertyHierarchy) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      next.add(property.property.id);
      property.extensions.forEach(a => next.add(a.id));
      property.dataElements.forEach(a => next.add(a.id));
      property.rules.forEach(a => next.add(a.id));
      return next;
    });
  };

  const deselectAllInProperty = (property: LaunchPropertyHierarchy) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      next.delete(property.property.id);
      property.extensions.forEach(a => next.delete(a.id));
      property.dataElements.forEach(a => next.delete(a.id));
      property.rules.forEach(a => next.delete(a.id));
      return next;
    });
  };

  const getPropertySelectedCount = (property: LaunchPropertyHierarchy) => {
    let count = 0;
    if (selectedAssets.has(property.property.id)) count++;
    property.extensions.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    property.dataElements.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    property.rules.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    return count;
  };

  const getPropertyTotalCount = (property: LaunchPropertyHierarchy) => {
    return 1 + property.extensions.length + property.dataElements.length + property.rules.length;
  };

  // CJA helper functions
  const selectAllInConnection = (connection: CJAConnectionHierarchy) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      next.add(connection.connection.id);
      connection.dataViews.forEach(dv => {
        next.add(dv.id);
        dv.segments.forEach(a => next.add(a.id));
        dv.filters.forEach(a => next.add(a.id));
        dv.calculatedMetrics.forEach(a => next.add(a.id));
      });
      return next;
    });
  };

  const deselectAllInConnection = (connection: CJAConnectionHierarchy) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      next.delete(connection.connection.id);
      connection.dataViews.forEach(dv => {
        next.delete(dv.id);
        dv.segments.forEach(a => next.delete(a.id));
        dv.filters.forEach(a => next.delete(a.id));
        dv.calculatedMetrics.forEach(a => next.delete(a.id));
      });
      return next;
    });
  };

  const selectAllInDataView = (dataView: CJAConnectionHierarchy['dataViews'][0]) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      next.add(dataView.id);
      dataView.segments.forEach(a => next.add(a.id));
      dataView.filters.forEach(a => next.add(a.id));
      dataView.calculatedMetrics.forEach(a => next.add(a.id));
      return next;
    });
  };

  const deselectAllInDataView = (dataView: CJAConnectionHierarchy['dataViews'][0]) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      next.delete(dataView.id);
      dataView.segments.forEach(a => next.delete(a.id));
      dataView.filters.forEach(a => next.delete(a.id));
      dataView.calculatedMetrics.forEach(a => next.delete(a.id));
      return next;
    });
  };

  const getConnectionSelectedCount = (connection: CJAConnectionHierarchy) => {
    let count = 0;
    if (selectedAssets.has(connection.connection.id)) count++;
    connection.dataViews.forEach(dv => {
      if (selectedAssets.has(dv.id)) count++;
      dv.segments.forEach(a => { if (selectedAssets.has(a.id)) count++; });
      dv.filters.forEach(a => { if (selectedAssets.has(a.id)) count++; });
      dv.calculatedMetrics.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    });
    return count;
  };

  const getConnectionTotalCount = (connection: CJAConnectionHierarchy) => {
    let count = 1; // connection itself
    connection.dataViews.forEach(dv => {
      count += 1 + dv.segments.length + dv.filters.length + dv.calculatedMetrics.length;
    });
    return count;
  };

  const getDataViewSelectedCount = (dataView: CJAConnectionHierarchy['dataViews'][0]) => {
    let count = 0;
    if (selectedAssets.has(dataView.id)) count++;
    dataView.segments.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    dataView.filters.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    dataView.calculatedMetrics.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    return count;
  };

  const getDataViewTotalCount = (dataView: CJAConnectionHierarchy['dataViews'][0]) => {
    return 1 + dataView.segments.length + dataView.filters.length + dataView.calculatedMetrics.length;
  };

  const getTotalAssetCount = () => {
    let count = Object.values(categoryStates).reduce((acc, s) => acc + s.assets.length, 0);
    launchState.properties.forEach(p => {
      count += 1 + p.extensions.length + p.dataElements.length + p.rules.length;
    });
    // Use flat CJA data
    const cja = cjaFlatState.data;
    count += cja.connections.length + cja.dataViews.length + cja.segments.length + cja.filters.length + cja.calculatedMetrics.length + cja.projects.length;
    return count;
  };

  // CJA Flat Section Helpers
  const selectAllInCJACategory = (assets: Asset[]) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      assets.forEach(a => next.add(a.id));
      return next;
    });
  };

  const deselectAllInCJACategory = (assets: Asset[]) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      assets.forEach(a => next.delete(a.id));
      return next;
    });
  };

  const getCJACategorySelectedCount = (assets: Asset[]) => {
    return assets.filter(a => selectedAssets.has(a.id)).length;
  };

  const getLoadedCategoryCount = () => {
    let count = Object.values(categoryStates).filter(s => s.status === 'success' || s.status === 'error').length;
    if (launchState.status === 'success' || launchState.status === 'error') count++;
    if (cjaState.status === 'success' || cjaState.status === 'error') count++;
    return count;
  };

  const getTotalCategoryCount = () => {
    return aepCategories.length + 2; // AEP + Launch + CJA
  };

  // Export to CSV
  const handleExportCSV = async (exportType: string, categoryLabel: string) => {
    if (!sourceOrgId) {
      toast.error('Please select an organization first');
      return;
    }

    try {
      toast.loading(`Exporting ${categoryLabel}...`, { id: 'export-csv' });

      const response = await fetch(`/api/export/csv?orgId=${sourceOrgId}&type=${exportType}`);

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      // Get the CSV content
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${categoryLabel}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`${categoryLabel} exported successfully`, { id: 'export-csv' });
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(`Failed to export: ${error.message}`, { id: 'export-csv' });
    }
  };

  const handleContinue = () => {
    if (selectedAssets.size === 0) {
      toast.error('Please select at least one asset to migrate');
      return;
    }
    onNext(Array.from(selectedAssets), { conflictStrategy });
  };

  const renderCategoryStatus = (status: LoadingState, count?: number) => {
    switch (status) {
      case 'idle':
        return <span className="text-gray-400 text-sm">Waiting...</span>;
      case 'loading':
        return (
          <span className="flex items-center text-adobe-red text-sm">
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            Loading...
          </span>
        );
      case 'success':
        return (
          <span className="flex items-center text-green-600 text-sm">
            <CheckCircle className="w-4 h-4 mr-1" />
            {count !== undefined ? `${count} found` : 'Loaded'}
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center text-red-500 text-sm">
            <AlertTriangle className="w-4 h-4 mr-1" />
            Failed
          </span>
        );
    }
  };

  const renderAssetList = (assets: Asset[], categoryId: string, showSearch = true) => {
    const filteredAssets = filterAssets(assets, categoryId);

    return (
      <div>
        {showSearch && assets.length > 5 && (
          <SearchBar
            categoryId={categoryId}
            placeholder={`Search ${assets.length} items...`}
            value={searchTerms[categoryId] || ''}
            onChange={(value) => updateSearch(categoryId, value)}
            onClear={() => clearSearch(categoryId)}
          />
        )}
        <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
          {filteredAssets.length === 0 ? (
            <div className="px-6 py-3 text-sm text-gray-500 text-center">
              {searchTerms[categoryId] ? 'No matching items found' : 'No items'}
            </div>
          ) : (
            filteredAssets.map((asset) => (
              <label
                key={asset.id}
                className="flex items-center px-6 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedAssets.has(asset.id)}
                  onChange={() => toggleAsset(asset.id)}
                  className="w-4 h-4 text-adobe-red rounded focus:ring-adobe-red"
                />
                <span className="ml-3 flex-1 text-gray-900 text-sm">{asset.name}</span>
              </label>
            ))
          )}
        </div>
        {searchTerms[categoryId] && filteredAssets.length > 0 && (
          <div className="px-4 py-1 bg-gray-50 text-xs text-gray-500 border-t border-gray-100">
            Showing {filteredAssets.length} of {assets.length} items
          </div>
        )}
      </div>
    );
  };

  // Render CJA asset list with additional details
  const renderCJAAssetList = (assets: Asset[], categoryId: string, showParentInfo: 'connection' | 'dataView' | 'none' = 'none') => {
    const filteredAssets = filterAssets(assets, categoryId);
    const isDataViewCategory = categoryId === 'cjaDataViews';

    const formatDate = (dateStr?: string) => {
      if (!dateStr) return '';
      try {
        return new Date(dateStr).toLocaleDateString();
      } catch {
        return dateStr;
      }
    };

    return (
      <div>
        {assets.length > 5 && (
          <SearchBar
            categoryId={categoryId}
            placeholder={`Search ${assets.length} items...`}
            value={searchTerms[categoryId] || ''}
            onChange={(value) => updateSearch(categoryId, value)}
            onClear={() => clearSearch(categoryId)}
          />
        )}
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {filteredAssets.length === 0 ? (
            <div className="px-6 py-3 text-sm text-gray-500 text-center">
              {searchTerms[categoryId] ? 'No matching items found' : 'No items'}
            </div>
          ) : (
            filteredAssets.map((asset) => {
              const isDetailsExpanded = expandedDataViewDetails.has(asset.id);

              return (
                <div key={asset.id} className="border-b border-gray-100 last:border-b-0">
                  <label className="flex items-start px-6 py-3 hover:bg-gray-50 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedAssets.has(asset.id)}
                      onChange={() => toggleAsset(asset.id)}
                      className="w-4 h-4 mt-1 text-adobe-red rounded focus:ring-adobe-red"
                    />
                    <div className="ml-3 flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 text-sm truncate">{asset.name}</span>
                        <div className="flex items-center gap-2">
                          {asset.owner && (
                            <span className="text-xs text-gray-400 flex-shrink-0">by {asset.owner}</span>
                          )}
                          {isDataViewCategory && asset.type === 'cjaDataView' && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                toggleDataViewDetails(asset.id);
                              }}
                              className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                            >
                              {isDetailsExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              Details
                            </button>
                          )}
                        </div>
                      </div>
                      {asset.description && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{asset.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        {showParentInfo === 'dataView' && asset.dataViewName && (
                          <span className="flex items-center">
                            <LayoutDashboard className="w-3 h-3 mr-1" />
                            {asset.dataViewName}
                          </span>
                        )}
                        {showParentInfo === 'connection' && asset.connectionName && (
                          <span className="flex items-center">
                            <Link className="w-3 h-3 mr-1" />
                            {asset.connectionName}
                          </span>
                        )}
                        {asset.datasetsCount !== undefined && (
                          <span>{asset.datasetsCount} datasets</span>
                        )}
                        {asset.type === 'cjaDataView' && (
                          <>
                            {asset.dimensionsCount !== undefined && (
                              <span>{asset.dimensionsCount} dimensions</span>
                            )}
                            {asset.metricsCount !== undefined && (
                              <span>{asset.metricsCount} metrics</span>
                            )}
                          </>
                        )}
                        {asset.modifiedDate && (
                          <span>Modified: {formatDate(asset.modifiedDate)}</span>
                        )}
                        {asset.tags && asset.tags.length > 0 && (
                          <span className="flex items-center gap-1">
                            {asset.tags.slice(0, 2).map((tag, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">
                                {String(tag)}
                              </span>
                            ))}
                            {asset.tags.length > 2 && <span>+{asset.tags.length - 2}</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>

                  {/* Data View Details Section */}
                  {isDataViewCategory && isDetailsExpanded && asset.type === 'cjaDataView' && asset.components && (
                    <div className="px-6 pb-4 bg-gray-50 border-t border-gray-200">
                      <div className="mt-3 space-y-3">
                        {/* Configuration Section */}
                        <div className="bg-white rounded p-3 border border-gray-200">
                          <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                            <Settings className="w-3 h-3 mr-1" />
                            Configuration
                          </h4>
                          <div className="space-y-1 text-xs text-gray-600">
                            {asset.timezoneDesignator && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Timezone:</span>
                                <span className="font-medium">{asset.timezoneDesignator}</span>
                              </div>
                            )}
                            {asset.sessionDefinition && (
                              <div className="flex justify-between">
                                <span className="text-gray-500">Session Timeout:</span>
                                <span className="font-medium">
                                  {asset.sessionDefinition.sessionTimeout}{' '}
                                  {typeof asset.sessionDefinition.sessionTimeoutUnit === 'string'
                                    ? asset.sessionDefinition.sessionTimeoutUnit.toLowerCase()
                                    : asset.sessionDefinition.sessionTimeoutUnit?.name?.toLowerCase() || 'minutes'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Components Section */}
                        <div className="bg-white rounded p-3 border border-gray-200">
                          <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                            <Layers className="w-3 h-3 mr-1" />
                            Components
                          </h4>
                          <div className="space-y-2">
                            {/* Dimensions */}
                            {asset.components?.dimensions && asset.components.dimensions.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">
                                  Dimensions ({asset.components.dimensions.length})
                                </div>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                  {asset.components.dimensions.slice(0, 10).map((dim: any, idx: number) => (
                                    <div key={idx} className="text-xs text-gray-700 px-2 py-1 bg-blue-50 rounded flex justify-between">
                                      <span className="truncate">
                                        {typeof dim === 'string' ? dim : (typeof dim?.name === 'string' ? dim.name : dim?.name?.name || 'Unnamed')}
                                      </span>
                                      {dim.schemaPath && typeof dim.schemaPath === 'string' && (
                                        <span className="text-gray-400 text-xs ml-2 flex-shrink-0">
                                          {dim.schemaPath.split('.').pop()}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                  {asset.components.dimensions.length > 10 && (
                                    <div className="text-xs text-gray-500 text-center py-1">
                                      +{asset.components.dimensions.length - 10} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Metrics */}
                            {asset.components?.metrics && asset.components.metrics.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">
                                  Metrics ({asset.components.metrics.length})
                                </div>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                  {asset.components.metrics.slice(0, 10).map((metric: any, idx: number) => (
                                    <div key={idx} className="text-xs text-gray-700 px-2 py-1 bg-green-50 rounded flex justify-between">
                                      <span className="truncate">
                                        {typeof metric === 'string' ? metric : (typeof metric?.name === 'string' ? metric.name : metric?.name?.name || 'Unnamed metric')}
                                      </span>
                                      {metric?.format?.type && typeof metric.format.type === 'string' && (
                                        <span className="text-gray-400 text-xs ml-2 flex-shrink-0">
                                          {metric.format.type}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                  {asset.components.metrics.length > 10 && (
                                    <div className="text-xs text-gray-500 text-center py-1">
                                      +{asset.components.metrics.length - 10} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Derived Fields */}
                            {asset.components?.derivedFields && asset.components.derivedFields.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-1">
                                  Derived Fields ({asset.components.derivedFields.length})
                                </div>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                  {asset.components.derivedFields.slice(0, 10).map((field: any, idx: number) => (
                                    <div key={idx} className="text-xs text-gray-700 px-2 py-1 bg-purple-50 rounded">
                                      {typeof field === 'string' ? field : (typeof field?.name === 'string' ? field.name : field?.name?.name || 'Unnamed field')}
                                    </div>
                                  ))}
                                  {asset.components.derivedFields.length > 10 && (
                                    <div className="text-xs text-gray-500 text-center py-1">
                                      +{asset.components.derivedFields.length - 10} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {searchTerms[categoryId] && filteredAssets.length > 0 && (
          <div className="px-4 py-1 bg-gray-50 text-xs text-gray-500 border-t border-gray-100">
            Showing {filteredAssets.length} of {assets.length} items
          </div>
        )}
      </div>
    );
  };

  // Dependency Note Component
  const DependencyNote = ({ icon: Icon, type, message }: { icon: React.ComponentType<{ className?: string }>, type: 'warning' | 'info', message: string }) => (
    <div className={clsx(
      "px-4 py-2 border-b flex items-start gap-2 text-sm",
      type === 'warning' ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-blue-50 border-blue-200 text-blue-800"
    )}>
      <Icon className={clsx("w-4 h-4 mt-0.5 flex-shrink-0", type === 'warning' ? "text-amber-500" : "text-blue-500")} />
      <span>{message}</span>
    </div>
  );

  // Check if data views are orphaned (no connections exist)
  const hasOrphanedDataViews = cjaFlatState.data.connections.length === 0 && cjaFlatState.data.dataViews.length > 0;

  // CJA Category definitions for separate sections
  const cjaCategories = [
    {
      id: 'cjaConnections',
      label: 'CJA Connections',
      icon: Link,
      assets: cjaFlatState.data.connections,
      parentInfo: 'none' as const,
      note: {
        type: 'warning' as const,
        message: cjaFlatState.data.connections.length === 0
          ? 'No connections found. This organization may not have CJA connections configured, or you may lack permissions to view them.'
          : 'Connections require linked AEP Datasets to exist in the target organization. Ensure datasets are migrated first.',
      },
      emptyNote: 'No CJA connections found in source organization. Check if connections exist or if API permissions are configured.',
    },
    {
      id: 'cjaDataViews',
      label: 'CJA Data Views',
      icon: LayoutDashboard,
      assets: cjaFlatState.data.dataViews,
      parentInfo: 'connection' as const,
      note: {
        type: (hasOrphanedDataViews ? 'info' : 'warning') as 'warning' | 'info',
        message: hasOrphanedDataViews
          ? 'These Data Views are standalone (not linked to any Connection). They can still be migrated but may require a Connection to be created first in the target.'
          : 'Data Views require their parent Connection to exist in the target organization. Migrate connections first.',
      },
    },
    {
      id: 'cjaSegments',
      label: 'CJA Segments',
      icon: Users,
      assets: cjaFlatState.data.segments,
      parentInfo: 'dataView' as const,
      note: {
        type: 'warning' as const,
        message: cjaFlatState.data.segments.length === 0
          ? 'No segments found. Segments in CJA are created within Data Views.'
          : 'Segments require their parent Data View to exist in the target. Component references will be mapped automatically.',
      },
    },
    {
      id: 'cjaFilters',
      label: 'CJA Filters',
      icon: Filter,
      assets: cjaFlatState.data.filters,
      parentInfo: 'dataView' as const,
      note: {
        type: 'warning' as const,
        message: cjaFlatState.data.filters.length === 0
          ? 'No filters found. Filters in CJA are reusable segment-like components.'
          : 'Filters require their parent Data View to exist in the target. Filter definitions will be transformed automatically.',
      },
    },
    {
      id: 'cjaCalculatedMetrics',
      label: 'CJA Calculated Metrics',
      icon: Calculator,
      assets: cjaFlatState.data.calculatedMetrics,
      parentInfo: 'dataView' as const,
      note: {
        type: 'warning' as const,
        message: cjaFlatState.data.calculatedMetrics.length === 0
          ? 'No calculated metrics found. Calculated metrics are custom metrics created from existing metrics.'
          : 'Calculated Metrics require their parent Data View to exist in the target. Metric formulas will be preserved.',
      },
    },
    {
      id: 'cjaProjects',
      label: 'CJA Projects',
      icon: BarChart3,
      assets: cjaFlatState.data.projects,
      parentInfo: 'dataView' as const,
      note: {
        type: 'warning' as const,
        message: cjaFlatState.data.projects.length === 0
          ? 'No projects found. Projects are Analysis Workspace workspaces containing visualizations and reports.'
          : 'Projects require their parent Data View to exist in the target. All panels, visualizations, and filters will be migrated.',
      },
    },
  ];

  // Export all assets function
  const handleExportAll = async () => {
    if (!sourceOrgId) {
      toast.error('Please select an organization first');
      return;
    }

    if (!aepLoadingComplete) {
      toast.error('Please wait for assets to finish loading');
      return;
    }

    const exportTypes = [
      { type: 'schemas', label: 'Schemas' },
      { type: 'datasets', label: 'Datasets' },
      { type: 'audiences', label: 'Audiences' },
      { type: 'cja-connections', label: 'CJA Connections' },
      { type: 'cja-dataviews', label: 'CJA Data Views' },
      { type: 'cja-segments', label: 'CJA Segments' },
      { type: 'cja-calculatedmetrics', label: 'CJA Calculated Metrics' },
      { type: 'cja-projects', label: 'CJA Projects' },
      { type: 'launch-properties', label: 'Launch Properties' },
      { type: 'launch-extensions', label: 'Launch Extensions' },
      { type: 'launch-dataelements', label: 'Launch Data Elements' },
      { type: 'launch-rules', label: 'Launch Rules' },
    ];

    toast.loading('Exporting all assets...', { id: 'export-all' });

    let successCount = 0;
    let failCount = 0;

    for (const { type, label } of exportTypes) {
      try {
        const response = await fetch(`/api/export/csv?orgId=${sourceOrgId}&type=${type}`);

        if (!response.ok) {
          throw new Error(`Export failed: ${response.statusText}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${label.replace(/\s+/g, '_')}_${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        successCount++;

        // Small delay between downloads to avoid browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        console.error(`Failed to export ${label}:`, error);
        failCount++;
      }
    }

    if (failCount === 0) {
      toast.success(`Successfully exported all ${successCount} asset types`, { id: 'export-all' });
    } else {
      toast.error(`Exported ${successCount} types, ${failCount} failed`, { id: 'export-all' });
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Assets to Migrate</h2>
          <p className="text-gray-600">Choose configurations to copy to the target organization.</p>
        </div>
        {aepLoadingComplete && (
          <button
            onClick={handleExportAll}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            <span className="font-medium">Export All to CSV</span>
          </button>
        )}
      </div>

      {/* Sandbox Info */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center">
            <span className="text-sm font-medium text-blue-800">Source Sandbox:</span>
            <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-900 rounded text-sm font-semibold">
              {sourceSandbox || 'N/A'}
            </span>
          </div>
          <div className="text-blue-300">→</div>
          <div className="flex items-center">
            <span className="text-sm font-medium text-blue-800">Target Sandbox:</span>
            <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-900 rounded text-sm font-semibold">
              {targetSandbox || 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center">
              {!aepLoadingComplete ? (
                <>
                  <Loader2 className="w-5 h-5 text-adobe-red animate-spin mr-2" />
                  <span className="text-gray-700">
                    Loading {aepCategories[currentAepIndex]?.label || 'assets'}...
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-gray-700">
                    AEP assets ready ({Object.values(categoryStates).reduce((acc, s) => acc + s.assets.length, 0)} items)
                  </span>
                  {(isLaunchLoading || isCjaLoading) && (
                    <span className="ml-3 flex items-center text-gray-500 text-sm">
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      {isLaunchLoading && isCjaLoading ? 'Launch & CJA loading...' : isLaunchLoading ? 'Launch loading...' : 'CJA loading...'}
                    </span>
                  )}
                </>
              )}
            </div>
            <span className="text-sm text-gray-500">
              {getLoadedCategoryCount()} / {getTotalCategoryCount()} categories
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${(getLoadedCategoryCount() / getTotalCategoryCount()) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Options */}
      <div className="card mb-6">
        <div className="card-body flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div>
              <label className="label">If asset exists in target</label>
              <select
                value={conflictStrategy}
                onChange={(e) => setConflictStrategy(e.target.value as any)}
                className="input w-48"
              >
                <option value="skip">Skip</option>
                <option value="overwrite">Overwrite</option>
                <option value="rename">Rename</option>
              </select>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            {selectedAssets.size} asset{selectedAssets.size !== 1 ? 's' : ''} selected
          </div>
        </div>
      </div>

      {/* AEP Asset Categories - Grouped */}
      {aepCategoryGroups.map((group) => {
        const groupColors: Record<string, { bg: string; border: string; text: string; icon: string }> = {
          blue: { bg: 'from-blue-50 to-indigo-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600' },
          purple: { bg: 'from-purple-50 to-pink-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'text-purple-600' },
          green: { bg: 'from-green-50 to-emerald-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-600' },
          orange: { bg: 'from-orange-50 to-amber-50', border: 'border-orange-200', text: 'text-orange-700', icon: 'text-orange-600' },
        };
        const colors = groupColors[group.color] || groupColors.blue;

        // Calculate group totals
        const groupAssetCount = group.categories.reduce((acc, cat) => acc + (categoryStates[cat.id]?.assets.length || 0), 0);
        const groupSelectedCount = group.categories.reduce((acc, cat) => {
          const assets = categoryStates[cat.id]?.assets || [];
          return acc + assets.filter(a => selectedAssets.has(a.id)).length;
        }, 0);

        return (
          <div key={group.id} className="mb-6">
            {/* Group Header */}
            <div className={`rounded-t-lg bg-gradient-to-r ${colors.bg} border ${colors.border} border-b-0 px-4 py-3`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={`font-semibold ${colors.text}`}>{group.label}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{group.description}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">{groupAssetCount} items</span>
                  {groupAssetCount > 0 && (
                    <span className="badge-info">{groupSelectedCount} selected</span>
                  )}
                </div>
              </div>
            </div>

            {/* Group Categories */}
            <div className={`border ${colors.border} border-t-0 rounded-b-lg overflow-hidden divide-y divide-gray-100`}>
              {group.categories.map((category) => {
                const state = categoryStates[category.id];
                const isExpanded = expandedCategories.has(category.id);
                const Icon = category.icon;
                const selectedCount = state.assets.filter(a => selectedAssets.has(a.id)).length;

                return (
                  <div key={category.id}>
                    <button
                      onClick={() => state.status === 'success' && toggleCategory(category.id)}
                      disabled={state.status !== 'success'}
                      className={clsx(
                        "w-full px-4 py-3 flex items-center justify-between transition-colors bg-white",
                        state.status === 'success' ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
                      )}
                    >
                      <div className="flex items-center">
                        {state.status === 'success' ? (
                          isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 mr-2" /> : <ChevronRight className="w-4 h-4 text-gray-400 mr-2" />
                        ) : <div className="w-4 h-4 mr-2" />}
                        <Icon className={`w-5 h-5 ${colors.icon} mr-3`} />
                        <span className="font-medium text-gray-900">{category.label}</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        {renderCategoryStatus(state.status, state.assets.length)}
                        {state.status === 'success' && state.assets.length > 0 && (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportCSV(category.apiType, category.label);
                              }}
                              className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                              title={`Export ${category.label} to CSV`}
                            >
                              <Download className="w-4 h-4 text-gray-600" />
                            </button>
                            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                              {selectedCount} / {state.assets.length}
                            </span>
                          </>
                        )}
                      </div>
                    </button>

                    {isExpanded && state.status === 'success' && (
                      <div className="border-t border-gray-100 bg-gray-50">
                        {state.assets.length === 0 ? (
                          <div className="p-4 text-center text-gray-500 text-sm">No {category.label.toLowerCase()} found</div>
                        ) : (
                          <>
                            <div className="px-6 py-2 bg-gray-100 flex justify-end space-x-2">
                              <button onClick={() => selectAllInCategory(category.id)} className="text-sm text-adobe-red hover:underline">Select All</button>
                              <span className="text-gray-300">|</span>
                              <button onClick={() => deselectAllInCategory(category.id)} className="text-sm text-gray-500 hover:underline">Deselect All</button>
                            </div>
                            {renderAssetList(state.assets, category.id)}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* CJA Section Header */}
      <div className="card overflow-hidden mb-3">
        <div className="card-header flex items-center justify-between bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center">
            <BarChart3 className="w-5 h-5 text-purple-600 mr-3" />
            <span className="font-semibold text-gray-900">Customer Journey Analytics (CJA)</span>
          </div>
          <div className="flex items-center space-x-3">
            {renderCategoryStatus(cjaFlatState.status)}
            {cjaFlatState.status === 'success' && (
              <span className="badge-info">
                {cjaFlatState.data.connections.length + cjaFlatState.data.dataViews.length + cjaFlatState.data.segments.length + cjaFlatState.data.filters.length + cjaFlatState.data.calculatedMetrics.length + cjaFlatState.data.projects.length} total items
              </span>
            )}
          </div>
        </div>
        {/* Orphaned Data Views Warning */}
        {cjaFlatState.status === 'success' && hasOrphanedDataViews && (
          <div className="px-4 py-3 bg-blue-50 border-t border-blue-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Standalone Data Views Detected</p>
              <p className="mt-1 text-blue-700">
                Found {cjaFlatState.data.dataViews.length} Data View(s) but no Connections.
                These Data Views are not linked to any Connection. To migrate them, you may need to create the Connection first in the target organization,
                or check if the source organization&apos;s Connection API permissions are configured correctly.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* CJA Separate Sections */}
      {cjaFlatState.status === 'success' && (
        <div className="space-y-3 mb-6">
          {cjaCategories.map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const Icon = category.icon;
            const selectedCount = getCJACategorySelectedCount(category.assets);

            return (
              <div key={category.id} className="card overflow-hidden">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full card-header flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-center">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400 mr-2" /> : <ChevronRight className="w-5 h-5 text-gray-400 mr-2" />}
                    <Icon className="w-5 h-5 text-purple-600 mr-3" />
                    <span className="font-medium text-gray-900">{category.label}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-sm text-gray-500">{category.assets.length} found</span>
                    {category.assets.length > 0 && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Map category ID to export type
                            const exportTypeMap: Record<string, string> = {
                              'cjaConnections': 'cja-connections',
                              'cjaDataViews': 'cja-dataviews',
                              'cjaSegments': 'cja-segments',
                              'cjaFilters': 'cja-segments', // Filters use same API as segments
                              'cjaCalculatedMetrics': 'cja-calculatedmetrics',
                              'cjaProjects': 'cja-projects'
                            };
                            handleExportCSV(exportTypeMap[category.id] || category.id, category.label);
                          }}
                          className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                          title={`Export ${category.label} to CSV`}
                        >
                          <Download className="w-4 h-4 text-gray-600" />
                        </button>
                        <span className="badge-info">{selectedCount} / {category.assets.length}</span>
                      </>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200">
                    {/* Dependency Warning Note */}
                    <DependencyNote
                      icon={AlertTriangle}
                      type={category.note.type}
                      message={category.note.message}
                    />

                    {category.assets.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-sm">No {category.label.toLowerCase()} found</div>
                    ) : (
                      <>
                        <div className="px-6 py-2 bg-gray-50 flex justify-end space-x-2 border-b border-gray-100">
                          <button onClick={() => selectAllInCJACategory(category.assets)} className="text-sm text-adobe-red hover:underline">Select All</button>
                          <span className="text-gray-300">|</span>
                          <button onClick={() => deselectAllInCJACategory(category.assets)} className="text-sm text-gray-500 hover:underline">Deselect All</button>
                        </div>
                        {renderCJAAssetList(category.assets, category.id, category.parentInfo)}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cjaFlatState.status === 'loading' && (
        <div className="card p-6 text-center mb-6">
          <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading CJA assets...</p>
        </div>
      )}

      {cjaFlatState.status === 'error' && (
        <div className="card p-6 text-center mb-6 bg-red-50 border-red-200">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-600">Failed to load CJA assets: {cjaFlatState.error}</p>
        </div>
      )}

      {/* Launch Section */}
      <div className="card overflow-hidden mt-6">
        <button
          onClick={() => launchState.status === 'success' && toggleCategory('launch')}
          disabled={launchState.status !== 'success'}
          className={clsx(
            "w-full card-header flex items-center justify-between transition-colors",
            launchState.status === 'success' ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
          )}
        >
          <div className="flex items-center">
            {launchState.status === 'success' ? (
              expandedCategories.has('launch') ? <ChevronDown className="w-5 h-5 text-gray-400 mr-2" /> : <ChevronRight className="w-5 h-5 text-gray-400 mr-2" />
            ) : <div className="w-5 h-5 mr-2" />}
            <Tag className="w-5 h-5 text-adobe-red mr-3" />
            <span className="font-medium text-gray-900">Launch</span>
          </div>
          <div className="flex items-center space-x-3">
            {renderCategoryStatus(launchState.status, launchState.properties.length)}
            {launchState.status === 'success' && (
              <span className="badge-info">{launchState.properties.length} properties</span>
            )}
          </div>
        </button>

        {expandedCategories.has('launch') && launchState.status === 'success' && (
          <div className="border-t border-gray-200">
            {launchState.properties.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">No Launch properties found</div>
            ) : (
              <div>
                {/* Search for properties */}
                {launchState.properties.length > 3 && (
                  <SearchBar
                    categoryId="launchProperties"
                    placeholder={`Search ${launchState.properties.length} properties...`}
                    value={searchTerms['launchProperties'] || ''}
                    onChange={(value) => updateSearch('launchProperties', value)}
                    onClear={() => clearSearch('launchProperties')}
                  />
                )}
                <div className="divide-y divide-gray-100">
                {launchState.properties
                  .filter(prop => {
                    const term = searchTerms['launchProperties']?.toLowerCase() || '';
                    if (!term) return true;
                    return prop.property.name.toLowerCase().includes(term);
                  })
                  .map((prop) => {
                  const isPropertyExpanded = expandedProperties.has(prop.property.id);
                  const propSelectedCount = getPropertySelectedCount(prop);
                  const propTotalCount = getPropertyTotalCount(prop);

                  return (
                    <div key={prop.property.id}>
                      {/* Property Header */}
                      <div className="flex items-center px-4 py-3 bg-gray-50 hover:bg-gray-100">
                        <button onClick={() => toggleProperty(prop.property.id)} className="flex items-center flex-1">
                          {isPropertyExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 mr-2" /> : <ChevronRight className="w-4 h-4 text-gray-400 mr-2" />}
                          <Package className="w-4 h-4 text-blue-600 mr-2" />
                          <span className="font-medium text-gray-900">{prop.property.name}</span>
                        </button>
                        <div className="flex items-center space-x-3">
                          <span className="text-xs text-gray-500">
                            {prop.extensions.length} ext, {prop.dataElements.length} de, {prop.rules.length} rules
                          </span>
                          <span className="badge-info text-xs">{propSelectedCount} / {propTotalCount}</span>
                          <button onClick={() => selectAllInProperty(prop)} className="text-xs text-adobe-red hover:underline">All</button>
                          <button onClick={() => deselectAllInProperty(prop)} className="text-xs text-gray-500 hover:underline">None</button>
                        </div>
                      </div>

                      {/* Property Contents */}
                      {isPropertyExpanded && (
                        <div className="pl-8 bg-white">
                          {/* Property checkbox */}
                          <label className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                            <input
                              type="checkbox"
                              checked={selectedAssets.has(prop.property.id)}
                              onChange={() => toggleAsset(prop.property.id)}
                              className="w-4 h-4 text-adobe-red rounded focus:ring-adobe-red"
                            />
                            <Package className="w-4 h-4 text-blue-600 ml-3 mr-2" />
                            <span className="text-sm text-gray-900 font-medium">Property: {prop.property.name}</span>
                          </label>

                          {/* Extensions */}
                          {prop.extensions.length > 0 && (
                            <div className="border-b border-gray-100">
                              <div className="px-4 py-2 bg-gray-50 flex items-center">
                                <Code className="w-4 h-4 text-purple-600 mr-2" />
                                <span className="text-sm font-medium text-gray-700">Extensions ({prop.extensions.length})</span>
                              </div>
                              {renderAssetList(prop.extensions, 'extensions')}
                            </div>
                          )}

                          {/* Data Elements */}
                          {prop.dataElements.length > 0 && (
                            <div className="border-b border-gray-100">
                              <div className="px-4 py-2 bg-gray-50 flex items-center">
                                <Database className="w-4 h-4 text-green-600 mr-2" />
                                <span className="text-sm font-medium text-gray-700">Data Elements ({prop.dataElements.length})</span>
                              </div>
                              {renderAssetList(prop.dataElements, 'dataElements')}
                            </div>
                          )}

                          {/* Rules */}
                          {prop.rules.length > 0 && (
                            <div>
                              <div className="px-4 py-2 bg-gray-50 flex items-center">
                                <Workflow className="w-4 h-4 text-orange-600 mr-2" />
                                <span className="text-sm font-medium text-gray-700">Rules ({prop.rules.length})</span>
                              </div>
                              {renderAssetList(prop.rules, 'rules')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
                {searchTerms['launchProperties'] && (
                  <div className="px-4 py-1 bg-gray-50 text-xs text-gray-500 border-t border-gray-100">
                    Showing {launchState.properties.filter(p => p.property.name.toLowerCase().includes(searchTerms['launchProperties']?.toLowerCase() || '')).length} of {launchState.properties.length} properties
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex justify-between">
        <button onClick={onBack} className="btn-secondary">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </button>
        <button onClick={handleContinue} className="btn-primary" disabled={!aepLoadingComplete}>
          {!aepLoadingComplete ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Loading AEP Assets...
            </>
          ) : (
            <>
              Continue to Migration
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
