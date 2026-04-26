'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Building2, ArrowRight, Check, AlertCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

interface OrgCredentials {
  clientId: string;
  clientSecret: string;
  orgId: string;
  sandboxName: string;
}

interface ValidatedOrg {
  id: string;
  orgId: string;
  orgName: string;
  sandboxName: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
}

export interface OrgConfig {
  id: string;
  orgId: string;
  orgName: string;
  sandboxName: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
}

interface OrganizationSetupProps {
  onComplete: (sourceOrg: OrgConfig, targetOrg: OrgConfig) => void;
}

export function OrganizationSetup({ onComplete }: OrganizationSetupProps) {
  const [activeTab, setActiveTab] = useState<'source' | 'target'>('source');
  const [sourceValidated, setSourceValidated] = useState(false);
  const [targetValidated, setTargetValidated] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [sourceOrgId, setSourceOrgId] = useState<string | null>(null);
  const [targetOrgId, setTargetOrgId] = useState<string | null>(null);
  const [sourceOrgInfo, setSourceOrgInfo] = useState<ValidatedOrg | null>(null);
  const [targetOrgInfo, setTargetOrgInfo] = useState<ValidatedOrg | null>(null);

  const sourceForm = useForm<OrgCredentials>({
    defaultValues: {
      clientId: '',
      clientSecret: '',
      orgId: '',
      sandboxName: '',
    },
  });

  const targetForm = useForm<OrgCredentials>({
    defaultValues: {
      clientId: '',
      clientSecret: '',
      orgId: '',
      sandboxName: '',
    },
  });

  const validateCredentials = async (
    data: OrgCredentials,
    type: 'source' | 'target'
  ) => {
    setIsValidating(true);

    try {
      const response = await fetch('/api/organizations/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, type }),
      });

      const result = await response.json();

      if (result.success) {
        const orgInfo: ValidatedOrg = {
          id: result.organizationId,
          orgId: data.orgId,
          orgName: result.orgName || data.orgId.split('@')[0],
          sandboxName: data.sandboxName,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
          accessToken: result.accessToken,
        };

        if (type === 'source') {
          setSourceValidated(true);
          setSourceOrgId(result.organizationId);
          setSourceOrgInfo(orgInfo);
          toast.success('Source organization connected');
          setActiveTab('target');
        } else {
          setTargetValidated(true);
          setTargetOrgId(result.organizationId);
          setTargetOrgInfo(orgInfo);
          toast.success('Target organization connected');
        }
      } else {
        // Show specific error messages based on the error type
        const errorMessage = result.error || 'Validation failed';
        if (errorMessage.includes('401') || errorMessage.toLowerCase().includes('unauthorized')) {
          toast.error('Invalid credentials. Please check your Client ID and Client Secret.');
        } else if (errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden')) {
          toast.error('Access denied. Please check your Organization ID and ensure you have the required permissions.');
        } else if (errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found')) {
          toast.error('Sandbox not found. Please verify the sandbox name exists in your organization.');
        } else if (errorMessage.includes('sandbox')) {
          toast.error('Invalid sandbox. Please check the sandbox name and try again.');
        } else {
          toast.error(errorMessage);
        }
      }
    } catch (error: any) {
      // Handle network errors and other exceptions
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        toast.error('Network error. Please check your internet connection and try again.');
      } else if (error.message) {
        toast.error(`Connection failed: ${error.message}`);
      } else {
        toast.error('Failed to connect. Please check your credentials and try again.');
      }
    } finally {
      setIsValidating(false);
    }
  };

  const handleContinue = () => {
    if (sourceOrgId && targetOrgId && sourceOrgInfo && targetOrgInfo) {
      onComplete(sourceOrgInfo, targetOrgInfo);
    }
  };

  const form = activeTab === 'source' ? sourceForm : targetForm;
  const isValidated = activeTab === 'source' ? sourceValidated : targetValidated;

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Configure Organizations
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Enter the credentials for your source and target Adobe organizations.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-6">
        <button
          onClick={() => setActiveTab('source')}
          className={clsx(
            'flex items-center px-4 py-2 rounded-lg font-medium transition-colors',
            activeTab === 'source'
              ? 'bg-adobe-red text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          )}
        >
          <Building2 className="w-4 h-4 mr-2" />
          Source Organization
          {sourceValidated && (
            <Check className="w-4 h-4 ml-2 text-green-400" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('target')}
          className={clsx(
            'flex items-center px-4 py-2 rounded-lg font-medium transition-colors',
            activeTab === 'target'
              ? 'bg-adobe-red text-white'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          )}
        >
          <Building2 className="w-4 h-4 mr-2" />
          Target Organization
          {targetValidated && (
            <Check className="w-4 h-4 ml-2 text-green-400" />
          )}
        </button>
      </div>

      {/* Form */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {activeTab === 'source' ? 'Source' : 'Target'} Organization Credentials
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Enter your Adobe Developer Console OAuth credentials
          </p>
        </div>

        <form
          onSubmit={form.handleSubmit((data) =>
            validateCredentials(data, activeTab)
          )}
          className="card-body space-y-4"
        >
          {/* Show validated org info */}
          {isValidated && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex items-center mb-2">
                <Check className="w-5 h-5 text-green-600 mr-2" />
                <span className="font-semibold text-green-800">Connected Successfully</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Organization:</span>
                  <p className="font-medium text-gray-900">
                    {activeTab === 'source' ? sourceOrgInfo?.orgName : targetOrgInfo?.orgName}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Sandbox:</span>
                  <p className="font-medium text-gray-900">
                    {activeTab === 'source' ? sourceOrgInfo?.sandboxName : targetOrgInfo?.sandboxName}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Org ID:</span>
                  <p className="font-mono text-xs text-gray-700">
                    {activeTab === 'source' ? sourceOrgInfo?.orgId : targetOrgInfo?.orgId}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isValidated && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Organization ID (IMS Org ID) <span className="text-red-500">*</span></label>
                  <input
                    {...form.register('orgId', {
                      required: 'Organization ID is required',
                      pattern: {
                        value: /^[A-F0-9]{16,32}@AdobeOrg$/i,
                        message: 'Invalid format. Should be like: XXXXXXXXXXXXXXXX@AdobeOrg'
                      }
                    })}
                    className={`input ${form.formState.errors.orgId ? 'border-red-500' : ''}`}
                    placeholder="XXXXXXXXXXXXXXXX@AdobeOrg"
                  />
                  {form.formState.errors.orgId && (
                    <p className="text-red-500 text-xs mt-1">{form.formState.errors.orgId.message}</p>
                  )}
                </div>

                <div>
                  <label className="label">Sandbox Name <span className="text-red-500">*</span></label>
                  <input
                    {...form.register('sandboxName', {
                      required: 'Sandbox name is required',
                      minLength: {
                        value: 1,
                        message: 'Sandbox name cannot be empty'
                      },
                      pattern: {
                        value: /^[a-zA-Z0-9_-]+$/,
                        message: 'Only letters, numbers, hyphens and underscores allowed'
                      }
                    })}
                    className={`input ${form.formState.errors.sandboxName ? 'border-red-500' : ''}`}
                    placeholder="e.g., prod, dev, aep-test"
                  />
                  {form.formState.errors.sandboxName && (
                    <p className="text-red-500 text-xs mt-1">{form.formState.errors.sandboxName.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Client ID <span className="text-red-500">*</span></label>
                <input
                  {...form.register('clientId', {
                    required: 'Client ID is required',
                    minLength: {
                      value: 10,
                      message: 'Client ID seems too short'
                    }
                  })}
                  className={`input ${form.formState.errors.clientId ? 'border-red-500' : ''}`}
                  placeholder="Enter your OAuth Client ID"
                />
                {form.formState.errors.clientId && (
                  <p className="text-red-500 text-xs mt-1">{form.formState.errors.clientId.message}</p>
                )}
              </div>

              <div>
                <label className="label">Client Secret <span className="text-red-500">*</span></label>
                <input
                  type="password"
                  {...form.register('clientSecret', {
                    required: 'Client Secret is required',
                    minLength: {
                      value: 10,
                      message: 'Client Secret seems too short'
                    }
                  })}
                  className={`input ${form.formState.errors.clientSecret ? 'border-red-500' : ''}`}
                  placeholder="Enter your OAuth Client Secret"
                />
                {form.formState.errors.clientSecret && (
                  <p className="text-red-500 text-xs mt-1">{form.formState.errors.clientSecret.message}</p>
                )}
              </div>
            </>
          )}

          {/* Info Box - only show when not validated */}
          {!isValidated && (
            <div className="flex items-start p-4 bg-blue-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">OAuth Server-to-Server Credentials Required</p>
                <p>
                  Create these credentials in{' '}
                  <a
                    href="https://developer.adobe.com/console"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Adobe Developer Console
                  </a>{' '}
                  with Experience Platform API access.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4">
            {!isValidated && (
              <button
                type="submit"
                disabled={isValidating}
                className="btn-primary"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect Organization
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Continue Button */}
      {sourceValidated && targetValidated && (
        <div className="mt-6 flex justify-end">
          <button onClick={handleContinue} className="btn-primary">
            Continue to Asset Selection
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        </div>
      )}
    </div>
  );
}
