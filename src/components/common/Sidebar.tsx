'use client';

import { Building2, CheckSquare, Play, CheckCircle } from 'lucide-react';
import { clsx } from 'clsx';

type Step = 'setup' | 'select' | 'migrate' | 'complete';

interface SidebarProps {
  currentStep: Step;
  onStepClick: (step: Step) => void;
}

const steps = [
  {
    id: 'setup' as Step,
    label: 'Organization Setup',
    description: 'Configure source & target orgs',
    icon: Building2,
  },
  {
    id: 'select' as Step,
    label: 'Select Assets',
    description: 'Choose what to migrate',
    icon: CheckSquare,
  },
  {
    id: 'migrate' as Step,
    label: 'Migrate',
    description: 'Execute migration',
    icon: Play,
  },
  {
    id: 'complete' as Step,
    label: 'Complete',
    description: 'Review results',
    icon: CheckCircle,
  },
];

export function Sidebar({ currentStep, onStepClick }: SidebarProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <aside className="w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-h-[calc(100vh-4rem)]">
      <nav className="p-4">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
          Migration Steps
        </h2>

        <ul className="space-y-2">
          {steps.map((step, index) => {
            const isActive = step.id === currentStep;
            const isCompleted = index < currentIndex;
            const isDisabled = index > currentIndex;

            return (
              <li key={step.id}>
                <button
                  onClick={() => !isDisabled && onStepClick(step.id)}
                  disabled={isDisabled}
                  className={clsx(
                    'w-full flex items-start p-3 rounded-lg transition-colors text-left',
                    isActive &&
                      'bg-adobe-red/10 border border-adobe-red/20',
                    !isActive &&
                      !isDisabled &&
                      'hover:bg-gray-100 dark:hover:bg-gray-700',
                    isDisabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div
                    className={clsx(
                      'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3',
                      isActive && 'bg-adobe-red text-white',
                      isCompleted &&
                        'bg-green-500 text-white',
                      !isActive &&
                        !isCompleted &&
                        'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      <step.icon className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <p
                      className={clsx(
                        'font-medium text-sm',
                        isActive
                          ? 'text-adobe-red'
                          : 'text-gray-900 dark:text-white'
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {step.description}
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Help Section */}
      <div className="absolute bottom-0 left-0 w-72 p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
          <h3 className="font-medium text-sm text-gray-900 dark:text-white mb-1">
            Need Help?
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Check our documentation for detailed migration guides.
          </p>
          <a
            href="https://experienceleague.adobe.com/docs/experience-platform.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-adobe-red hover:underline"
          >
            View Documentation
          </a>
        </div>
      </div>
    </aside>
  );
}
