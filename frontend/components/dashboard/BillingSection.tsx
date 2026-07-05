'use client';

import { useEffect, useState } from 'react';
import {
  CreditCard,
  Zap,
  History,
  TrendingUp,
  ArrowUpCircle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InlineLoader } from '@/components/shared/LoadingSpinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  formatPrice,
  getBillingPlanPrice,
  getBillingPlanOrders,
  getBillingPlanLabel,
  getBillingBatchPricing,
} from '@/lib/utils';
import { billingApi } from '@/lib/api';
import type { BillingHistoryResponse, BillingTransaction, BillingPlanName } from '@/types';

interface BillingSectionProps {
  shopId: string;
}

export default function BillingSection({ shopId }: BillingSectionProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<BillingHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    loadData();
  }, [shopId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await billingApi.getHistory(shopId);
      const result = (res.data?.data || res.data) as BillingHistoryResponse;
      setData(result);
    } catch {
      // silent — likely no billing setup yet
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <InlineLoader />;

  const plan = data?.plan;
  const planLabel = plan ? getBillingPlanLabel(plan) : 'Free Trial';
  const planPrice = plan ? getBillingPlanPrice(plan) : 0;
  const orderLimit = data?.order_limit || 0;
  const monthlyCount = data?.monthly_order_count || 0;
  const extraPurchased = data?.extra_orders_purchased || 0;
  const totalAvailable = orderLimit + extraPurchased;
  const usagePercent = totalAvailable > 0 ? Math.round((monthlyCount / totalAvailable) * 100) : 0;
  const billingPaused = data?.billing_paused || false;
  const isSubscription = data?.mode === 'subscription';

  const batchPricing = plan ? getBillingBatchPricing(plan) : { price: 0, orders: 0 };

  const transactions: BillingTransaction[] = data?.transactions || [];

  return (
    <div className="space-y-6">
      {/* Plan Overview Card */}
      <Card className="bg-gradient-to-br from-purple-600/10 to-transparent border-purple-500/20">
        <CardContent className="p-8">
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-sm text-gray-400 mb-1">{t.dashboard.currentPlan}</p>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-white">{planLabel}</h2>
                {plan && (
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                    {formatPrice(planPrice)}{isSubscription ? '/mo' : ''}
                  </Badge>
                )}
              </div>
              {!plan && (
                <p className="text-sm text-yellow-400 mt-2">
                  Free trial — upgrade to continue after trial ends
                </p>
              )}
            </div>
            <CreditCard className="h-10 w-10 text-purple-400" />
          </div>

          {/* Usage Meter */}
          {totalAvailable > 0 && (
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">{t.dashboard.ordersUsed}</span>
                <span className="text-white font-medium">
                  {monthlyCount} / {totalAvailable}
                </span>
              </div>
              <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    usagePercent >= 90
                      ? 'bg-red-500'
                      : usagePercent >= 75
                      ? 'bg-yellow-500'
                      : 'bg-[#25D366]'
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>0</span>
                <span>
                  {extraPurchased > 0
                    ? `${orderLimit} (plan) + ${extraPurchased} (extra)`
                    : `${totalAvailable}`}
                </span>
              </div>
            </div>
          )}

          {billingPaused && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>Billing paused — order acceptance is suspended</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      {plan && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <Zap className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{t.dashboard.buyExtras}</p>
                  <p className="text-xs text-gray-500">
                    {formatPrice(batchPricing.price)} for {batchPricing.orders} extra orders
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Pay via Razorpay — extra orders never expire
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => toast.success('Contact owner to purchase extras')}
              >
                {t.dashboard.buyExtras}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <TrendingUp className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{t.dashboard.upgradePlan}</p>
                  <p className="text-xs text-gray-500">
                    Basic ₹299 · Standard ₹499 · Pro ₹799
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setShowUpgrade(true)}
              >
                {t.dashboard.upgradePlan}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Billing History */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="h-5 w-5 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-400 uppercase">
              {t.dashboard.billingHistory}
            </h3>
          </div>

          {transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">{t.dashboard.noBillingHistory}</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30"
                >
                  <div className="flex items-center gap-3">
                    {tx.type === 'subscription_charge' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    ) : tx.type === 'extra_batch' ? (
                      <Zap className="h-5 w-5 text-orange-400" />
                    ) : tx.type === 'plan_upgrade' ? (
                      <TrendingUp className="h-5 w-5 text-blue-400" />
                    ) : (
                      <ArrowUpCircle className="h-5 w-5 text-gray-400" />
                    )}
                    <div>
                      <p className="text-sm text-white">{tx.description}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(tx.created_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">
                      {formatPrice(tx.amount)}
                    </p>
                    {tx.plan && (
                      <p className="text-xs text-gray-500 capitalize">{tx.plan}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upgrade Dialog */}
      <Dialog open={showUpgrade} onOpenChange={setShowUpgrade}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.dashboard.upgradePlan}</DialogTitle>
            <DialogDescription>
              Choose a plan that fits your business. Extra orders never expire.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {(['basic', 'standard', 'pro'] as BillingPlanName[]).map((p) => {
              const price = getBillingPlanPrice(p);
              const orders = getBillingPlanOrders(p);
              const batch = getBillingBatchPricing(p);
              const isCurrent = plan === p;
              return (
                <div
                  key={p}
                  className={`p-4 rounded-xl border transition-all ${
                    isCurrent
                      ? 'border-[#25D366] bg-[#25D366]/5'
                      : 'border-gray-800 bg-gray-900/30 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white capitalize">
                        {getBillingPlanLabel(p)}
                      </span>
                      {isCurrent && (
                        <Badge className="bg-[#25D366]/20 text-[#25D366] border-0 text-xs">
                          Current
                        </Badge>
                      )}
                    </div>
                    <span className="text-lg font-bold text-white">
                      {formatPrice(price)}
                      <span className="text-sm font-normal text-gray-500">/mo</span>
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 space-y-1">
                    <p>• {orders.toLocaleString('en-IN')} free orders per month</p>
                    <p>• Extra batch: {formatPrice(batch.price)} for {batch.orders} orders</p>
                  </div>
                  {!isCurrent && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-3"
                      onClick={() => {
                        toast.success(`Contact owner to upgrade to ${getBillingPlanLabel(p)}`);
                        setShowUpgrade(false);
                      }}
                    >
                      Upgrade to {getBillingPlanLabel(p)}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowUpgrade(false)}>
              {t.common.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
