'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
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
import { DURATION_OPTIONS } from '@/lib/utils';
import { onboardingApi } from '@/lib/api';
import type { BusinessHours } from '@/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WorkingHoursStep() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const workingHours = useOnboardingStore((s) => s.workingHours);
  const setWorkingHours = useOnboardingStore((s) => s.setWorkingHours);
  const nextStep = useOnboardingStore((s) => s.nextStep);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [days, setDays] = useState<string[]>(workingHours?.days || []);
  const [opening, setOpening] = useState(workingHours?.opening_time || '09:00');
  const [closing, setClosing] = useState(workingHours?.closing_time || '21:00');
  const [slotDur, setSlotDur] = useState(String(workingHours?.slot_duration || 60));
  const [blackoutDate, setBlackoutDate] = useState('');
  const [blackoutDates, setBlackoutDates] = useState<string[]>(
    workingHours?.blackout_dates || [],
  );

  const toggleDay = (day: string) => {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const addBlackout = () => {
    if (blackoutDate && !blackoutDates.includes(blackoutDate)) {
      setBlackoutDates((prev) => [...prev, blackoutDate]);
      setBlackoutDate('');
    }
  };

  const save = async () => {
    if (days.length === 0) {
      toast.error('Select at least 1 working day');
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const hours: BusinessHours = {
        days,
        opening_time: opening,
        closing_time: closing,
        slot_duration: Number(slotDur),
        blackout_dates: blackoutDates,
      };
      setWorkingHours(hours);
      if (shopId) {
        await onboardingApi.saveHours(shopId, hours as unknown as Record<string, unknown>);
      }
      toast.success('Working hours saved');
      nextStep();
    } catch {
      toast.error('Failed to save working hours');
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
      className="w-full max-w-2xl mx-auto"
    >
      <h2 className="text-2xl font-bold text-white mb-6">
        {t.onboarding.workingHours.title}
      </h2>

      <div className="space-y-6">
        {/* Days */}
        <div>
          <Label className="mb-2 block">{t.onboarding.workingHours.daysOpen}</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  days.includes(day)
                    ? 'bg-[#25D366] text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>{t.onboarding.workingHours.openingTime}</Label>
            <Input
              type="time"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.workingHours.closingTime}</Label>
            <Input
              type="time"
              value={closing}
              onChange={(e) => setClosing(e.target.value)}
            />
          </div>
        </div>

        {/* Slot duration */}
        <div className="space-y-1 max-w-[200px]">
          <Label>{t.onboarding.workingHours.slotDuration}</Label>
          <Select value={slotDur} onValueChange={setSlotDur}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Blackout dates */}
        <div>
          <Label className="mb-2 block">
            {t.onboarding.workingHours.blackoutDates}
          </Label>
          <div className="flex items-center gap-2 mb-2">
            <Input
              type="date"
              value={blackoutDate}
              onChange={(e) => setBlackoutDate(e.target.value)}
              className="max-w-[200px]"
            />
            <Button type="button" variant="outline" size="sm" onClick={addBlackout}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {blackoutDates.map((date) => (
              <span
                key={date}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-800 text-gray-300 text-xs"
              >
                {date}
                <button
                  onClick={() =>
                    setBlackoutDates((prev) => prev.filter((d) => d !== date))
                  }
                  className="text-gray-500 hover:text-red-400"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? 'Saving...' : 'Save & Continue'}
        </Button>
      </div>
    </motion.div>
  );
}
