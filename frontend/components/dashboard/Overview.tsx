'use client';

import { useEffect, useState } from 'react';
import { ShoppingCart, IndianRupee, MessageCircle, Wallet } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils';
import { orderApi, walletApi } from '@/lib/api';
import type { Order, DashboardStats } from '@/types';
import toast from 'react-hot-toast';

interface OverviewProps {
  shopId: string;
}

export default function Overview({ shopId }: OverviewProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats>({
    today_orders: 0,
    today_revenue: 0,
    active_conversations: 0,
    wallet_balance: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [shopId]);

  const loadData = async () => {
    try {
      const [ordersRes, walletRes] = await Promise.all([
        orderApi.list(shopId, { limit: '5' }),
        walletApi.getBalance(shopId),
      ]);

      const orders = (ordersRes.data?.data || ordersRes.data || []) as Order[];
      const wallet = (walletRes.data?.data || walletRes.data || {}) as {
        balance?: number;
      };

      const today = new Date().toDateString();
      const todayOrders = orders.filter(
        (o) => new Date(o.created_at).toDateString() === today,
      );

      setStats({
        today_orders: todayOrders.length,
        today_revenue: todayOrders.reduce(
          (sum, o) => sum + (o.status !== 'CANCELLED' ? o.total : 0),
          0,
        ),
        active_conversations: 0,
        wallet_balance: wallet.balance || 0,
      });
      setRecentOrders(orders.slice(0, 5));
    } catch {
      // silent fail for initial load
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: string, status: string) => {
    try {
      await orderApi.updateStatus(orderId, status);
      toast.success(`Order ${status.toLowerCase()}`);
      loadData();
    } catch {
      toast.error('Failed to update order');
    }
  };

  const statCards = [
    {
      label: t.dashboard.todayOrders,
      value: stats.today_orders,
      icon: ShoppingCart,
      color: 'text-blue-400 bg-blue-500/10',
    },
    {
      label: t.dashboard.todayRevenue,
      value: formatPrice(stats.today_revenue),
      icon: IndianRupee,
      color: 'text-green-400 bg-green-500/10',
    },
    {
      label: t.dashboard.activeConversations,
      value: stats.active_conversations,
      icon: MessageCircle,
      color: 'text-purple-400 bg-purple-500/10',
    },
    {
      label: t.dashboard.walletBalance,
      value: formatPrice(stats.wallet_balance),
      icon: Wallet,
      color: 'text-yellow-400 bg-yellow-500/10',
      warning: stats.wallet_balance < 200,
    },
  ];

  if (loading) {
    return (
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-gray-800 rounded w-24 mb-3" />
              <div className="h-8 bg-gray-800 rounded w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Stats cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-400">{stat.label}</span>
                  <div className={`p-2 rounded-lg ${stat.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                {stat.warning && (
                  <p className="text-xs text-yellow-400 mt-1">
                    {t.dashboard.lowBalance}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent orders */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            Recent Orders
          </h3>
          {recentOrders.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30 border border-gray-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">
                      {order.order_code}
                    </p>
                    <p className="text-xs text-gray-500">
                      {order.customer_number} • {formatPrice(order.total)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        order.status === 'PENDING'
                          ? 'warning'
                          : order.status === 'ACCEPTED'
                          ? 'default'
                          : order.status === 'DELIVERED'
                          ? 'success'
                          : 'destructive'
                      }
                    >
                      {order.status}
                    </Badge>
                    {order.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() =>
                            handleStatusUpdate(order.id, 'ACCEPTED')
                          }
                          className="text-xs px-2 py-1 rounded bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors"
                        >
                          {t.dashboard.accept}
                        </button>
                        <button
                          onClick={() =>
                            handleStatusUpdate(order.id, 'CANCELLED')
                          }
                          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                        >
                          {t.dashboard.cancel}
                        </button>
                      </>
                    )}
                    {order.status === 'ACCEPTED' && (
                      <button
                        onClick={() =>
                          handleStatusUpdate(order.id, 'DELIVERED')
                        }
                        className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors"
                      >
                        {t.dashboard.done}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
