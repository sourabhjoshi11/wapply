'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Trash2, Plus } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DURATION_OPTIONS } from '@/lib/utils';
import { onboardingApi } from '@/lib/api';
import type { Staff, WorkingHours } from '@/types';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface StaffForm {
  name: string;
  days: string[];
  start_time: string;
  end_time: string;
  break_start: string;
  break_end: string;
  slot_duration: string;
}

const emptyStaffForm = (): StaffForm => ({
  name: '',
  days: [],
  start_time: '09:00',
  end_time: '18:00',
  break_start: '',
  break_end: '',
  slot_duration: '30',
});

export default function StaffSetup() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const staffList = useOnboardingStore((s) => s.staff);
  const addStaffMember = useOnboardingStore((s) => s.addStaffMember);
  const removeStaffMember = useOnboardingStore((s) => s.removeStaffMember);
  const updateStaffMember = useOnboardingStore((s) => s.updateStaffMember);
  const nextStep = useOnboardingStore((s) => s.nextStep);

  const [form, setForm] = useState<StaffForm>(emptyStaffForm());
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const addStaff = () => {
    if (!form.name.trim()) {
      toast.error('Staff name is required');
      return;
    }
    if (form.days.length === 0) {
      toast.error('Select at least 1 working day');
      return;
    }

    const member: Staff = {
      name: form.name,
      active: true,
      working_hours: {
        days: form.days,
        start_time: form.start_time,
        end_time: form.end_time,
        break_start: form.break_start || undefined,
        break_end: form.break_end || undefined,
        slot_duration: Number(form.slot_duration),
      },
    };

    if (editingIndex !== null) {
      updateStaffMember(editingIndex, member);
      setEditingIndex(null);
    } else {
      addStaffMember(member);
    }
    setForm(emptyStaffForm());
    toast.success(editingIndex !== null ? 'Staff updated' : 'Staff added');
  };

  const editStaff = (index: number) => {
    const s = staffList[index];
    if (!s) return;
    setForm({
      name: s.name,
      days: s.working_hours?.days || [],
      start_time: s.working_hours?.start_time || '09:00',
      end_time: s.working_hours?.end_time || '18:00',
      break_start: s.working_hours?.break_start || '',
      break_end: s.working_hours?.break_end || '',
      slot_duration: String(s.working_hours?.slot_duration || 30),
    });
    setEditingIndex(index);
  };

  const toggleDay = (day: string) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  };

  const proceed = async () => {
    if (staffList.length === 0) {
      toast.error('Add at least 1 staff member');
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (shopId) {
        await onboardingApi.saveStaff(shopId, staffList as unknown as Record<string, unknown>[]);
      }
      nextStep();
    } catch {
      toast.error('Failed to save staff');
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
        {t.onboarding.staffSetup.title}
      </h2>

      {/* Add staff form */}
      <div className="p-4 rounded-xl border border-gray-800 bg-gray-900/30 mb-6 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>{t.onboarding.staffSetup.name} *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Staff name"
            />
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.staffSetup.slotDuration}</Label>
            <Select
              value={form.slot_duration}
              onValueChange={(v) => setForm((p) => ({ ...p, slot_duration: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.filter((d) => ['15','30','45','60'].includes(d.value)).map(
                  (d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="mb-2 block">{t.onboarding.staffSetup.days}</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  form.days.includes(day)
                    ? 'bg-[#25D366] text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>{t.onboarding.staffSetup.startTime}</Label>
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.staffSetup.endTime}</Label>
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>{t.onboarding.staffSetup.breakStart}</Label>
            <Input
              type="time"
              value={form.break_start}
              onChange={(e) => setForm((p) => ({ ...p, break_start: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label>{t.onboarding.staffSetup.breakEnd}</Label>
            <Input
              type="time"
              value={form.break_end}
              onChange={(e) => setForm((p) => ({ ...p, break_end: e.target.value }))}
            />
          </div>
        </div>

        <Button onClick={addStaff} variant="outline" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          {editingIndex !== null ? 'Update' : t.onboarding.staffSetup.addStaff}
        </Button>
      </div>

      {/* Staff list */}
      <div className="space-y-2">
        {staffList.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Add at least 1 staff member</p>
        ) : (
          staffList.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-800"
            >
              <div className="flex items-center gap-3">
                <Switch checked={s.active} onCheckedChange={(c) => updateStaffMember(i, { ...s, active: c })} />
                <span className="text-sm font-medium text-white">{s.name}</span>
                <Badge variant="outline">
                  {s.working_hours?.days?.length || 0} days
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => editStaff(i)}
                  className="text-gray-400 hover:text-white text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={() => removeStaffMember(i)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <Button onClick={proceed} disabled={saving} size="lg">
          {saving ? 'Saving...' : t.onboarding.catalogSetup.proceed}
        </Button>
      </div>
    </motion.div>
  );
}
