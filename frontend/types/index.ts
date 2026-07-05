// ============ Business Types ============
export type BusinessType = 'shop' | 'restaurant' | 'salon' | 'turf';

export type ShopCategory =
  | 'Kirana'
  | 'Bakery'
  | 'Boutique'
  | 'Tiffin'
  | 'Pharmacy'
  | 'Sweet Shop'
  | 'Other';

export type RestaurantCategory =
  | 'Fine Dining'
  | 'Casual'
  | 'Fast Food'
  | 'Cafe'
  | 'Dhaba'
  | 'Other';

export type SalonCategory =
  | 'Hair Salon'
  | 'Beauty Parlour'
  | 'Spa'
  | 'Clinic'
  | 'Other';

export type TurfCategory =
  | 'Turf'
  | 'Hotel'
  | 'Banquet Hall'
  | 'Party Hall'
  | 'PG'
  | 'Other';

export type BusinessCategory =
  | ShopCategory
  | RestaurantCategory
  | SalonCategory
  | TurfCategory;

export type Language =
  | 'Hindi'
  | 'English'
  | 'Marathi'
  | 'Gujarati'
  | 'Bengali'
  | 'Tamil'
  | 'Telugu'
  | 'Kannada'
  | 'Malayalam'
  | 'Punjabi';

export type PlanType = 'shop' | 'restaurant';

// ============ Product / Catalog ============
export interface Product {
  id?: string;
  shop_id?: string;
  name: string;
  price: number;
  category?: string;
  available?: boolean;
  veg?: boolean; // restaurant only
  duration?: string; // salon services
  description?: string; // salon services
}

export interface Asset {
  id?: string;
  shop_id?: string;
  name: string;
  type: 'Turf' | 'Room' | 'Hall' | 'Venue';
  capacity: number;
  price_per_slot: number;
  slot_duration: number; // minutes
  advance_percentage: number;
}

// ============ Staff & Working Hours ============
export interface Staff {
  id?: string;
  shop_id?: string;
  name: string;
  active: boolean;
  working_hours?: WorkingHours;
}

export interface WorkingHours {
  days: string[]; // Mon, Tue, etc.
  start_time: string; // HH:mm
  end_time: string;
  break_start?: string;
  break_end?: string;
  slot_duration: number;
}

export interface BusinessHours {
  days: string[];
  opening_time: string;
  closing_time: string;
  slot_duration: number;
  blackout_dates?: string[];
}

// ============ Order / Appointment / Booking ============
export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'CANCELLED';

export interface OrderItem {
  product_id: string;
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: string;
  shop_id: string;
  order_code: string;
  customer_number: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  address?: string;
  table_number?: string;
  created_at: string;
  accepted_at?: string;
  delivered_at?: string;
}

export interface Appointment {
  id: string;
  shop_id: string;
  customer_number: string;
  service_name: string;
  staff_name: string;
  date: string;
  time: string;
  status: string;
}

export interface Booking {
  id: string;
  shop_id: string;
  customer_number: string;
  asset_name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  amount: number;
}

// ============ Shop / Tenant ============
export interface Shop {
  id: string;
  owner_name: string;
  name: string;
  business_type: BusinessType;
  category: BusinessCategory;
  city: string;
  owner_whatsapp: string;
  language: Language;
  logo_url?: string;
  api_key: string;
  bot_number?: string;
  bot_number_verified?: boolean;
  plan_type: PlanType;
  wallet_balance: number;
  trial_end?: string;
  active: boolean;
  created_at: string;
  // Restaurant specific
  tables_count?: number;
  upi_id?: string;
  gst_percentage?: number;
  // Salon/Clinic specific
  slot_duration?: number;
}

// ============ Wallet / Transactions ============
export interface Transaction {
  id: string;
  shop_id: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  balance_after: number;
  created_at: string;
}

// ============ Billing (New Plan System) ============
export type BillingPlanName = 'basic' | 'standard' | 'pro';

export const BILLING_PLANS: Record<BillingPlanName, { label: string; price: number; orders: number; batchPrice: number; batchOrders: number }> = {
  basic: { label: 'Basic', price: 299, orders: 500, batchPrice: 299, batchOrders: 200 },
  standard: { label: 'Standard', price: 499, orders: 1000, batchPrice: 399, batchOrders: 400 },
  pro: { label: 'Pro', price: 799, orders: 2000, batchPrice: 499, batchOrders: 600 },
};

export interface BillingTransaction {
  id: string;
  shop_id: string;
  type: 'subscription_charge' | 'extra_batch' | 'plan_upgrade' | 'refund';
  amount: number;
  description: string;
  plan: BillingPlanName;
  payment_id?: string;
  order_id?: string;
  created_at: string;
}

export interface BillingHistoryResponse {
  shop_id: string;
  plan: BillingPlanName | null;
  order_limit: number;
  monthly_order_count: number;
  extra_orders_purchased: number;
  billing_paused: boolean;
  mode: 'wallet' | 'subscription';
  billing_cycle_start?: string;
  razorpay_subscription_id?: string;
  transactions: BillingTransaction[];
}

// ============ Customer ============
export interface Customer {
  id: string;
  shop_id: string;
  whatsapp_number: string;
  total_orders: number;
  total_spent: number;
  last_order_date?: string;
  language?: Language;
}

// ============ Table ============
export interface Table {
  id: string;
  shop_id: string;
  table_number: number;
  qr_code_url?: string;
}

// ============ Onboarding ============
export interface BasicDetails {
  owner_name: string;
  business_name: string;
  category: string;
  city: string;
  owner_whatsapp: string;
  language: Language;
  logo?: File | null;
}

// ============ API Responses ============
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface CreateShopResponse {
  shop_id: string;
  api_key: string;
  message: string;
}

export interface WalletResponse {
  balance: number;
  plan_type: PlanType;
  trial_end?: string;
}

export interface RazorpayOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
}

// ============ Dashboard Stats ============
export interface DashboardStats {
  today_orders: number;
  today_revenue: number;
  active_conversations: number;
  wallet_balance: number;
}
