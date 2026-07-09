import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(price: number): string {
  return `₹ ${price.toLocaleString('en-IN')}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getTimeElapsed(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function getPlanPrice(planType: string): number {
  return planType === 'restaurant' ? 499 : 199;
}

export function getPerOrderCharge(planType: string): number {
  return planType === 'restaurant' ? 1 : 2;
}

export function getFreeOrderLimit(planType: string): number {
  return planType === 'restaurant' ? 500 : 300;
}

// New billing plan helpers (used alongside old wallet functions)
export function getBillingPlanPrice(plan: string | null | undefined): number {
  if (plan === 'basic') return 299;
  if (plan === 'standard') return 499;
  if (plan === 'pro') return 799;
  return 0;
}

export function getBillingPlanOrders(plan: string | null | undefined): number {
  if (plan === 'basic') return 500;
  if (plan === 'standard') return 1000;
  if (plan === 'pro') return 2000;
  return 0;
}

export function getBillingPlanLabel(plan: string | null | undefined): string {
  if (plan === 'basic') return 'Basic';
  if (plan === 'standard') return 'Standard';
  if (plan === 'pro') return 'Pro';
  return 'Free Trial';
}

export function getBillingBatchPricing(plan: string | null | undefined): { price: number; orders: number } {
  if (plan === 'basic') return { price: 299, orders: 200 };
  if (plan === 'standard') return { price: 399, orders: 400 };
  if (plan === 'pro') return { price: 499, orders: 600 };
  return { price: 0, orders: 0 };
}

export function generateOrderCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '#';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  shop: 'Shop / Grocery / Bakery',
  restaurant: 'Restaurant',
  salon: 'Salon / Clinic / Spa',
  turf: 'Turf / Hotel / Banquet',
};

export const BUSINESS_TYPE_ICONS: Record<string, string> = {
  shop: '🛒',
  restaurant: '🍽️',
  salon: '✂️',
  turf: '🏟️',
};

export const SHOP_CATEGORIES = [
  'Grocery Store',
  'Bakery',
  'Boutique',
  'Tiffin',
  'Pharmacy',
  'Sweet Shop',
  'Other',
] as const;

export const RESTAURANT_CATEGORIES = [
  'Fine Dining',
  'Casual',
  'Fast Food',
  'Cafe',
  'Dhaba',
  'Other',
] as const;

export const SALON_CATEGORIES = [
  'Hair Salon',
  'Beauty Parlour',
  'Spa',
  'Clinic',
  'Other',
] as const;

export const TURF_CATEGORIES = [
  'Turf',
  'Hotel',
  'Banquet Hall',
  'Party Hall',
  'PG',
  'Other',
] as const;

export const UI_LANGUAGES: { value: string; label: string }[] = [
  { value: 'English', label: 'English' },
  { value: 'Hindi', label: 'हिन्दी' },
];

export const LANGUAGES: { value: string; label: string }[] = [
  { value: 'Hinglish', label: 'Hinglish' },
  { value: 'Hindi', label: 'हिन्दी' },
  { value: 'English', label: 'English' },
  { value: 'Marathi', label: 'मराठी' },
  { value: 'Gujarati', label: 'ગુજરાતી' },
  { value: 'Bengali', label: 'বাংলা' },
  { value: 'Tamil', label: 'தமிழ்' },
  { value: 'Telugu', label: 'తెలుగు' },
  { value: 'Kannada', label: 'ಕನ್ನಡ' },
  { value: 'Malayalam', label: 'മലയാളം' },
  { value: 'Punjabi', label: 'ਪੰਜਾਬੀ' },
];

export const DURATION_OPTIONS = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
  { value: '90', label: '90 min' },
  { value: '120', label: '120 min' },
  { value: '180', label: '180 min' },
  { value: '240', label: '240 min' },
];

export const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  ACCEPTED: 'bg-blue-100 text-blue-800 border-blue-300',
  DELIVERED: 'bg-green-100 text-green-800 border-green-300',
  CANCELLED: 'bg-red-100 text-red-800 border-red-300',
};
