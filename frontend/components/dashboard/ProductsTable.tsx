'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { InlineLoader } from '@/components/shared/LoadingSpinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { productApi } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import type { Product } from '@/types';

const CATEGORIES = [
  'Groceries', 'Snacks', 'Beverages', 'Dairy', 'Bakery',
  'Medicines', 'Beauty', 'Household', 'Starters', 'Main Course',
  'Breads', 'Rice', 'Drinks', 'Desserts', 'Other',
];

const productSchema = z.object({
  name: z.string().min(1, 'Name required'),
  price: z.coerce.number().min(1, 'Price must be > 0'),
  category: z.string().optional(),
});

type ProductForm = z.infer<typeof productSchema>;

interface ProductsTableProps {
  shopId: string;
}

export default function ProductsTable({ shopId }: ProductsTableProps) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const loadProducts = useCallback(async () => {
    try {
      const res = await productApi.list(shopId);
      setProducts((res.data?.data || res.data || []) as Product[]);
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
  });

  const onSubmit = async (data: ProductForm) => {
    try {
      await productApi.create(shopId, data);
      toast.success('Product added');
      setShowAdd(false);
      reset();
      loadProducts();
    } catch {
      toast.error('Failed to add product');
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    try {
      await productApi.delete(id);
      toast.success('Product deleted');
      loadProducts();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const toggleAvailable = async (product: Product) => {
    if (!product.id) return;
    try {
      await productApi.update(product.id, {
        available: !product.available,
      });
      loadProducts();
    } catch {
      toast.error('Failed to update');
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (loading) return <InlineLoader />;

  return (
    <div>
      {/* Actions bar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1">
          <Input
            placeholder={t.dashboard.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="max-w-[160px]">
            <SelectValue placeholder={t.dashboard.filter} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.dashboard.addProduct}
        </Button>
      </div>

      {/* Products list */}
      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-gray-500">No products found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Desktop table header */}
          <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 text-xs font-medium text-gray-500 uppercase">
            <div className="col-span-4">Name</div>
            <div className="col-span-2">Price</div>
            <div className="col-span-3">Category</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>

          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="grid sm:grid-cols-12 gap-3 items-center p-3 sm:px-4 rounded-lg bg-gray-800/30 border border-gray-800"
            >
              <div className="sm:col-span-4 flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {product.name}
                </span>
                {!product.available && (
                  <Badge variant="destructive" className="text-[10px]">
                    Off
                  </Badge>
                )}
              </div>
              <div className="sm:col-span-2">
                <span className="text-sm text-gray-300">
                  {formatPrice(product.price)}
                </span>
              </div>
              <div className="sm:col-span-3">
                {product.category && (
                  <Badge variant="outline" className="text-xs">
                    {product.category}
                  </Badge>
                )}
              </div>
              <div className="sm:col-span-3 flex items-center justify-end gap-2">
                <Switch
                  checked={product.available ?? true}
                  onCheckedChange={() => toggleAvailable(product)}
                />
                <button
                  onClick={() => onDelete(product.id!)}
                  className="p-1.5 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add product dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dashboard.addProduct}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input {...register('name')} placeholder="Product name" />
              {errors.name && (
                <p className="text-xs text-red-400">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Price</Label>
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
              <Label>Category</Label>
              <Select
                onValueChange={(v) => setValue('category', v)}
                value={watch('category')}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">
              Add Product
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
