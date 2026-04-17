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
  Check,
  Minus,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

// SearchBar component
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

// Section Checkbox Component
const SectionCheckbox = memo(function SectionCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={clsx(
        "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
        checked ? "bg-adobe-red border-adobe-red" : indeterminate ? "bg-adobe-red/50 border-adobe-red" : "border-gray-300 hover:border-adobe-red"
      )}
      title={label}
    >
      {checked && <Check className="w-3 h-3 text-white" />}
      {indeterminate && !checked && <Minus className="w-3 h-3 text-white" />}
    </button>
  );
});

interface Asset {
  id: string;
  name: string;
  type: string;
  dependencies?: string[];
  description?: string;
  owner?: string;
  createdDate?: string;
  modifiedDate?: string;
  tags?: string[];
  parentId?: string;
  parentName?: string;
  dataViewId?: string;
  dataViewName?: string;
  connectionId?: string;
  connectionName?: string;
  datasetsCount?: number;
  dimensionsCount?: number;
  metricsCount?: number;
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
  property: { id: string; name: string };
  extensions: Asset[];
  dataElements: Asset[];
  rules: Asset[];
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
type TabType = 'aep' | 'cja' | 'launch';

interface CategoryState {
  status: LoadingState;
  assets: Asset[];
  error?: string;
}

// AEP Categories
const aepCategories: AssetCategory[] = [
  { id: 'schemas', label: 'Schemas', icon: FileJson, apiType: 'schemas' },
  { id: 'fieldGroups', label: 'Field Groups', icon: Layers, apiType: 'fieldGroups' },
  { id: 'datasets', label: 'Datasets', icon: Database, apiType: 'datasets' },
  { id: 'identityNamespaces', label: 'Identity Namespaces', icon: Fingerprint, apiType: 'identityNamespaces' },
  { id: 'audiences', label: 'Audiences', icon: Users, apiType: 'audiences' },
  { id: 'mergePolicies', label: 'Merge Policies', icon: GitMerge, apiType: 'mergePolicies' },
  { id: 'computedAttributes', label: 'Computed Attributes', icon: Calculator, apiType: 'computedAttributes' },
  { id: 'connections', label: 'Connections', icon: Link, apiType: 'connections' },
  { id: 'dataFlows', label: 'Data Flows', icon: Activity, apiType: 'dataFlows' },
  { id: 'sandboxes', label: 'Sandboxes', icon: Box, apiType: 'sandboxes' },
  { id: 'dataUsageLabels', label: 'Data Usage Labels', icon: Tags, apiType: 'dataUsageLabels' },
  { id: 'governancePolicies', label: 'Governance Policies', icon: Shield, apiType: 'governancePolicies' },
];

// CJA Categories
const cjaCategoryDefs = [
  { id: 'cjaConnections', label: 'Connections', icon: Link, key: 'connections' as const },
  { id: 'cjaDataViews', label: 'Data Views', icon: LayoutDashboard, key: 'dataViews' as const },
  { id: 'cjaSegments', label: 'Segments', icon: Users, key: 'segments' as const },
  { id: 'cjaFilters', label: 'Filters', icon: Filter, key: 'filters' as const },
  { id: 'cjaCalculatedMetrics', label: 'Calculated Metrics', icon: Calculator, key: 'calculatedMetrics' as const },
  { id: 'cjaProjects', label: 'Projects', icon: BarChart3, key: 'projects' as const },
];

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
  const [activeTab, setActiveTab] = useState<TabType>('aep');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('schemas');
  const [conflictStrategy, setConflictStrategy] = useState<'skip' | 'overwrite' | 'rename'>('skip');
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});

  // AEP State
  const [categoryStates, setCategoryStates] = useState<Record<string, CategoryState>>(() => {
    const initial: Record<string, CategoryState> = {};
    aepCategories.forEach(cat => {
      initial[cat.id] = { status: 'idle', assets: [] };
    });
    return initial;
  });

  // Launch State
  const [launchState, setLaunchState] = useState<{
    status: LoadingState;
    properties: LaunchPropertyHierarchy[];
    error?: string;
  }>({ status: 'idle', properties: [] });

  // CJA State
  const [cjaFlatState, setCjaFlatState] = useState<{
    status: LoadingState;
    data: CJAFlatData;
    error?: string;
  }>({ status: 'idle', data: { connections: [], dataViews: [], segments: [], filters: [], calculatedMetrics: [], projects: [] } });

  const [currentAepIndex, setCurrentAepIndex] = useState(0);
  const [aepLoadingComplete, setAepLoadingComplete] = useState(false);
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());

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
          body: JSON.stringify({ credentials: sourceCredentials, type: category.apiType }),
        });
        if (!response.ok) throw new Error(`Failed to fetch ${category.label}`);
        const assets = await response.json() as Asset[];

        setCategoryStates(prev => ({
          ...prev,
          [category.id]: { status: 'success', assets }
        }));
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

  // Load CJA after AEP
  useEffect(() => {
    if (!aepLoadingComplete) return;

    const loadCjaFlatData = async () => {
      setCjaFlatState({ status: 'loading', data: { connections: [], dataViews: [], segments: [], filters: [], calculatedMetrics: [], projects: [] } });

      try {
        const response = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentials: sourceCredentials, type: 'cjaFlat' }),
        });
        if (!response.ok) throw new Error('Failed to fetch CJA data');
        const data = await response.json() as CJAFlatData;
        setCjaFlatState({ status: 'success', data });
      } catch (error) {
        setCjaFlatState({ status: 'error', data: { connections: [], dataViews: [], segments: [], filters: [], calculatedMetrics: [], projects: [] }, error: (error as Error).message });
      }
    };

    loadCjaFlatData();
  }, [aepLoadingComplete, sourceCredentials]);

  // Load Launch after AEP
  useEffect(() => {
    if (!aepLoadingComplete) return;

    const loadLaunchHierarchy = async () => {
      setLaunchState({ status: 'loading', properties: [] });

      try {
        const response = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credentials: sourceCredentials, type: 'launchHierarchy' }),
        });
        if (!response.ok) throw new Error('Failed to fetch Launch properties');
        const properties = await response.json() as LaunchPropertyHierarchy[];
        setLaunchState({ status: 'success', properties });
      } catch (error) {
        setLaunchState({ status: 'error', properties: [], error: (error as Error).message });
      }
    };

    loadLaunchHierarchy();
  }, [aepLoadingComplete, sourceCredentials]);

  // Helper functions
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

  const toggleAsset = (assetId: string) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const toggleCategory = (categoryId: string) => {
    setExpandedCategory(expandedCategory === categoryId ? null : categoryId);
  };

  const toggleProperty = (propertyId: string) => {
    setExpandedProperties(prev => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  };

  // Section selection helpers
  const selectAllInSection = (assets: Asset[]) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      assets.forEach(a => next.add(a.id));
      return next;
    });
  };

  const deselectAllInSection = (assets: Asset[]) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      assets.forEach(a => next.delete(a.id));
      return next;
    });
  };

  const toggleSection = (assets: Asset[]) => {
    const allSelected = assets.every(a => selectedAssets.has(a.id));
    if (allSelected) {
      deselectAllInSection(assets);
    } else {
      selectAllInSection(assets);
    }
  };

  const getSectionCheckState = (assets: Asset[]) => {
    if (assets.length === 0) return { checked: false, indeterminate: false };
    const selectedCount = assets.filter(a => selectedAssets.has(a.id)).length;
    return {
      checked: selectedCount === assets.length,
      indeterminate: selectedCount > 0 && selectedCount < assets.length,
    };
  };

  // Launch property helpers
  const getAllLaunchAssets = (prop: LaunchPropertyHierarchy) => {
    return [
      { id: prop.property.id, name: prop.property.name, type: 'launchProperty' },
      ...prop.extensions,
      ...prop.dataElements,
      ...prop.rules,
    ];
  };

  const toggleLaunchProperty = (prop: LaunchPropertyHierarchy) => {
    const assets = getAllLaunchAssets(prop);
    const allSelected = assets.every(a => selectedAssets.has(a.id));
    if (allSelected) {
      deselectAllInSection(assets);
    } else {
      selectAllInSection(assets);
    }
  };

  const getLaunchPropertyCheckState = (prop: LaunchPropertyHierarchy) => {
    const assets = getAllLaunchAssets(prop);
    return getSectionCheckState(assets);
  };

  // Count helpers
  const getAepTotalCount = () => Object.values(categoryStates).reduce((acc, s) => acc + s.assets.length, 0);
  const getAepSelectedCount = () => {
    let count = 0;
    Object.values(categoryStates).forEach(s => {
      s.assets.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    });
    return count;
  };

  const getCjaTotalCount = () => {
    const d = cjaFlatState.data;
    return d.connections.length + d.dataViews.length + d.segments.length + d.filters.length + d.calculatedMetrics.length + d.projects.length;
  };

  const getCjaSelectedCount = () => {
    const d = cjaFlatState.data;
    let count = 0;
    [...d.connections, ...d.dataViews, ...d.segments, ...d.filters, ...d.calculatedMetrics, ...d.projects].forEach(a => {
      if (selectedAssets.has(a.id)) count++;
    });
    return count;
  };

  const getLaunchTotalCount = () => {
    return launchState.properties.reduce((acc, p) => acc + 1 + p.extensions.length + p.dataElements.length + p.rules.length, 0);
  };

  const getLaunchSelectedCount = () => {
    let count = 0;
    launchState.properties.forEach(p => {
      if (selectedAssets.has(p.property.id)) count++;
      p.extensions.forEach(a => { if (selectedAssets.has(a.id)) count++; });
      p.dataElements.forEach(a => { if (selectedAssets.has(a.id)) count++; });
      p.rules.forEach(a => { if (selectedAssets.has(a.id)) count++; });
    });
    return count;
  };

  const handleContinue = () => {
    if (selectedAssets.size === 0) {
      toast.error('Please select at least one asset to migrate');
      return;
    }
    onNext(Array.from(selectedAssets), { conflictStrategy });
  };

  // Render status badge
  const renderStatus = (status: LoadingState, count?: number) => {
    switch (status) {
      case 'idle':
        return <span className="text-gray-400 text-xs">Waiting...</span>;
      case 'loading':
        return <Loader2 className="w-4 h-4 text-adobe-red animate-spin" />;
      case 'success':
        return <span className="text-green-600 text-xs font-medium">{count ?? 0}</span>;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
    }
  };

  // Render asset list
  const renderAssetList = (assets: Asset[], categoryId: string) => {
    const filteredAssets = filterAssets(assets, categoryId);

    return (
      <div className="max-h-64 overflow-y-auto">
        {assets.length > 5 && (
          <SearchBar
            categoryId={categoryId}
            placeholder={`Search ${assets.length} items...`}
            value={searchTerms[categoryId] || ''}
            onChange={(value) => updateSearch(categoryId, value)}
            onClear={() => clearSearch(categoryId)}
          />
        )}
        <div className="divide-y divide-gray-100">
          {filteredAssets.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              {searchTerms[categoryId] ? 'No matching items' : 'No items found'}
            </div>
          ) : (
            filteredAssets.map((asset) => (
              <label
                key={asset.id}
                className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedAssets.has(asset.id)}
                  onChange={() => toggleAsset(asset.id)}
                  className="w-4 h-4 text-adobe-red rounded focus:ring-adobe-red"
                />
                <span className="ml-3 flex-1 text-sm text-gray-900 truncate">{asset.name}</span>
                {asset.owner && <span className="text-xs text-gray-400 ml-2">{asset.owner}</span>}
              </label>
            ))
          )}
        </div>
      </div>
    );
  };

  // Tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'aep':
        return (
          <div className="space-y-1">
            {aepCategories.map((category) => {
              const state = categoryStates[category.id];
              const isExpanded = expandedCategory === category.id;
              const Icon = category.icon;
              const checkState = getSectionCheckState(state.assets);

              return (
                <div key={category.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    className={clsx(
                      "flex items-center px-4 py-3 cursor-pointer transition-colors",
                      isExpanded ? "bg-gray-100" : "bg-white hover:bg-gray-50"
                    )}
                    onClick={() => state.status === 'success' && toggleCategory(category.id)}
                  >
                    {state.status === 'success' && state.assets.length > 0 && (
                      <SectionCheckbox
                        checked={checkState.checked}
                        indeterminate={checkState.indeterminate}
                        onChange={() => toggleSection(state.assets)}
                        label={`Select all ${category.label}`}
                      />
                    )}
                    <div className="flex items-center flex-1 ml-3">
                      {state.status === 'success' ? (
                        isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 mr-2" /> : <ChevronRight className="w-4 h-4 text-gray-400 mr-2" />
                      ) : <div className="w-4 h-4 mr-2" />}
                      <Icon className="w-5 h-5 text-blue-600 mr-3" />
                      <span className="font-medium text-gray-900">{category.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {renderStatus(state.status, state.assets.length)}
                      {state.status === 'success' && state.assets.length > 0 && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {state.assets.filter(a => selectedAssets.has(a.id)).length}/{state.assets.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded && state.status === 'success' && state.assets.length > 0 && (
                    <div className="border-t border-gray-200 bg-gray-50">
                      {renderAssetList(state.assets, category.id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      case 'cja':
        if (cjaFlatState.status === 'loading') {
          return (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
              <span className="ml-3 text-gray-600">Loading CJA assets...</span>
            </div>
          );
        }

        if (cjaFlatState.status === 'error') {
          return (
            <div className="text-center py-12">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-600">{cjaFlatState.error}</p>
            </div>
          );
        }

        return (
          <div className="space-y-1">
            {cjaCategoryDefs.map((cat) => {
              const assets = cjaFlatState.data[cat.key];
              const isExpanded = expandedCategory === cat.id;
              const Icon = cat.icon;
              const checkState = getSectionCheckState(assets);

              return (
                <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    className={clsx(
                      "flex items-center px-4 py-3 cursor-pointer transition-colors",
                      isExpanded ? "bg-purple-50" : "bg-white hover:bg-gray-50"
                    )}
                    onClick={() => assets.length > 0 && toggleCategory(cat.id)}
                  >
                    {assets.length > 0 && (
                      <SectionCheckbox
                        checked={checkState.checked}
                        indeterminate={checkState.indeterminate}
                        onChange={() => toggleSection(assets)}
                        label={`Select all ${cat.label}`}
                      />
                    )}
                    <div className="flex items-center flex-1 ml-3">
                      {assets.length > 0 ? (
                        isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 mr-2" /> : <ChevronRight className="w-4 h-4 text-gray-400 mr-2" />
                      ) : <div className="w-4 h-4 mr-2" />}
                      <Icon className="w-5 h-5 text-purple-600 mr-3" />
                      <span className="font-medium text-gray-900">{cat.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-purple-600 text-xs font-medium">{assets.length}</span>
                      {assets.length > 0 && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                          {assets.filter(a => selectedAssets.has(a.id)).length}/{assets.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded && assets.length > 0 && (
                    <div className="border-t border-gray-200 bg-gray-50">
                      {renderAssetList(assets, cat.id)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );

      case 'launch':
        if (launchState.status === 'loading') {
          return (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-adobe-red animate-spin" />
              <span className="ml-3 text-gray-600">Loading Launch properties...</span>
            </div>
          );
        }

        if (launchState.status === 'error') {
          return (
            <div className="text-center py-12">
              <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-red-600">{launchState.error}</p>
            </div>
          );
        }

        if (launchState.properties.length === 0) {
          return (
            <div className="text-center py-12 text-gray-500">
              No Launch properties found
            </div>
          );
        }

        return (
          <div className="space-y-1">
            {launchState.properties.map((prop) => {
              const isExpanded = expandedProperties.has(prop.property.id);
              const checkState = getLaunchPropertyCheckState(prop);
              const totalCount = 1 + prop.extensions.length + prop.dataElements.length + prop.rules.length;
              const selectedCount = getAllLaunchAssets(prop).filter(a => selectedAssets.has(a.id)).length;

              return (
                <div key={prop.property.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    className={clsx(
                      "flex items-center px-4 py-3 cursor-pointer transition-colors",
                      isExpanded ? "bg-red-50" : "bg-white hover:bg-gray-50"
                    )}
                    onClick={() => toggleProperty(prop.property.id)}
                  >
                    <SectionCheckbox
                      checked={checkState.checked}
                      indeterminate={checkState.indeterminate}
                      onChange={() => toggleLaunchProperty(prop)}
                      label={`Select all in ${prop.property.name}`}
                    />
                    <div className="flex items-center flex-1 ml-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400 mr-2" /> : <ChevronRight className="w-4 h-4 text-gray-400 mr-2" />}
                      <Package className="w-5 h-5 text-adobe-red mr-3" />
                      <span className="font-medium text-gray-900">{prop.property.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {prop.extensions.length}E / {prop.dataElements.length}DE / {prop.rules.length}R
                      </span>
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {selectedCount}/{totalCount}
                      </span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50">
                      {/* Property itself */}
                      <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200">
                        <input
                          type="checkbox"
                          checked={selectedAssets.has(prop.property.id)}
                          onChange={() => toggleAsset(prop.property.id)}
                          className="w-4 h-4 text-adobe-red rounded"
                        />
                        <Package className="w-4 h-4 text-adobe-red ml-3 mr-2" />
                        <span className="text-sm font-medium text-gray-900">Property Configuration</span>
                      </label>

                      {/* Extensions */}
                      {prop.extensions.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-100 flex items-center justify-between">
                            <div className="flex items-center">
                              <Code className="w-4 h-4 text-purple-600 mr-2" />
                              <span className="text-sm font-medium text-gray-700">Extensions ({prop.extensions.length})</span>
                            </div>
                            <SectionCheckbox
                              checked={getSectionCheckState(prop.extensions).checked}
                              indeterminate={getSectionCheckState(prop.extensions).indeterminate}
                              onChange={() => toggleSection(prop.extensions)}
                            />
                          </div>
                          <div className="max-h-32 overflow-y-auto">
                            {prop.extensions.map(ext => (
                              <label key={ext.id} className="flex items-center px-6 py-1.5 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedAssets.has(ext.id)}
                                  onChange={() => toggleAsset(ext.id)}
                                  className="w-4 h-4 text-adobe-red rounded"
                                />
                                <span className="ml-3 text-sm text-gray-700 truncate">{ext.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Data Elements */}
                      {prop.dataElements.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-100 flex items-center justify-between border-t border-gray-200">
                            <div className="flex items-center">
                              <Database className="w-4 h-4 text-green-600 mr-2" />
                              <span className="text-sm font-medium text-gray-700">Data Elements ({prop.dataElements.length})</span>
                            </div>
                            <SectionCheckbox
                              checked={getSectionCheckState(prop.dataElements).checked}
                              indeterminate={getSectionCheckState(prop.dataElements).indeterminate}
                              onChange={() => toggleSection(prop.dataElements)}
                            />
                          </div>
                          <div className="max-h-32 overflow-y-auto">
                            {prop.dataElements.map(de => (
                              <label key={de.id} className="flex items-center px-6 py-1.5 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedAssets.has(de.id)}
                                  onChange={() => toggleAsset(de.id)}
                                  className="w-4 h-4 text-adobe-red rounded"
                                />
                                <span className="ml-3 text-sm text-gray-700 truncate">{de.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rules */}
                      {prop.rules.length > 0 && (
                        <div>
                          <div className="px-4 py-2 bg-gray-100 flex items-center justify-between border-t border-gray-200">
                            <div className="flex items-center">
                              <Workflow className="w-4 h-4 text-orange-600 mr-2" />
                              <span className="text-sm font-medium text-gray-700">Rules ({prop.rules.length})</span>
                            </div>
                            <SectionCheckbox
                              checked={getSectionCheckState(prop.rules).checked}
                              indeterminate={getSectionCheckState(prop.rules).indeterminate}
                              onChange={() => toggleSection(prop.rules)}
                            />
                          </div>
                          <div className="max-h-32 overflow-y-auto">
                            {prop.rules.map(rule => (
                              <label key={rule.id} className="flex items-center px-6 py-1.5 hover:bg-gray-100 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedAssets.has(rule.id)}
                                  onChange={() => toggleAsset(rule.id)}
                                  className="w-4 h-4 text-adobe-red rounded"
                                />
                                <span className="ml-3 text-sm text-gray-700 truncate">{rule.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Assets to Migrate</h2>
        <p className="text-gray-600">Choose configurations to copy to the target organization.</p>
      </div>

      {/* Sandbox Info */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-6">
        <div className="flex items-center">
          <span className="text-sm font-medium text-blue-800">Source:</span>
          <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-900 rounded text-sm font-semibold">
            {sourceSandbox || 'N/A'}
          </span>
        </div>
        <ArrowRight className="w-4 h-4 text-blue-400" />
        <div className="flex items-center">
          <span className="text-sm font-medium text-blue-800">Target:</span>
          <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-900 rounded text-sm font-semibold">
            {targetSandbox || 'N/A'}
          </span>
        </div>
      </div>

      {/* Progress */}
      {!aepLoadingComplete && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Loader2 className="w-4 h-4 text-adobe-red animate-spin mr-2" />
              <span className="text-sm text-gray-700">
                Loading {aepCategories[currentAepIndex]?.label || 'assets'}...
              </span>
            </div>
            <span className="text-xs text-gray-500">
              {currentAepIndex}/{aepCategories.length}
            </span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-adobe-red transition-all"
              style={{ width: `${(currentAepIndex / aepCategories.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Options Bar */}
      <div className="mb-4 p-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">If exists:</label>
            <select
              value={conflictStrategy}
              onChange={(e) => setConflictStrategy(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-adobe-red focus:border-adobe-red"
            >
              <option value="skip">Skip</option>
              <option value="overwrite">Overwrite</option>
              <option value="rename">Rename</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="font-semibold text-gray-900">{selectedAssets.size}</span>
          <span className="text-gray-500">selected</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex border-b border-gray-200">
        <button
          onClick={() => { setActiveTab('aep'); setExpandedCategory('schemas'); }}
          className={clsx(
            "px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            activeTab === 'aep'
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <Database className="w-4 h-4" />
          AEP
          <span className={clsx(
            "px-2 py-0.5 rounded-full text-xs",
            activeTab === 'aep' ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
          )}>
            {getAepSelectedCount()}/{getAepTotalCount()}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('cja'); setExpandedCategory('cjaConnections'); }}
          className={clsx(
            "px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            activeTab === 'cja'
              ? "border-purple-600 text-purple-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <BarChart3 className="w-4 h-4" />
          CJA
          {cjaFlatState.status === 'loading' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <span className={clsx(
              "px-2 py-0.5 rounded-full text-xs",
              activeTab === 'cja' ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
            )}>
              {getCjaSelectedCount()}/{getCjaTotalCount()}
            </span>
          )}
        </button>
        <button
          onClick={() => { setActiveTab('launch'); setExpandedCategory(null); }}
          className={clsx(
            "px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2",
            activeTab === 'launch'
              ? "border-red-600 text-red-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          <Tag className="w-4 h-4" />
          Launch
          {launchState.status === 'loading' ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <span className={clsx(
              "px-2 py-0.5 rounded-full text-xs",
              activeTab === 'launch' ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
            )}>
              {getLaunchSelectedCount()}/{getLaunchTotalCount()}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px] max-h-[500px] overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
        {renderTabContent()}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex justify-between">
        <button onClick={onBack} className="btn-secondary flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleContinue}
          className="btn-primary flex items-center gap-2"
          disabled={!aepLoadingComplete || selectedAssets.size === 0}
        >
          {!aepLoadingComplete ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              Continue to Migration ({selectedAssets.size})
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
