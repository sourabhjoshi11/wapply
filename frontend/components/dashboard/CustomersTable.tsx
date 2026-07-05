'use client';

import { useEffect, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InlineLoader } from '@/components/shared/LoadingSpinner';
import { formatPrice, formatDate } from '@/lib/utils';
import { customerApi } from '@/lib/api';
import type { Customer } from '@/types';

interface CustomersTableProps {
  shopId: string;
}

export default function CustomersTable({ shopId }: CustomersTableProps) {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadCustomers();
  }, [shopId]);

  const loadCustomers = async () => {
    try {
      const res = await customerApi.list(shopId);
      setCustomers((res.data?.data || res.data || []) as Customer[]);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const filtered = customers.filter((c) =>
    c.whatsapp_number.includes(search),
  );

  if (loading) return <InlineLoader />;

  return (
    <div>
      <div className="max-w-sm mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search by number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-500">{t.common.noData}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((customer) => (
            <div
              key={customer.id}
              className="flex items-center justify-between p-4 rounded-lg bg-gray-800/30 border border-gray-800"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-full bg-[#25D366]/10 flex items-center justify-center text-[#25D366] font-bold text-sm flex-shrink-0">
                  {customer.whatsapp_number?.slice(-2)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {customer.whatsapp_number}
                  </p>
                  {customer.language && (
                    <span className="text-xs text-gray-500">
                      {customer.language}
                    </span>
                  )}
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-6 text-sm text-gray-400">
                <div className="text-center">
                  <p className="font-medium text-white">
                    {customer.total_orders}
                  </p>
                  <p className="text-xs">Orders</p>
                </div>
                <div className="text-center">
                  <p className="font-medium text-white">
                    {formatPrice(customer.total_spent)}
                  </p>
                  <p className="text-xs">Spent</p>
                </div>
                {customer.last_order_date && (
                  <div className="text-xs text-gray-500">
                    {formatDate(customer.last_order_date)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
