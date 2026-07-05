'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import StepIndicator from '@/components/onboarding/StepIndicator';
import BusinessTypeSelect from '@/components/onboarding/BusinessTypeSelect';
import BasicDetails from '@/components/onboarding/steps/BasicDetails';
import CatalogSetup from '@/components/onboarding/steps/CatalogSetup';
import MenuSetup from '@/components/onboarding/steps/MenuSetup';
import ServicesSetup from '@/components/onboarding/steps/ServicesSetup';
import AssetsSetup from '@/components/onboarding/steps/AssetsSetup';
import StaffSetup from '@/components/onboarding/steps/StaffSetup';
import TablesSetup from '@/components/onboarding/steps/TablesSetup';
import WorkingHoursStep from '@/components/onboarding/steps/WorkingHours';
import WhatsAppConnect from '@/components/onboarding/steps/WhatsAppConnect';
import WalletRecharge from '@/components/onboarding/steps/WalletRecharge';
import Success from '@/components/onboarding/steps/Success';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import { ArrowLeft } from 'lucide-react';

const BASE_STEPS = [
  { key: 'business_type', labelKey: 'businessType' },
  { key: 'basic_details', labelKey: 'basicDetails' },
  { key: 'setup', labelKey: 'setup' },
  { key: 'connect', labelKey: 'connect' },
  { key: 'recharge', labelKey: 'recharge' },
  { key: 'success', labelKey: 'success' },
];

const STEP_CONFIGS: Record<string, { maxStep: number; steps: { key: string; labelKey: string }[] }> = {
  shop: {
    maxStep: 5,
    steps: [
      { key: 'business_type', labelKey: 'businessType' },
      { key: 'basic_details', labelKey: 'basicDetails' },
      { key: 'catalog', labelKey: 'setup' },
      { key: 'whatsapp', labelKey: 'connect' },
      { key: 'wallet', labelKey: 'recharge' },
      { key: 'success', labelKey: 'success' },
    ],
  },
  restaurant: {
    maxStep: 6,
    steps: [
      { key: 'business_type', labelKey: 'businessType' },
      { key: 'basic_details', labelKey: 'basicDetails' },
      { key: 'menu', labelKey: 'setup' },
      { key: 'tables', labelKey: 'setup' },
      { key: 'whatsapp', labelKey: 'connect' },
      { key: 'wallet', labelKey: 'recharge' },
      { key: 'success', labelKey: 'success' },
    ],
  },
  salon: {
    maxStep: 6,
    steps: [
      { key: 'business_type', labelKey: 'businessType' },
      { key: 'basic_details', labelKey: 'basicDetails' },
      { key: 'services', labelKey: 'setup' },
      { key: 'staff', labelKey: 'setup' },
      { key: 'whatsapp', labelKey: 'connect' },
      { key: 'wallet', labelKey: 'recharge' },
      { key: 'success', labelKey: 'success' },
    ],
  },
  turf: {
    maxStep: 6,
    steps: [
      { key: 'business_type', labelKey: 'businessType' },
      { key: 'basic_details', labelKey: 'basicDetails' },
      { key: 'assets', labelKey: 'setup' },
      { key: 'hours', labelKey: 'setup' },
      { key: 'whatsapp', labelKey: 'connect' },
      { key: 'wallet', labelKey: 'recharge' },
      { key: 'success', labelKey: 'success' },
    ],
  },
};

export default function OnboardingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const businessType = useOnboardingStore((s) => s.businessType);
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const loadFromStorage = useOnboardingStore((s) => s.loadFromStorage);
  const initializeFromBackend = useOnboardingStore((s) => s.initializeFromBackend);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // First try to restore from backend
      const result = await initializeFromBackend();
      if (cancelled) return;
      if (result.isComplete) {
        router.replace('/dashboard');
        return;
      }
      // If no backend data, fall back to local draft
      if (!result.shopId) {
        loadFromStorage();
      }
      setInitializing(false);
    })();
    return () => { cancelled = true; };
  }, [initializeFromBackend, loadFromStorage, router]);

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }

  // Step 0: Business type selection
  if (currentStep === 0) {
    return <BusinessTypeSelect />;
  }

  const config = businessType ? STEP_CONFIGS[businessType] : null;
  if (!config) return null;

  const steps = config.steps;
  const stepLabels = steps.map((s) => ({
    key: s.key,
    label: t.onboarding.stepIndicator[s.labelKey as keyof typeof t.onboarding.stepIndicator],
  }));

  // Map step index to component
  const renderStep = () => {
    const stepKey = steps[currentStep]?.key;

    switch (stepKey) {
      case 'basic_details':
        return <BasicDetails />;
      case 'catalog':
        return <CatalogSetup />;
      case 'menu':
        return <MenuSetup />;
      case 'services':
        return <ServicesSetup />;
      case 'assets':
        return <AssetsSetup />;
      case 'staff':
        return <StaffSetup />;
      case 'tables':
        return <TablesSetup />;
      case 'hours':
        return <WorkingHoursStep />;
      case 'whatsapp':
        return <WhatsAppConnect />;
      case 'wallet':
        return <WalletRecharge />;
      case 'success':
        return <Success />;
      default:
        return <BusinessTypeSelect />;
    }
  };

  const isLastStep = currentStep >= steps.length - 1;

  return (
    <div className="min-h-screen bg-background">
      {/* Progress bar */}
      <div className="w-full h-1 bg-gray-900 fixed top-16 left-0 z-40">
        <div
          className="h-full bg-gradient-to-r from-[#25D366] to-[#1da851] transition-all duration-500"
          style={{
            width: `${((currentStep + 1) / steps.length) * 100}%`,
          }}
        />
      </div>

      <div className="pt-20 pb-16 px-4">
        {/* Step indicator */}
        {currentStep > 0 && currentStep < steps.length - 1 && (
          <div className="max-w-3xl mx-auto mb-4">
            <StepIndicator steps={stepLabels} currentStep={currentStep} />
          </div>
        )}

        {/* Back button */}
        {currentStep > 1 && currentStep < steps.length - 1 && (
          <div className="max-w-3xl mx-auto mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={prevStep}
              className="text-gray-400"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t.common.back}
            </Button>
          </div>
        )}

        {/* Step content */}
        <div className="max-w-3xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
