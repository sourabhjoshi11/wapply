'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { PageLoader } from '@/components/shared/LoadingSpinner';
import Sidebar from '@/components/dashboard/Sidebar';
import Overview from '@/components/dashboard/Overview';
import OrdersList from '@/components/dashboard/OrdersList';
import ProductsTable from '@/components/dashboard/ProductsTable';
import WalletSection from '@/components/dashboard/WalletSection';
import BillingSection from '@/components/dashboard/BillingSection';
import CustomersTable from '@/components/dashboard/CustomersTable';
import Settings from '@/components/dashboard/Settings';
import Footer from '@/components/landing/Footer';
import { shopApi } from '@/lib/api';
import type { Shop, BusinessType } from '@/types';

type DashboardTab =
  | 'overview'
  | 'orders'
  | 'products'
  | 'appointments'
  | 'bookings'
  | 'customers'
  | 'wallet'
  | 'billing'
  | 'settings';

export default function DashboardPage() {
  const router = useRouter();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
        return;
      }
      loadShop();
    });
  }, [router]);

  const loadShop = async () => {
    try {
      const res = await shopApi.getMe();
      const data = (res.data?.data || res.data) as Shop;
      setShop(data);
    } catch {
      await supabase.auth.signOut();
      router.push('/');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <PageLoader />
      </div>
    );
  }

  if (!shop) return null;

  const shopId = shop.id;
  const businessType = shop.business_type;
  const tabsForType: DashboardTab[] = [
    'overview',
    'orders',
    'products',
    ...(businessType === 'salon' ? (['appointments'] as DashboardTab[]) : []),
    ...(businessType === 'turf' ? (['bookings'] as DashboardTab[]) : []),
    'customers',
    'wallet',
    'billing',
    'settings',
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview shopId={shopId} />;
      case 'orders':
        return <OrdersList shopId={shopId} />;
      case 'products':
        return <ProductsTable shopId={shopId} />;
      case 'customers':
        return <CustomersTable shopId={shopId} />;
      case 'wallet':
        return <WalletSection shopId={shopId} shopData={shop} />;
      case 'billing':
        return <BillingSection shopId={shopId} />;
      case 'settings':
        return <Settings shopData={shop} />;
      case 'appointments':
      case 'bookings':
        return (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <p className="text-lg">{commonText.comingSoon}</p>
          </div>
        );
      default:
        return <Overview shopId={shopId} />;
    }
  };

  const commonText = {
    comingSoon: 'Coming Soon',
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 pt-16">
        <Sidebar
          shopName={shop.name}
          businessType={shop.business_type}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab as DashboardTab)}
        />

        <div className="flex-1 min-w-0 overflow-auto">
          {/* Mobile header */}
          <div className="lg:hidden sticky top-16 z-30 bg-gray-950/90 backdrop-blur-xl border-b border-gray-800 px-4 py-3">
            <h2 className="text-lg font-bold text-white capitalize">
              {activeTab}
            </h2>
          </div>

          <div className="p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">
            {renderContent()}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
