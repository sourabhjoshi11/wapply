# Wapply Frontend

WhatsApp Business SaaS frontend for Indian local businesses. Built with Next.js 15, TypeScript, Tailwind CSS v4, and shadcn/ui.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4
- **UI Library**: shadcn/ui (Radix primitives)
- **State Management**: Zustand
- **Forms**: react-hook-form + zod
- **Animations**: Framer Motion
- **Payments**: Razorpay
- **Real-time**: Supabase JS SDK
- **API Client**: Axios

## Getting Started

### 1. Install dependencies

```bash
cd frontend
npm install
```

### 2. Set up environment variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx           # Root layout with providers
│   ├── page.tsx             # Landing page
│   ├── globals.css          # Tailwind CSS v4 styles
│   ├── providers.tsx        # Client-side providers
│   ├── onboarding/
│   │   └── page.tsx         # Multi-step onboarding flow
│   ├── dashboard/
│   │   └── page.tsx         # Owner dashboard
│   └── api/
│       └── recharge/
│           └── route.ts     # Razorpay order API
├── components/
│   ├── ui/                  # shadcn/ui components
│   ├── shared/              # Navbar, LoadingSpinner
│   ├── landing/             # Landing page sections
│   ├── onboarding/          # Onboarding flow components
│   └── dashboard/           # Dashboard panels
├── lib/
│   ├── api.ts               # Axios instance → FastAPI
│   ├── supabase.ts          # Supabase client
│   ├── razorpay.ts          # Razorpay utils
│   └── utils.ts             # Shared utilities
├── store/
│   └── onboardingStore.ts   # Zustand store
├── i18n/
│   ├── types.ts             # Translation type definitions
│   ├── en.ts                # English translations
│   ├── hi.ts                # Hindi translations
│   └── LangContext.tsx       # Language context provider
├── hooks/
│   └── useTranslation.ts    # Translation hook
└── types/
    └── index.ts             # TypeScript type definitions
```

## Features

### Landing Page
- Hero with animated WhatsApp chat mockup
- 8 feature cards
- 3-step how-it-works
- Pricing with two plans
- Testimonials
- Hindi/English language toggle

### Onboarding Flow
- Step 0: Business type selection (Shop/Restaurant/Salon/Turf)
- Step 1: Basic details with category-specific fields
- Step 2: Setup (Catalog/Menu/Services/Assets based on type)
- Step 3: Type-specific setup (Tables/Staff/Working Hours)
- Step 4: WhatsApp number verification via OTP
- Step 5: Wallet recharge with Razorpay
- Step 6: Success with confetti + QR code

### Owner Dashboard
- Overview with stats and recent orders
- Real-time order management with Supabase subscriptions
- Product/Service management
- Customer list
- Wallet with transaction history
- Settings with danger zone

## Language Support

Toggle between English and Hindi using the globe icon in the navbar. Language preference is persisted to localStorage.

## API Integration

The frontend connects to a FastAPI backend at `NEXT_PUBLIC_API_URL`. All API calls include the `X-API-Key` header automatically via an Axios interceptor.

Key endpoints:
- `POST /api/shops/create` - Create shop
- `GET /api/shops/me` - Get shop details
- `POST /api/products/bulk` - Bulk upload products
- `GET /api/orders/{shop_id}` - List orders
- `POST /api/wallet/credit` - Credit wallet after payment
- `POST /api/verify-whatsapp/send` - Send OTP
- `POST /api/verify-whatsapp/verify` - Verify OTP
