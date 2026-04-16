'use client';

import { useState } from 'react';
import { Header } from '@/components/common/Header';
import { Sidebar } from '@/components/common/Sidebar';
import { OrganizationSetup, OrgConfig } from '@/components/dashboard/OrganizationSetup';
import { AssetSelector } from '@/components/dashboard/AssetSelector';
import { MigrationProgress } from '@/components/dashboard/MigrationProgress';
import { ActivityLog } from '@/components/dashboard/ActivityLog';

type Step = 'setup' | 'select' | 'migrate' | 'complete';

export default function Home() {
  const [currentStep, setCurrentStep] = useState<Step>('setup');
  const [sourceOrgConfig, setSourceOrgConfig] = useState<OrgConfig | null>(null);
  const [targetOrgConfig, setTargetOrgConfig] = useState<OrgConfig | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [migrationOptions, setMigrationOptions] = useState<{
    conflictStrategy: 'skip' | 'overwrite' | 'rename';
  }>({ conflictStrategy: 'skip' });
  const [migrationJobId, setMigrationJobId] = useState<string | null>(null);

  const handleOrganizationsConfigured = (sourceOrg: OrgConfig, targetOrg: OrgConfig) => {
    setSourceOrgConfig(sourceOrg);
    setTargetOrgConfig(targetOrg);
    setCurrentStep('select');
  };

  const handleAssetsSelected = (assets: string[], options?: { conflictStrategy: 'skip' | 'overwrite' | 'rename' }) => {
    setSelectedAssets(assets);
    if (options) {
      setMigrationOptions(options);
    }
    setCurrentStep('migrate');
  };

  const handleMigrationStarted = (jobId: string) => {
    setMigrationJobId(jobId);
  };

  const handleMigrationComplete = () => {
    setCurrentStep('complete');
  };

  const handleReset = () => {
    setCurrentStep('setup');
    setSourceOrgConfig(null);
    setTargetOrgConfig(null);
    setSelectedAssets([]);
    setMigrationJobId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <div className="flex">
        <Sidebar currentStep={currentStep} onStepClick={setCurrentStep} />

        <main className="flex-1 p-8">
          <div className="max-w-6xl mx-auto">
            {currentStep === 'setup' && (
              <OrganizationSetup onComplete={handleOrganizationsConfigured} />
            )}

            {currentStep === 'select' && sourceOrgConfig && targetOrgConfig && (
              <AssetSelector
                sourceOrgId={sourceOrgConfig.id}
                targetOrgId={targetOrgConfig.id}
                sourceSandbox={sourceOrgConfig.sandboxName}
                targetSandbox={targetOrgConfig.sandboxName}
                sourceCredentials={{
                  clientId: sourceOrgConfig.clientId,
                  clientSecret: sourceOrgConfig.clientSecret,
                  orgId: sourceOrgConfig.orgId,
                  sandboxName: sourceOrgConfig.sandboxName,
                  accessToken: sourceOrgConfig.accessToken,
                }}
                targetCredentials={{
                  clientId: targetOrgConfig.clientId,
                  clientSecret: targetOrgConfig.clientSecret,
                  orgId: targetOrgConfig.orgId,
                  sandboxName: targetOrgConfig.sandboxName,
                  accessToken: targetOrgConfig.accessToken,
                }}
                onBack={() => setCurrentStep('setup')}
                onNext={handleAssetsSelected}
              />
            )}

            {currentStep === 'migrate' && sourceOrgConfig && targetOrgConfig && (
              <MigrationProgress
                sourceOrgId={sourceOrgConfig.id}
                targetOrgId={targetOrgConfig.id}
                selectedAssets={selectedAssets}
                migrationOptions={migrationOptions}
                jobId={migrationJobId}
                sourceCredentials={{
                  clientId: sourceOrgConfig.clientId,
                  clientSecret: sourceOrgConfig.clientSecret,
                  orgId: sourceOrgConfig.orgId,
                  sandboxName: sourceOrgConfig.sandboxName,
                  accessToken: sourceOrgConfig.accessToken,
                }}
                targetCredentials={{
                  clientId: targetOrgConfig.clientId,
                  clientSecret: targetOrgConfig.clientSecret,
                  orgId: targetOrgConfig.orgId,
                  sandboxName: targetOrgConfig.sandboxName,
                  accessToken: targetOrgConfig.accessToken,
                }}
                onJobStarted={handleMigrationStarted}
                onComplete={handleMigrationComplete}
                onBack={() => setCurrentStep('select')}
              />
            )}

            {currentStep === 'complete' && migrationJobId && (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Migration Complete
                </h2>
                <p className="text-gray-600 mb-8">
                  Your configurations have been successfully migrated.
                </p>
                <div className="space-x-4">
                  <button onClick={handleReset} className="btn-primary">
                    Start New Migration
                  </button>
                  <button
                    onClick={() => setCurrentStep('migrate')}
                    className="btn-secondary"
                  >
                    View Details
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Activity Log Sidebar */}
        {migrationJobId && (
          <aside className="w-96 border-l border-gray-200 bg-white overflow-hidden">
            <ActivityLog jobId={migrationJobId} />
          </aside>
        )}
      </div>
    </div>
  );
}
