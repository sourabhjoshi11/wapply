'use client';

import { useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DURATION_OPTIONS } from '@/lib/utils';
import { onboardingApi } from '@/lib/api';
import { TURF_SEED_DATA } from '@/lib/seedData';
import type { Asset } from '@/types';
import type { SeedAsset } from '@/lib/seedData';
import SuggestedItems from './SuggestedItems';

const ASSET_TYPES = ['Turf', 'Room', 'Hall', 'Venue'] as const;

const assetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  capacity: z.coerce.number().min(1, 'Capacity must be > 0'),
  price_per_slot: z.coerce.number().min(1, 'Price must be > 0'),
  slot_duration: z.string().min(1, 'Duration is required'),
  advance_percentage: z.coerce.number().min(0).max(100).default(50),
});

type AssetForm = z.infer<typeof assetSchema>;

export default function AssetsSetup() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const assets = useOnboardingStore((s) => s.assets);
  const addAsset = useOnboardingStore((s) => s.addAsset);
  const removeAsset = useOnboardingStore((s) => s.removeAsset);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AssetForm>({
    resolver: zodResolver(assetSchema),
    defaultValues: { advance_percentage: 50 },
  });

  const onAdd = (data: AssetForm) => {
    addAsset(data as unknown as Asset);
    reset();
    setValue('advance_percentage', 50);
    toast.success('Asset added');
  };

  const assetNames = useMemo(
    () => new Set(assets.map((a) => a.name)),
    [assets],
  );

  const handleSuggestedConfirm = (selected: SeedAsset[]) => {
    let added = 0;
    const currentNames = new Set(assets.map((a) => a.name));
    for (const item of selected) {
      if (currentNames.has(item.name)) continue;
      addAsset({
        name: item.name,
        type: 'Turf',
        capacity: 10,
        price_per_slot: item.price_per_hour,
        slot_duration: 60,
        advance_percentage: 50,
      } as Asset);
      added++;
    }
    if (added > 0) {
      toast.success(`${added} assets added from suggestions`);
    } else {
      toast('All selected assets already in catalog');
    }
  };

  const proceed = async () => {
    if (assets.length === 0) {
      toast.error('Add at least 1 asset');
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (shopId) {
        await onboardingApi.saveAssets(shopId, assets as unknown as Record<string, unknown>[]);
      }
      nextStep();
    } catch {
      toast.error('Failed to save assets');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-3xl mx-auto"
    >
      <h2 className="text-2xl font-bold text-white mb-6">
        {t.onboarding.assetsSetup.title}
      </h2>

      <Tabs defaultValue="suggested" className="w-full">
        <TabsList className="w-full mb-6">
          <TabsTrigger value="suggested" className="flex-1">
            Suggested
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex-1">
            {t.onboarding.catalogSetup.manualTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suggested">
          <SuggestedItems
            items={TURF_SEED_DATA}
            onConfirm={handleSuggestedConfirm}
            type="asset"
            existingNames={assetNames}
          />
        </TabsContent>

        <TabsContent value="manual">

      <form onSubmit={handleSubmit(onAdd)} className="space-y-4 mb-8">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>{t.onboarding.assetsSetup.name} *</Label>
            <Input {...register('name')} placeholder="Turf A / Room 101" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.assetsSetup.type} *</Label>
            <Select onValueChange={(v) => setValue('type', v)} value={watch('type')}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                {ASSET_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && <p className="text-xs text-red-400">{errors.type.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.assetsSetup.capacity}</Label>
            <Input type="number" {...register('capacity')} placeholder="10" />
            {errors.capacity && <p className="text-xs text-red-400">{errors.capacity.message}</p>}
          </div>
        </div>

        <div className="grid sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>{t.onboarding.assetsSetup.pricePerSlot} *</Label>
            <Input type="number" {...register('price_per_slot')} placeholder="500" />
            {errors.price_per_slot && <p className="text-xs text-red-400">{errors.price_per_slot.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.assetsSetup.slotDuration} *</Label>
            <Select onValueChange={(v) => setValue('slot_duration', v)} value={watch('slot_duration')}>
              <SelectTrigger>
                <SelectValue placeholder="Duration" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.slot_duration && <p className="text-xs text-red-400">{errors.slot_duration.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.assetsSetup.advancePct}</Label>
            <Input type="number" {...register('advance_percentage')} />
            {errors.advance_percentage && <p className="text-xs text-red-400">{errors.advance_percentage.message}</p>}
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              + {t.onboarding.assetsSetup.addAsset}
            </Button>
          </div>
        </div>
      </form>

      <div className="space-y-2">
        {assets.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Add at least 1 asset</p>
        ) : (
          assets.map((a, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-800"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white">{a.name}</span>
                <Badge variant="outline">{a.type}</Badge>
                <span className="text-xs text-gray-500">₹{a.price_per_slot}/slot</span>
                {a.capacity > 0 && (
                  <span className="text-xs text-gray-500">👤 {a.capacity}</span>
                )}
              </div>
              <button
                onClick={() => removeAsset(i)}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={proceed} disabled={saving} size="lg">
          {saving ? 'Saving...' : t.onboarding.catalogSetup.proceed}
        </Button>
      </div>
      </TabsContent>
      </Tabs>
    </motion.div>
  );
}
