'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Wallet,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  Calendar,
  BookOpen,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { BusinessType } from '@/types';

interface SidebarProps {
  shopName?: string;
  businessType?: BusinessType;
  activeTab: string;
  onTabChange: (tab: string) => void;
  orderCount?: number;
}

export default function Sidebar({
  shopName,
  businessType,
  activeTab,
  onTabChange,
  orderCount = 0,
}: SidebarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);

  const navItems = [
    { key: 'overview', label: t.dashboard.overview, icon: LayoutDashboard },
    { key: 'orders', label: t.dashboard.orders, icon: ShoppingCart, badge: orderCount },
    { key: 'products', label: t.dashboard.products, icon: Package },
    ...(businessType === 'salon'
      ? [{ key: 'appointments', label: t.dashboard.appointments, icon: Calendar }]
      : []),
    ...(businessType === 'turf'
      ? [{ key: 'bookings', label: t.dashboard.bookings, icon: BookOpen }]
      : []),
    { key: 'customers', label: t.dashboard.customers, icon: Users },
    { key: 'wallet', label: t.dashboard.wallet, icon: Wallet },
    { key: 'billing', label: t.dashboard.billing, icon: CreditCard },
    { key: 'settings', label: t.dashboard.settings, icon: Settings },
  ];

  const TabButton = ({
    item,
    onClick,
  }: {
    item: (typeof navItems)[number];
    onClick?: () => void;
  }) => {
    const Icon = item.icon;
    const isActive = activeTab === item.key;
    return (
      <button
        onClick={() => {
          onTabChange(item.key);
          onClick?.();
        }}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
          isActive
            ? 'bg-[#25D366]/10 text-[#25D366] border border-[#25D366]/20'
            : 'text-gray-400 hover:text-white hover:bg-gray-800/50',
        )}
      >
        <Icon className="h-5 w-5 flex-shrink-0" />
        <span className="truncate">{item.label}</span>
        {item.badge && item.badge > 0 ? (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1">
            {item.badge}
          </span>
        ) : null}
      </button>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366] font-bold text-white text-sm">
            W
          </div>
          <div className="min-w-0">
            <span className="text-lg font-bold text-white block leading-tight">
              WE<span className="text-[#25D366]">AI</span>
            </span>
            {shopName && (
              <span className="text-xs text-gray-500 truncate block">
                {shopName}
              </span>
            )}
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <TabButton key={item.key} item={item} />
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-gray-800">
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/login');
          }}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="h-5 w-5" />
          <span>{t.dashboard.logout}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex flex-col border-r border-gray-800 bg-gray-950 transition-all duration-300',
          desktopOpen ? 'w-60' : 'w-16',
        )}
      >
        <button
          onClick={() => setDesktopOpen(!desktopOpen)}
          className="absolute -right-3 top-20 z-10 h-6 w-6 rounded-full border border-gray-800 bg-gray-900 flex items-center justify-center text-gray-400 hover:text-white"
        >
          {desktopOpen ? '◀' : '▶'}
        </button>
        {sidebarContent}
      </aside>

      {/* Mobile bottom tabs */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950 px-2 py-1 safe-area-bottom">
        <div className="flex items-center justify-around">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onTabChange(item.key)}
                className={cn(
                  'flex flex-col items-center py-1.5 px-2 rounded-lg transition-all min-w-0',
                  isActive ? 'text-[#25D366]' : 'text-gray-500',
                )}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 text-[8px] font-bold text-white flex items-center justify-center">
                      {item.badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[10px] mt-0.5 truncate max-w-[48px]">
                  {item.label}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className={cn(
              'flex flex-col items-center py-1.5 px-2 rounded-lg',
              mobileOpen ? 'text-[#25D366]' : 'text-gray-500',
            )}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
            <span className="text-[10px] mt-0.5">More</span>
          </button>
        </div>
      </div>

      {/* Mobile drawer for more items */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm">
          <div className="absolute bottom-16 left-2 right-2 bg-gray-900 rounded-2xl border border-gray-800 p-3 shadow-xl max-h-[60vh] overflow-y-auto">
            <div className="space-y-1">
              {navItems.slice(5).map((item) => (
                <TabButton
                  key={item.key}
                  item={item}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
              <hr className="border-gray-800 my-2" />
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push('/login');
                }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
              >
                <LogOut className="h-5 w-5" />
                <span>{t.dashboard.logout}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
