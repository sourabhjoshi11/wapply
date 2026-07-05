'use client';

import { useState, useMemo, useRef } from 'react';
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
import { Toggle } from '@/components/ui/toggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { onboardingApi } from '@/lib/api';
import { RESTAURANT_SEED_DATA } from '@/lib/seedData';
import type { Product } from '@/types';
import type { SeedProduct } from '@/lib/seedData';
import SuggestedItems from './SuggestedItems';

const MENU_CATEGORIES = [
  'Starters', 'Main Course', 'Breads', 'Rice',
  'Drinks', 'Desserts', 'Other',
];

const itemSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  price: z.coerce.number().min(1, 'Price must be > 0'),
  category: z.string().optional(),
  veg: z.boolean().default(true),
  available: z.boolean().default(true),
});

type ItemForm = z.infer<typeof itemSchema>;

export default function MenuSetup() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const products = useOnboardingStore((s) => s.products);
  const addProduct = useOnboardingStore((s) => s.addProduct);
  const removeProduct = useOnboardingStore((s) => s.removeProduct);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const [isVeg, setIsVeg] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ItemForm>({
    resolver: zodResolver(itemSchema),
    defaultValues: { veg: true, available: true },
  });

  const onAdd = (data: ItemForm) => {
    addProduct(data as unknown as Product);
    reset();
    setValue('veg', isVeg);
    toast.success('Item added');
  };

  const grouped = products.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const productNames = useMemo(
    () => new Set(products.map((p) => p.name)),
    [products],
  );

  const handleSuggestedConfirm = (selected: SeedProduct[]) => {
    let added = 0;
    const currentNames = new Set(products.map((p) => p.name));
    for (const item of selected) {
      if (currentNames.has(item.name)) continue;
      addProduct({
        name: item.name,
        price: item.price,
        category: item.category,
        available: true,
        veg: true,
      } as unknown as Product);
      added++;
    }
    if (added > 0) {
      toast.success(`${added} menu items added from suggestions`);
    } else {
      toast('All selected items already in menu');
    }
  };

  const proceed = async () => {
    if (products.length === 0) {
      toast.error('Add at least 1 menu item');
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
      toast.error('Failed to save menu');
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
        {t.onboarding.menuSetup.title}
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
            items={RESTAURANT_SEED_DATA}
            onConfirm={handleSuggestedConfirm}
            type="product"
            existingNames={productNames}
          />
        </TabsContent>

        <TabsContent value="manual">
          <form onSubmit={handleSubmit(onAdd)} className="space-y-4 mb-8">
        <div className="grid sm:grid-cols-5 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label>{t.onboarding.menuSetup.name} *</Label>
            <Input {...register('name')} placeholder="Item name" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.menuSetup.price} *</Label>
            <Input type="number" step="0.01" {...register('price')} placeholder="199" />
            {errors.price && <p className="text-xs text-red-400">{errors.price.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.menuSetup.category}</Label>
            <Select onValueChange={(v) => setValue('category', v)} value={watch('category')}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {MENU_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-1">
            <Toggle
              pressed={isVeg}
              onPressedChange={(p) => {
                setIsVeg(p);
                setValue('veg', p);
              }}
              className="h-10 px-3"
            >
              {isVeg ? '🥬 Veg' : '🍗 Non-Veg'}
            </Toggle>
            <Button type="submit" className="h-10">
              + {t.onboarding.menuSetup.addItem}
            </Button>
          </div>
        </div>
      </form>

      {/* Grouped menu */}
      <div className="space-y-4">
        {products.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Add at least 1 menu item</p>
        ) : (
          Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <h4 className="text-sm font-semibold text-gray-400 uppercase mb-2">{cat}</h4>
              {items.map((item, i) => {
                const globalIndex = products.indexOf(item);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-800 mb-1"
                  >
                    <div className="flex items-center gap-3">
                      <span>{item.veg ? '🥬' : '🍗'}</span>
                      <span className="text-sm font-medium text-white">{item.name}</span>
                      <Badge variant="outline">₹{item.price}</Badge>
                      {!item.available && (
                        <Badge variant="destructive">Not available</Badge>
                      )}
                    </div>
                    <button
                      onClick={() => removeProduct(globalIndex)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
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
