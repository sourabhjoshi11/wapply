'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PhoneInput } from '@/components/shared/PhoneInput';
import { shopApi } from '@/lib/api';
import {
  SHOP_CATEGORIES,
  RESTAURANT_CATEGORIES,
  SALON_CATEGORIES,
  TURF_CATEGORIES,
  UI_LANGUAGES,
} from '@/lib/utils';
import type { BusinessType } from '@/types';

const getCategories = (type: BusinessType) => {
  switch (type) {
    case 'shop': return SHOP_CATEGORIES;
    case 'restaurant': return RESTAURANT_CATEGORIES;
    case 'salon': return SALON_CATEGORIES;
    case 'turf': return TURF_CATEGORIES;
  }
};

const createSchema = (t: ReturnType<typeof useTranslation>['t']) =>
  z.object({
    owner_name: z.string().min(2, 'Name is required'),
    business_name: z.string().min(2, 'Business name is required'),
    category: z.string().min(1, 'Category is required'),
    city: z.string().min(2, 'City is required'),
    owner_whatsapp: z
      .string()
      .regex(/^\+91\d{10}$/, 'Enter valid 10-digit Indian mobile number'),
    language: z.string().min(1, 'Language is required'),
  });

type FormData = z.infer<ReturnType<typeof createSchema>>;

export default function BasicDetails() {
  const { t } = useTranslation();
  const businessType = useOnboardingStore((s) => s.businessType);
  const setBasicDetails = useOnboardingStore((s) => s.setBasicDetails);
  const setShopId = useOnboardingStore((s) => s.setShopId);
  const setApiKey = useOnboardingStore((s) => s.setApiKey);
  const setPlanType = useOnboardingStore((s) => s.setPlanType);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const [submitting, setSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const submitLockRef = useRef(false);

  const schema = createSchema(t);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      owner_whatsapp: '+91',
      category: '',
      language: '',
    },
  });

  const categories = businessType ? getCategories(businessType) : [];

  const onSubmit = async (data: FormData) => {
    if (!businessType) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('owner_name', data.owner_name);
      formData.append('name', data.business_name);
      formData.append('business_type', businessType);
      formData.append('category', data.category);
      formData.append('city', data.city);
      formData.append('owner_whatsapp', data.owner_whatsapp);
      formData.append('language', data.language);
      if (logoFile) formData.append('logo', logoFile);

      const res = await shopApi.create(formData);
      const result = res.data as { shop_id: string; api_key: string };

      setShopId(result.shop_id);
      setApiKey(result.api_key);
      setBasicDetails({
        owner_name: data.owner_name,
        business_name: data.business_name,
        category: data.category,
        city: data.city,
        owner_whatsapp: data.owner_whatsapp,
        language: data.language as never,
        logo: logoFile,
      });
      setPlanType(
        businessType === 'restaurant' ? 'restaurant' : 'shop',
      );

      toast.success('Business created successfully!');
      nextStep();
    } catch (err: unknown) {
      let msg = 'Failed to create business';
      if (err && typeof err === 'object') {
        const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
        if (axiosErr.response?.data?.detail) {
          msg = axiosErr.response.data.detail;
        } else if (axiosErr.response?.status === 409) {
          msg = 'This WhatsApp number is already registered. Please use a different number.';
        }
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  };

  if (!businessType) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-2xl mx-auto"
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          {t.onboarding.basicDetails.title}
        </h2>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label htmlFor="owner_name">
              {t.onboarding.basicDetails.ownerName} *
            </Label>
            <Input
              id="owner_name"
              placeholder={t.onboarding.basicDetails.ownerNamePlaceholder}
              {...register('owner_name')}
            />
            {errors.owner_name && (
              <p className="text-xs text-red-400">{errors.owner_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="business_name">
              {t.onboarding.basicDetails.businessName} *
            </Label>
            <Input
              id="business_name"
              placeholder={t.onboarding.basicDetails.businessNamePlaceholder}
              {...register('business_name')}
            />
            {errors.business_name && (
              <p className="text-xs text-red-400">{errors.business_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t.onboarding.basicDetails.category} *</Label>
            <Select
              onValueChange={(v) => setValue('category', v)}
              value={watch('category')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-xs text-red-400">{errors.category.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="city">{t.onboarding.basicDetails.city} *</Label>
            <Input
              id="city"
              placeholder={t.onboarding.basicDetails.cityPlaceholder}
              {...register('city')}
            />
            {errors.city && (
              <p className="text-xs text-red-400">{errors.city.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner_whatsapp">
              {t.onboarding.basicDetails.whatsappNumber} *
            </Label>
            <PhoneInput
              id="owner_whatsapp"
              placeholder="XXXXXXXXXX"
              value={watch('owner_whatsapp') || '+91'}
              onChange={(val) => setValue('owner_whatsapp', val, { shouldValidate: true })}
            />
            {errors.owner_whatsapp && (
              <p className="text-xs text-red-400">
                {errors.owner_whatsapp.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t.onboarding.basicDetails.language} *</Label>
            <Select
              onValueChange={(v) => setValue('language', v)}
              value={watch('language')}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {UI_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.language && (
              <p className="text-xs text-red-400">{errors.language.message}</p>
            )}
          </div>
        </div>

        {/* Logo Upload */}
        <div className="space-y-2">
          <Label>{t.onboarding.basicDetails.logo}</Label>
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('logo-upload')?.click()}
            >
              {t.onboarding.basicDetails.logoUpload}
            </Button>
            {logoFile && (
              <span className="text-sm text-gray-400">{logoFile.name}</span>
            )}
          </div>
          <input
            id="logo-upload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
          />
        </div>

        <Button type="submit" disabled={submitting} size="lg" className="w-full">
          {submitting
            ? t.onboarding.basicDetails.submitting
            : t.onboarding.basicDetails.submit}
        </Button>
      </form>
    </motion.div>
  );
}
