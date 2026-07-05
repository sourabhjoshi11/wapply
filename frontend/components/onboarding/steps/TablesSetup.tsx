'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { tableApi } from '@/lib/api';

export default function TablesSetup() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const tables = useOnboardingStore((s) => s.tables);
  const setTables = useOnboardingStore((s) => s.setTables);
  const nextStep = useOnboardingStore((s) => s.nextStep);

  const [count, setCount] = useState<number>(tables || 10);
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  const tableNumbers = useMemo(
    () => (generated ? Array.from({ length: count }, (_, i) => i + 1) : []),
    [count, generated],
  );

  const handleGenerate = async () => {
    if (count < 1 || count > 100) {
      toast.error('Enter a number between 1 and 100');
      return;
    }
    setGenerating(true);
    setGenerated(true);
    setTables(count);

    if (shopId) {
      try {
        await tableApi.batchCreate(shopId, count);
        toast.success(`${count} tables created`);
      } catch {
        toast.error('Failed to create tables on server');
      }
    }
    setGenerating(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-3xl mx-auto"
    >
      <h2 className="text-2xl font-bold text-white mb-6">
        {t.onboarding.tablesSetup.title}
      </h2>

      <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/30 mb-8">
        <Label className="text-lg mb-3 block">
          {t.onboarding.tablesSetup.question}
        </Label>
        <div className="flex items-center gap-4">
          <Input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="max-w-[120px]"
          />
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Creating...' : t.onboarding.tablesSetup.generate}
          </Button>
        </div>
      </div>

      {generated && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 mb-3">
            {t.onboarding.tablesSetup.preview} ({count} tables)
          </h3>
          <div className="grid grid-cols-5 sm:grid-cols-8 gap-3">
            {tableNumbers.map((num) => (
              <div
                key={num}
                className="aspect-square rounded-xl border border-gray-700 bg-gray-800/30 flex flex-col items-center justify-center gap-1 p-2"
              >
                <span className="text-lg font-bold text-white">T{num}</span>
                <Badge variant="outline" className="text-[8px] px-1 py-0">
                  QR
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 flex justify-end">
        <Button onClick={nextStep} size="lg">
          {t.onboarding.catalogSetup.proceed}
        </Button>
      </div>
    </motion.div>
  );
}
