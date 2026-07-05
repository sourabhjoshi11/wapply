'use client';

import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface Step {
  key: string;
  label: string;
}

interface StepIndicatorProps {
  steps: Step[];
  currentStep: number;
}

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="w-full py-6">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {steps.map((step, i) => {
          const isCompleted = i < currentStep;
          const isCurrent = i === currentStep;

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all duration-300',
                    isCompleted
                      ? 'border-[#25D366] bg-[#25D366] text-white'
                      : isCurrent
                      ? 'border-[#25D366] text-[#25D366] bg-[#25D366]/10'
                      : 'border-gray-700 text-gray-500 bg-gray-800/50',
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    'text-xs mt-2 font-medium transition-colors hidden sm:block',
                    isCompleted || isCurrent ? 'text-[#25D366]' : 'text-gray-500',
                  )}
                >
                  {step.label}
                </span>
              </div>
              {/* Connector */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 transition-colors duration-300',
                    isCompleted ? 'bg-[#25D366]' : 'bg-gray-800',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
