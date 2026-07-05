'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import toast from 'react-hot-toast';
import { Trash2, Upload, Download } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { productApi, onboardingApi } from '@/lib/api';
import { SHOP_SEED_DATA_BY_CATEGORY } from '@/lib/seedData';
import type { Product } from '@/types';
import type { SeedProduct } from '@/lib/seedData';
import SuggestedItems from './SuggestedItems';

const CATEGORIES = [
  'Groceries', 'Snacks', 'Beverages', 'Dairy', 'Bakery',
  'Medicines', 'Beauty', 'Household', 'Other',
];

const existingNames = (products: Product[]) => new Set(products.map((p) => p.name));

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  price: z.coerce.number().min(1, 'Price must be > 0'),
  category: z.string().optional(),
  available: z.boolean().default(true),
});

type ProductForm = z.infer<typeof productSchema>;

export default function CatalogSetup() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const basicDetails = useOnboardingStore((s) => s.basicDetails);
  const products = useOnboardingStore((s) => s.products);
  const addProduct = useOnboardingStore((s) => s.addProduct);
  const removeProduct = useOnboardingStore((s) => s.removeProduct);
  const setProducts = useOnboardingStore((s) => s.setProducts);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const [uploading, setUploading] = useState(false);
  const [csvData, setCsvData] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { available: true },
  });

  const onAddProduct = (data: ProductForm) => {
    addProduct(data as Product);
    reset();
    toast.success('Product added');
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter((l) => l.trim());
      const parsed: Product[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const cols = line.split(',').map((c) => c.trim());
        if (cols[0] && cols[1]) {
          parsed.push({
            name: cols[0],
            price: Number(cols[1]) || 0,
            category: cols[2] || 'Other',
            available: cols[3]?.toLowerCase() === 'true',
          });
        }
      }
      setCsvData(parsed);
      toast.success(`${parsed.length} products parsed from CSV`);
    };
    reader.readAsText(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
  });

  const uploadAll = async () => {
    if (!shopId) return;
    setUploading(true);
    try {
      await productApi.bulkCreate({
        shop_id: shopId,
        products: csvData as never[],
      });
      setProducts(csvData);
      toast.success('All products uploaded!');
      nextStep();
    } catch {
      toast.error('Failed to upload products');
    } finally {
      setUploading(false);
    }
  };

  const productNames = useMemo(() => existingNames(products), [products]);

  const category = basicDetails?.category || 'Kirana';
  const seedItems = SHOP_SEED_DATA_BY_CATEGORY[category] || null;

  const handleSuggestedConfirm = (selected: SeedProduct[]) => {
    let added = 0;
    const currentNames = existingNames(products);
    for (const item of selected) {
      if (currentNames.has(item.name)) continue;
      addProduct({
        name: item.name,
        price: item.price,
        category: item.category,
        available: true,
      } as Product);
      added++;
    }
    if (added > 0) {
      toast.success(`${added} products added from suggestions`);
    } else {
      toast('All selected items already in catalog');
    }
  };

  const proceed = async () => {
    if (products.length === 0) {
      toast.error(t.onboarding.catalogSetup.noProducts);
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
      toast.error('Failed to save catalog');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const downloadTemplate = () => {
    const csv = 'name,price,category,available\nBiscuit,10,Snacks,true\nCoke,20,Beverages,true\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-3xl mx-auto"
    >
      <h2 className="text-2xl font-bold text-white mb-6">
        {t.onboarding.catalogSetup.title}
      </h2>

      <Tabs defaultValue={seedItems ? 'suggested' : 'manual'} className="w-full">
        <TabsList className="w-full mb-6">
          {seedItems && (
            <TabsTrigger value="suggested" className="flex-1">
              Suggested
            </TabsTrigger>
          )}
          <TabsTrigger value="manual" className="flex-1">
            {t.onboarding.catalogSetup.manualTab}
          </TabsTrigger>
          <TabsTrigger value="csv" className="flex-1">
            {t.onboarding.catalogSetup.csvTab}
          </TabsTrigger>
        </TabsList>

        {seedItems && (
          <TabsContent value="suggested">
            <SuggestedItems
              items={seedItems}
              onConfirm={handleSuggestedConfirm}
              type="product"
              existingNames={productNames}
            />
          </TabsContent>
        )}

        <TabsContent value="manual">
          <form onSubmit={handleSubmit(onAddProduct)} className="space-y-4 mb-8">
            <div className="grid sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label>{t.onboarding.catalogSetup.name} *</Label>
                <Input {...register('name')} placeholder="Product name" />
                {errors.name && (
                  <p className="text-xs text-red-400">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>{t.onboarding.catalogSetup.price} *</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('price')}
                  placeholder="99"
                />
                {errors.price && (
                  <p className="text-xs text-red-400">{errors.price.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>{t.onboarding.catalogSetup.category}</Label>
                <Select onValueChange={(v) => setValue('category', v)} value={watch('category')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="submit" className="w-full">
                  + {t.onboarding.catalogSetup.addProduct}
                </Button>
              </div>
            </div>
          </form>

          {/* Products list */}
          <div className="space-y-2">
            {products.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                {t.onboarding.catalogSetup.noProducts}
              </p>
            ) : (
              products.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">{p.name}</span>
                    <Badge variant="outline">₹{p.price}</Badge>
                    {p.category && (
                      <span className="text-xs text-gray-500">{p.category}</span>
                    )}
                  </div>
                  <button
                    onClick={() => removeProduct(i)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="csv">
          <div className="space-y-6">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              {t.onboarding.catalogSetup.downloadTemplate}
            </Button>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                isDragActive
                  ? 'border-[#25D366] bg-[#25D366]/5'
                  : 'border-gray-700 hover:border-gray-600 bg-gray-900/30'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400">{t.onboarding.catalogSetup.dragDrop}</p>
            </div>

            {csvData.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white mb-2">
                  {t.onboarding.catalogSetup.csvPreview} ({csvData.length} items)
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {csvData.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2 rounded bg-gray-800/30 text-sm"
                    >
                      <span className="text-white">{item.name}</span>
                      <Badge variant="outline">₹{item.price}</Badge>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={uploadAll}
                  disabled={uploading}
                  className="w-full mt-4"
                >
                  {uploading ? 'Uploading...' : t.onboarding.catalogSetup.uploadAll}
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex justify-end">
        <Button onClick={proceed} disabled={saving} size="lg">
          {saving ? 'Saving...' : t.onboarding.catalogSetup.proceed}
        </Button>
      </div>
    </motion.div>
  );
}
