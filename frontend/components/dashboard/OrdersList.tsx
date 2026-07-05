'use client';

import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  ShoppingCart,
  Check,
  X,
  CheckCircle2,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { InlineLoader } from '@/components/shared/LoadingSpinner';
import { formatPrice, getTimeElapsed, ORDER_STATUS_COLORS } from '@/lib/utils';
import { orderApi } from '@/lib/api';
import { subscribeToOrders } from '@/lib/supabase';
import type { Order, OrderStatus } from '@/types';

interface OrdersListProps {
  shopId: string;
}

const STATUS_FILTERS: (OrderStatus | 'ALL')[] = [
  'ALL',
  'PENDING',
  'ACCEPTED',
  'DELIVERED',
  'CANCELLED',
];

export default function OrdersList({ shopId }: OrdersListProps) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderApi.list(shopId);
      setOrders((res.data?.data || res.data || []) as Order[]);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadOrders();

    // Real-time subscription
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const unsubscribe = subscribeToOrders(shopId, (newOrder) => {
        setOrders((prev) => [newOrder as unknown as Order, ...prev]);
        toast.success('New order received!');
      });
      return unsubscribe;
    }
  }, [shopId, loadOrders]);

  const handleStatusUpdate = async (
    orderId: string,
    status: OrderStatus,
  ) => {
    try {
      await orderApi.updateStatus(orderId, status);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId ? { ...o, status } : o,
        ),
      );
      toast.success(`Order ${status.toLowerCase()}`);
    } catch {
      toast.error('Failed to update order');
    }
  };

  const filteredOrders =
    filter === 'ALL'
      ? orders
      : orders.filter((o) => o.status === filter);

  if (loading) return <InlineLoader />;

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === f
                ? 'bg-[#25D366] text-white'
                : 'bg-gray-800/50 text-gray-400 hover:text-white'
            }`}
          >
            {f === 'ALL' ? t.dashboard.all : t.dashboard[f.toLowerCase() as keyof typeof t.dashboard]}
          </button>
        ))}
      </div>

      {/* Orders */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <ShoppingCart className="h-12 w-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-500">No orders found</p>
            </CardContent>
          </Card>
        ) : (
          filteredOrders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold text-white">
                        {order.order_code}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${ORDER_STATUS_COLORS[order.status]}`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">
                      {order.customer_number}
                    </p>
                    <p className="text-xs text-gray-500">
                      {getTimeElapsed(order.created_at)}
                    </p>

                    {/* Items */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {order.items?.map((item, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400"
                        >
                          {item.name} x{item.quantity}
                        </span>
                      ))}
                    </div>

                    {order.address && (
                      <p className="text-xs text-gray-500 mt-1">
                        📍 {order.address}
                      </p>
                    )}
                    {order.table_number && (
                      <p className="text-xs text-gray-500 mt-1">
                        🪑 Table {order.table_number}
                      </p>
                    )}
                  </div>

                  {/* Right: amount + actions */}
                  <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-3 flex-shrink-0">
                    <span className="text-xl font-bold text-white">
                      {formatPrice(order.total)}
                    </span>

                    <div className="flex gap-1">
                      {order.status === 'PENDING' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              handleStatusUpdate(order.id, 'ACCEPTED')
                            }
                          >
                            <Check className="h-4 w-4 mr-1" />
                            {t.dashboard.accept}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              handleStatusUpdate(order.id, 'CANCELLED')
                            }
                          >
                            <X className="h-4 w-4 mr-1" />
                            {t.dashboard.cancel}
                          </Button>
                        </>
                      )}
                      {order.status === 'ACCEPTED' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            handleStatusUpdate(order.id, 'DELIVERED')
                          }
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          {t.dashboard.done}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
