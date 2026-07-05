import { create } from 'zustand';

import type {
  BusinessType,
  BasicDetails,
  Product,
  Staff,
  Asset,
  WorkingHours,
  BusinessHours,
  Language,
  PlanType,
} from '@/types';

interface OnboardingState {
  // Step tracking
  currentStep: number;
  businessType: BusinessType | null;

  // Data
  shopId: string | null;
  apiKey: string | null;
  basicDetails: BasicDetails | null;
  products: Product[];
  assets: Asset[];
  staff: Staff[];
  staffWorkingHours: Record<string, WorkingHours>;
  tables: number;
  workingHours: BusinessHours | null;
  botNumber: string | null;
  botNumberVerified: boolean;
  planType: PlanType | null;
  walletRecharged: boolean;

  // Saving state
  saving: boolean;
  savingError: string | null;

  // Actions
  setBusinessType: (type: BusinessType) => void;
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setShopId: (id: string) => void;
  setApiKey: (key: string) => void;
  setBasicDetails: (details: BasicDetails) => void;
  addProduct: (product: Product) => void;
  removeProduct: (index: number) => void;
  updateProduct: (index: number, product: Product) => void;
  setProducts: (products: Product[]) => void;
  addAsset: (asset: Asset) => void;
  removeAsset: (index: number) => void;
  updateAsset: (index: number, asset: Asset) => void;
  setAssets: (assets: Asset[]) => void;
  setStaff: (staff: Staff[]) => void;
  addStaffMember: (member: Staff) => void;
  removeStaffMember: (index: number) => void;
  updateStaffMember: (index: number, member: Staff) => void;
  setStaffWorkingHours: (staffId: string, hours: WorkingHours) => void;
  setTables: (count: number) => void;
  setWorkingHours: (hours: BusinessHours) => void;
  setBotNumber: (number: string) => void;
  setBotNumberVerified: (verified: boolean) => void;
  setPlanType: (plan: PlanType) => void;
  setWalletRecharged: (recharged: boolean) => void;
  loadFromStorage: () => void;
  initializeFromBackend: () => Promise<{ shopId: string | null; isComplete: boolean }>;
  setSaving: (saving: boolean) => void;
  setSavingError: (error: string | null) => void;
  reset: () => void;
}

const STORAGE_KEY = 'weai_onboarding';

function saveToStorage(state: Partial<OnboardingState>) {
  if (typeof window === 'undefined') return;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    const data = existing ? JSON.parse(existing) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, ...state }));
  } catch {
    // ignore storage errors
  }
}

function loadFromStorage(): Partial<OnboardingState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

const initialState = {
  currentStep: 0,
  businessType: null as BusinessType | null,
  shopId: null as string | null,
  apiKey: null as string | null,
  basicDetails: null as BasicDetails | null,
  products: [] as Product[],
  assets: [] as Asset[],
  staff: [] as Staff[],
  staffWorkingHours: {} as Record<string, WorkingHours>,
  tables: 0,
  workingHours: null as BusinessHours | null,
  botNumber: null as string | null,
  botNumberVerified: false,
  planType: null as PlanType | null,
  walletRecharged: false,
  saving: false,
  savingError: null as string | null,
};

export const useOnboardingStore = create<OnboardingState>()((set, get) => ({
  ...initialState,

  setBusinessType: (type) => {
    const prev = get().businessType;
    // Clear business-type-specific data when type changes
    if (prev && prev !== type) {
      set({
        businessType: type,
        currentStep: 0,
        products: [],
        assets: [],
        staff: [],
        staffWorkingHours: {},
        tables: 0,
        workingHours: null,
        planType: null,
      });
      const toSave = {
        businessType: type,
        currentStep: 0,
        products: [],
        assets: [],
        staff: [],
        staffWorkingHours: {},
        tables: 0,
        workingHours: null as BusinessHours | null,
        planType: null as PlanType | null,
      };
      saveToStorage(toSave as Partial<OnboardingState>);
      return;
    }
    set({ businessType: type });
    saveToStorage({ businessType: type });
  },

  setStep: (step) => {
    set({ currentStep: step });
    saveToStorage({ currentStep: step });
  },

  nextStep: () => {
    const next = get().currentStep + 1;
    set({ currentStep: next });
    saveToStorage({ currentStep: next });
  },

  prevStep: () => {
    const prev = Math.max(0, get().currentStep - 1);
    set({ currentStep: prev });
    saveToStorage({ currentStep: prev });
  },

  setShopId: (id) => {
    set({ shopId: id });
    saveToStorage({ shopId: id });
  },

  setApiKey: (key) => {
    set({ apiKey: key });
    saveToStorage({ apiKey: key });
  },

  setBasicDetails: (details) => {
    set({ basicDetails: details });
    saveToStorage({ basicDetails: details });
  },

  addProduct: (product) => {
    set((state) => {
      const products = [...state.products, product];
      saveToStorage({ products });
      return { products };
    });
  },

  removeProduct: (index) => {
    set((state) => {
      const products = state.products.filter((_, i) => i !== index);
      saveToStorage({ products });
      return { products };
    });
  },

  updateProduct: (index, product) => {
    set((state) => {
      const products = [...state.products];
      products[index] = product;
      saveToStorage({ products });
      return { products };
    });
  },

  setProducts: (products) => {
    set({ products });
    saveToStorage({ products });
  },

  addAsset: (asset) => {
    set((state) => {
      const assets = [...state.assets, asset];
      saveToStorage({ assets });
      return { assets };
    });
  },

  removeAsset: (index) => {
    set((state) => {
      const assets = state.assets.filter((_, i) => i !== index);
      saveToStorage({ assets });
      return { assets };
    });
  },

  updateAsset: (index, asset) => {
    set((state) => {
      const assets = [...state.assets];
      assets[index] = asset;
      saveToStorage({ assets });
      return { assets };
    });
  },

  setAssets: (assets) => {
    set({ assets });
    saveToStorage({ assets });
  },

  setStaff: (staff) => {
    set({ staff });
    saveToStorage({ staff });
  },

  addStaffMember: (member) => {
    set((state) => {
      const staff = [...state.staff, member];
      saveToStorage({ staff });
      return { staff };
    });
  },

  removeStaffMember: (index) => {
    set((state) => {
      const staff = state.staff.filter((_, i) => i !== index);
      saveToStorage({ staff });
      return { staff };
    });
  },

  updateStaffMember: (index, member) => {
    set((state) => {
      const staff = [...state.staff];
      staff[index] = member;
      saveToStorage({ staff });
      return { staff };
    });
  },

  setStaffWorkingHours: (staffId, hours) => {
    set((state) => {
      const staffWorkingHours = { ...state.staffWorkingHours, [staffId]: hours };
      saveToStorage({ staffWorkingHours });
      return { staffWorkingHours };
    });
  },

  setTables: (count) => {
    set({ tables: count });
    saveToStorage({ tables: count });
  },

  setWorkingHours: (hours) => {
    set({ workingHours: hours });
    saveToStorage({ workingHours: hours });
  },

  setBotNumber: (number) => {
    set({ botNumber: number });
    saveToStorage({ botNumber: number });
  },

  setBotNumberVerified: (verified) => {
    set({ botNumberVerified: verified });
    saveToStorage({ botNumberVerified: verified });
  },

  setPlanType: (plan) => {
    set({ planType: plan });
    saveToStorage({ planType: plan });
  },

  setWalletRecharged: (recharged) => {
    set({ walletRecharged: recharged });
    saveToStorage({ walletRecharged: recharged });
  },

  loadFromStorage: () => {
    const saved = loadFromStorage();
    if (saved) {
      set(saved);
    }
  },

  initializeFromBackend: async () => {
    set({ saving: true, savingError: null });
    try {
      // Import supabase lazily to avoid circular deps
      const { supabase } = await import('@/lib/supabase');

      // Get a fresh session — auto-refreshes if needed
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        // No session at all — user is not logged in
        set({ saving: false });
        return { shopId: null, isComplete: false };
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      // Use raw fetch so the axios 401 interceptor (which redirects to /login)
      // does NOT fire during onboarding initialization.
      const res = await fetch(`${apiUrl}/api/onboarding/status`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        // 401 = token invalid/expired; gracefully fall back to local draft
        set({ saving: false, savingError: res.status === 401 ? 'Auth error — using local data.' : 'Could not reach server.' });
        return { shopId: null, isComplete: false };
      }

      const data = await res.json() as {
        shop: {
          id: string;
          name: string;
          owner_name: string;
          business_type: BusinessType;
          category: string;
          city: string;
          owner_whatsapp_number: string;
          default_language: string;
        } | null;
        completed_steps: string[];
        missing_steps: string[];
        is_complete: boolean;
        current_step_key: string;
      };

      if (data.shop) {
        // Populate store from backend state
        set({
          shopId: data.shop.id,
          basicDetails: {
            owner_name: data.shop.owner_name || '',
            business_name: data.shop.name || '',
            category: data.shop.category || '',
            city: data.shop.city || '',
            owner_whatsapp: data.shop.owner_whatsapp_number || '',
            language: data.shop.default_language as Language,
          },
          businessType: data.shop.business_type || get().businessType,
        });

        // Map current_step_key to step index for resume
        if (data.is_complete) {
          // Already done — redirect handled by caller
          set({ saving: false });
          return { shopId: data.shop.id, isComplete: true };
        }

        return { shopId: data.shop.id, isComplete: false };
      }

      set({ saving: false });
      return { shopId: null, isComplete: false };
    } catch {
      // Backend unavailable — continue with local draft
      set({ saving: false, savingError: 'Could not reach server. Continuing with local data.' });
      return { shopId: null, isComplete: false };
    }
  },

  setSaving: (saving) => set({ saving }),

  setSavingError: (error) => set({ savingError: error }),

  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('weai_shop_id');
    set(initialState);
  },
}));
