import axios from 'axios';
import { supabase } from './supabase';

const api = axios.create({
  /** On Vercel, API is proxied via rewrites (next.config.ts) so use relative URL.
   *  On local dev, NEXT_PUBLIC_API_URL should be http://localhost:8000. */
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

api.interceptors.request.use(
  async (config) => {
    if (typeof window !== 'undefined') {
      const { data: { session } } = await supabase.auth.getSession();
      let token = session?.access_token ?? null;

      if (token) {
        // Proactive token refresh: if the access_token is expired or expires
        // within the next 5 minutes, refresh it NOW before sending the request.
        // This prevents sending stale tokens that the backend would reject.
        try {
          const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
          const expMs = (payload.exp || 0) * 1000;
          const isExpired = Date.now() >= expMs;
          const isExpiringSoon = (expMs - Date.now()) < 5 * 60 * 1000;

          if (isExpired || isExpiringSoon) {
            const { data: { session: refreshed } } = await supabase.auth.refreshSession();
            if (refreshed?.access_token) {
              token = refreshed.access_token;
            }
          }
        } catch {
          // Malformed token — send it as-is; backend will reject and the
          // response interceptor handles the 401 retry path.
        }

        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const isOnboarding = typeof window !== 'undefined' && window.location.pathname.startsWith('/onboarding');

      if (error.config?.headers?.['X-Retried']) {
        // Already retried — if on onboarding just reject (don't redirect to login)
        if (!isOnboarding && typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      // Mark as retried
      if (error.config) {
        error.config.headers = error.config.headers || {};
        error.config.headers['X-Retried'] = 'true';
      }

      if (typeof window !== 'undefined') {
        // First try getSession() — if the session is still valid (fresh login),
        // we get a token without needing to refresh
        let freshToken: string | null = null;
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession?.access_token) {
          freshToken = existingSession.access_token;
        } else {
          // Try a full refresh as fallback
          const { data: { session: refreshedSession } } = await supabase.auth.refreshSession();
          freshToken = refreshedSession?.access_token ?? null;
        }

        if (freshToken) {
          if (error.config) {
            error.config.headers.Authorization = `Bearer ${freshToken}`;
            return api.request(error.config);
          }
        }

        // No token obtained — only redirect to login if NOT on onboarding
        if (!isOnboarding && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

// ============ Shop APIs ============
export const shopApi = {
  create: (data: FormData | Record<string, unknown>) => {
    if (data instanceof FormData) {
      // Do NOT set Content-Type — axios sets it with boundary automatically
      return api.post('/api/shops/create', data);
    }
    return api.post('/api/shops/create', data);
  },

  getMe: () => api.get('/api/shops/me'),

  getById: (shopId: string) => api.get(`/api/shops/${shopId}`),

  update: (data: Record<string, unknown>) => api.put('/api/shops/me', data),
};

// ============ Product APIs ============
export const productApi = {
  list: (shopId: string) => api.get(`/api/shops/${shopId}/products`),

  create: (shopId: string, data: Record<string, unknown>) =>
    api.post(`/api/shops/${shopId}/products`, data),

  bulkCreate: (data: { shop_id: string; products: Record<string, unknown>[] }) =>
    api.post('/api/products/bulk', data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/api/products/${id}`, data),

  delete: (id: string) => api.delete(`/api/products/${id}`),
};

// ============ Order APIs ============
export const orderApi = {
  list: (shopId: string, params?: Record<string, string>) =>
    api.get(`/api/shops/${shopId}/orders`, { params }),

  updateStatus: (id: string, status: string) =>
    api.patch(`/api/orders/${id}`, { status }),
};

// ============ Wallet APIs ============
export const walletApi = {
  getBalance: (shopId: string) => api.get(`/api/shops/${shopId}/wallet`),

  credit: (data: {
    shop_id: string;
    amount: number;
    razorpay_payment_id: string;
    razorpay_order_id: string;
  }) => api.post('/api/wallet/credit', data),

  verifyPayment: (data: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    shop_id: string;
    amount: number;
  }) => api.post('/api/wallet/verify-payment', data),

  transactions: (shopId: string) =>
    api.get(`/api/wallet/transactions?shop_id=${shopId}`),
};

// ============ WhatsApp Verification APIs ============
export const whatsappApi = {
  sendOtp: (phoneNumber: string) =>
    api.post('/api/verify-whatsapp/send', { phone_number: phoneNumber }),

  verifyOtp: (phoneNumber: string, otp: string) =>
    api.post('/api/verify-whatsapp/verify', {
      phone_number: phoneNumber,
      otp,
    }),

  register: (data: {
    shop_id: string;
    access_token: string;
    phone_number_id: string;
    business_phone?: string;
  }) => api.post('/api/whatsapp/register', data),
};

// ============ Appointment APIs (Salon) ============
export const appointmentApi = {
  list: (shopId: string) => api.get(`/api/shops/${shopId}/appointments`),
};

// ============ Booking APIs (Turf/Hotel) ============
export const bookingApi = {
  list: (shopId: string) => api.get(`/api/shops/${shopId}/bookings`),
};

// ============ Table APIs (Restaurant) ============
export const tableApi = {
  list: (shopId: string) => api.get(`/api/shops/${shopId}/tables`),

  create: (shopId: string, data: { table_number: number; table_name?: string }) =>
    api.post(`/api/shops/${shopId}/tables`, data),

  batchCreate: (shopId: string, count: number) =>
    api.post('/api/onboarding/save-tables', { shop_id: shopId, count }),

  delete: (id: string) => api.delete(`/api/tables/${id}`),

  generateQrs: (shopId: string) =>
    api.post(
      `/api/shops/${shopId}/tables/generate-qrs`,
      {},
      { responseType: 'blob' },
    ),
};

// ============ Customer APIs ============
export const customerApi = {
  list: (shopId: string) => api.get(`/api/shops/${shopId}/customers`),
};

// ============ Billing APIs ============
export const billingApi = {
  getHistory: (shopId: string) => api.get(`/api/billing/${shopId}/history`),
};

// ============ Onboarding APIs ============
export const onboardingApi = {
  getStatus: () => api.get('/api/onboarding/status'),

  saveBasicDetails: (data: Record<string, unknown> | FormData) => {
    if (data instanceof FormData) {
      return api.post('/api/onboarding/save-basic-details', data);
    }
    return api.post('/api/onboarding/save-basic-details', data);
  },

  saveCatalog: (shopId: string, products: Record<string, unknown>[]) =>
    api.post('/api/onboarding/save-catalog', { shop_id: shopId, products }),

  saveTables: (shopId: string, count: number) =>
    api.post('/api/onboarding/save-tables', { shop_id: shopId, count }),

  saveStaff: (shopId: string, staff: Record<string, unknown>[]) =>
    api.post('/api/onboarding/save-staff', { shop_id: shopId, staff }),

  saveAssets: (shopId: string, assets: Record<string, unknown>[]) =>
    api.post('/api/onboarding/save-assets', { shop_id: shopId, assets }),

  saveHours: (shopId: string, workingHours: Record<string, unknown>) =>
    api.post('/api/onboarding/save-hours', { shop_id: shopId, working_hours: workingHours }),

  complete: (shopId: string) =>
    api.post('/api/onboarding/complete', { shop_id: shopId }),
};

export default api;
