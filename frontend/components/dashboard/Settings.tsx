'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Save, Trash2, PauseCircle, CreditCard } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LANGUAGES } from '@/lib/utils';
import { shopApi } from '@/lib/api';
import type { Shop, BusinessType } from '@/types';

const shopSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  owner_name: z.string().min(2, 'Name is required'),
  city: z.string().min(2, 'City is required'),
  language: z.string().min(1),
});

type ShopForm = z.infer<typeof shopSchema>;

interface SettingsProps {
  shopData: Shop | null;
}

export default function Settings({ shopData }: SettingsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [showDelete, setShowDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [botPaused, setBotPaused] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<ShopForm>({
    resolver: zodResolver(shopSchema),
    defaultValues: {
      name: shopData?.name || '',
      owner_name: shopData?.owner_name || '',
      city: shopData?.city || '',
      language: shopData?.language || 'Hindi',
    },
  });

  const onSubmit = async (data: ShopForm) => {
    setSaving(true);
    try {
      await shopApi.update(data as unknown as Record<string, unknown>);
      toast.success('Settings saved!');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (!shopData) {
    return (
      <div className="text-center py-8 text-gray-500">{t.common.loading}</div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* 1. Shop Details */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {t.onboarding.basicDetails.title}
          </h3>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t.onboarding.basicDetails.ownerName}</Label>
                <Input {...register('owner_name')} />
                {errors.owner_name && (
                  <p className="text-xs text-red-400">
                    {errors.owner_name.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>{t.onboarding.basicDetails.businessName}</Label>
                <Input {...register('name')} />
                {errors.name && (
                  <p className="text-xs text-red-400">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>{t.onboarding.basicDetails.category}</Label>
                <Input value={shopData.category || ''} disabled />
              </div>
              <div className="space-y-1">
                <Label>{t.onboarding.basicDetails.city}</Label>
                <Input {...register('city')} />
                {errors.city && (
                  <p className="text-xs text-red-400">{errors.city.message}</p>
                )}
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? t.common.saving : t.common.save}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 2. Language */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {t.onboarding.basicDetails.language}
          </h3>
          <Select
            defaultValue={shopData.language}
            onValueChange={(v) => setValue('language', v)}
          >
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* 3. WhatsApp */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {t.onboarding.whatsappConnect.title}
          </h3>
          <div className="space-y-3">
            <div>
              <Label className="text-sm text-gray-400">Bot Number</Label>
              <p className="text-white font-medium">
                {shopData.bot_number || 'Not set'}
              </p>
            </div>
            <div>
              <Label className="text-sm text-gray-400">Owner Number</Label>
              <p className="text-white font-medium">
                {shopData.owner_whatsapp}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Plan */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            <CreditCard className="h-5 w-5 inline mr-2 text-[#25D366]" />
            Plan
          </h3>
          <div className="flex flex-wrap items-center gap-3">
            {(shopData as unknown as { plan?: string }).plan ? (
              <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 capitalize">
                {(shopData as unknown as { plan: string }).plan}
              </Badge>
            ) : (
              <Badge className="bg-[#25D366] text-white border-0 capitalize">
                {shopData.plan_type}
              </Badge>
            )}
            {shopData.trial_end && new Date(shopData.trial_end) > new Date() && (
              <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">
                🎁 Trial until {new Date(shopData.trial_end).toLocaleDateString()}
              </Badge>
            )}
          </div>
          {(shopData as unknown as { billing_paused?: boolean }).billing_paused && (
            <p className="text-xs text-red-400 mt-2">
              ⚠️ Billing paused — order acceptance suspended
            </p>
          )}
        </CardContent>
      </Card>

      {/* 5. Danger Zone */}
      <Card className="border-red-500/20">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-red-400 mb-4">
            {t.dashboard.dangerZone}
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">
                  <PauseCircle className="h-4 w-4 inline mr-1" />
                  {t.dashboard.pauseBot}
                </p>
                <p className="text-xs text-gray-500">
                  Temporarily stop accepting orders
                </p>
              </div>
              <Switch
                checked={botPaused}
                onCheckedChange={setBotPaused}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">
                  <Trash2 className="h-4 w-4 inline mr-1" />
                  {t.dashboard.deleteAccount}
                </p>
                <p className="text-xs text-gray-500">
                  This action cannot be undone
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDelete(true)}
              >
                {t.common.delete}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dashboard.deleteAccount}</DialogTitle>
            <DialogDescription>
              {t.dashboard.confirmDelete}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDelete(false)}
            >
              {t.common.cancel}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
