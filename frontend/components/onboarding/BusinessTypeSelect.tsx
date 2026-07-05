'use client';

import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import type { BusinessType } from '@/types';

const BUSINESS_TYPES: {
  type: BusinessType;
  icon: string;
  bgColor: string;
}[] = [
  { type: 'shop', icon: '🛒', bgColor: 'from-blue-500/10 to-blue-600/5' },
  { type: 'restaurant', icon: '🍽️', bgColor: 'from-orange-500/10 to-orange-600/5' },
  { type: 'salon', icon: '✂️', bgColor: 'from-pink-500/10 to-pink-600/5' },
  { type: 'turf', icon: '🏟️', bgColor: 'from-purple-500/10 to-purple-600/5' },
];

export default function BusinessTypeSelect() {
  const { t } = useTranslation();
  const setBusinessType = useOnboardingStore((s) => s.setBusinessType);
  const nextStep = useOnboardingStore((s) => s.nextStep);

  const handleSelect = (type: BusinessType) => {
    setBusinessType(type);
    nextStep();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pt-20">
      <div className="w-full max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t.onboarding.selectBusinessType.title}
          </h1>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4">
          {BUSINESS_TYPES.map((item, i) => {
            const labelKey = item.type as 'shop' | 'restaurant' | 'salon' | 'turf';
            const info = t.onboarding.selectBusinessType[labelKey];

            return (
              <motion.button
                key={item.type}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                onClick={() => handleSelect(item.type)}
                className="group relative overflow-hidden p-8 rounded-2xl border border-gray-800 bg-gray-900/50 hover:border-[#25D366]/50 hover:bg-gray-900/80 transition-all duration-300 text-left"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${item.bgColor} opacity-0 group-hover:opacity-100 transition-opacity duration-300`}
                />
                <div className="relative z-10">
                  <div className="text-5xl mb-4">{item.icon}</div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {info.title}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    {info.desc}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
