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
import { Textarea } from '@/components/ui/textarea';
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
import { SALON_SEED_DATA } from '@/lib/seedData';
import type { Product } from '@/types';
import type { SeedService } from '@/lib/seedData';
import SuggestedItems from './SuggestedItems';

const serviceSchema = z.object({
  name: z.string().min(1, 'Service name is required'),
  price: z.coerce.number().min(1, 'Price must be > 0'),
  duration: z.string().min(1, 'Duration is required'),
  description: z.string().optional(),
});

type ServiceForm = z.infer<typeof serviceSchema>;

export default function ServicesSetup() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const products = useOnboardingStore((s) => s.products);
  const addProduct = useOnboardingStore((s) => s.addProduct);
  const removeProduct = useOnboardingStore((s) => s.removeProduct);
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
  } = useForm<ServiceForm>({
    resolver: zodResolver(serviceSchema),
  });

  const onAdd = (data: ServiceForm) => {
    addProduct(data as unknown as Product);
    reset();
    toast.success('Service added');
  };

  const productNames = useMemo(
    () => new Set(products.map((p) => p.name)),
    [products],
  );

  const handleSuggestedConfirm = (selected: SeedService[]) => {
    let added = 0;
    const currentNames = new Set(products.map((p) => p.name));
    for (const item of selected) {
      if (currentNames.has(item.name)) continue;
      addProduct({
        name: item.name,
        price: item.price,
        category: item.category,
        duration: String(item.duration),
        available: true,
      } as Product);
      added++;
    }
    if (added > 0) {
      toast.success(`${added} services added from suggestions`);
    } else {
      toast('All selected services already in catalog');
    }
  };

  const proceed = async () => {
    if (products.length === 0) {
      toast.error('Add at least 1 service');
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (shopId) {
        await onboardingApi.saveCatalog(shopId, products as unknown as Record<string, unknown>[]);
      }
      nextStep();
    } catch {
      toast.error('Failed to save services');
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
        {t.onboarding.servicesSetup.title}
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
            items={SALON_SEED_DATA}
            onConfirm={handleSuggestedConfirm}
            type="service"
            existingNames={productNames}
          />
        </TabsContent>

        <TabsContent value="manual">

      <form onSubmit={handleSubmit(onAdd)} className="space-y-4 mb-8">
        <div className="grid sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label>{t.onboarding.servicesSetup.name} *</Label>
            <Input {...register('name')} placeholder="Haircut" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.servicesSetup.price} *</Label>
            <Input type="number" {...register('price')} placeholder="499" />
            {errors.price && <p className="text-xs text-red-400">{errors.price.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.servicesSetup.duration} *</Label>
            <Select onValueChange={(v) => setValue('duration', v)} value={watch('duration')}>
              <SelectTrigger>
                <SelectValue placeholder="Duration" />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.duration && <p className="text-xs text-red-400">{errors.duration.message}</p>}
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              + {t.onboarding.servicesSetup.addService}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t.onboarding.servicesSetup.description}</Label>
          <Textarea {...register('description')} placeholder="Optional description" rows={2} />
        </div>
      </form>

      <div className="space-y-2">
        {products.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Add at least 1 service</p>
        ) : (
          products.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-800"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-white">{s.name}</span>
                <Badge variant="outline">₹{s.price}</Badge>
                {s.duration && (
                  <span className="text-xs text-gray-500">{s.duration} min</span>
                )}
              </div>
              <button
                onClick={() => removeProduct(i)}
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
