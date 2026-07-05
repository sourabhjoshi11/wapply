'use client';

import { useEffect, useState } from 'react';
import { Wallet, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InlineLoader } from '@/components/shared/LoadingSpinner';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatPrice, getPlanPrice, getFreeOrderLimit, getPerOrderCharge } from '@/lib/utils';
import { walletApi, orderApi } from '@/lib/api';
import { loadRazorpayScript, openRazorpayCheckout } from '@/lib/razorpay';
import type { Transaction, Shop } from '@/types';
import axios from 'axios';

interface WalletSectionProps {
  shopId: string;
  shopData?: Shop | null;
}

export default function WalletSection({ shopId, shopData }: WalletSectionProps) {
  const { t } = useTranslation();
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRecharge, setShowRecharge] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState(500);
  const [processing, setProcessing] = useState(false);

  const planType = shopData?.plan_type || 'shop';
  const planPrice = getPlanPrice(planType);
  const freeLimit = getFreeOrderLimit(planType);
  const perOrderCharge = getPerOrderCharge(planType);
  const extraOrders = Math.max(0, totalOrders - freeLimit);
  const totalDeduction = planPrice + extraOrders * perOrderCharge;

  useEffect(() => {
    loadData();
  }, [shopId]);

  const loadData = async () => {
    try {
      const [walletRes, txRes, orderRes] = await Promise.all([
        walletApi.getBalance(shopId),
        walletApi.transactions(shopId),
        orderApi.list(shopId),
      ]);

      setBalance(
        (walletRes.data?.balance ?? walletRes.data?.data?.balance) || 0,
      );
      setTransactions(
        (txRes.data?.data || txRes.data || []) as Transaction[],
      );
      const orders = (orderRes.data?.data || orderRes.data || []) as { items?: unknown[] }[];
      setTotalOrders(orders.length);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleRecharge = async () => {
    if (rechargeAmount < 10) {
      toast.error('Minimum ₹10');
      return;
    }
    setProcessing(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast.error('Failed to load payment');
        setProcessing(false);
        return;
      }

      const orderRes = await axios.post('/api/recharge', {
        amount: rechargeAmount,
        shop_id: shopId,
      });
      const orderData = orderRes.data as {
        order_id: string;
        amount: number;
        currency: string;
      };

      openRazorpayCheckout({
        orderId: orderData.order_id,
        amount: rechargeAmount,
        name: 'Wapply Wallet Recharge',
        onSuccess: async (paymentId, orderId) => {
          try {
            await walletApi.credit({
              shop_id: shopId,
              amount: rechargeAmount,
              razorpay_payment_id: paymentId,
              razorpay_order_id: orderId,
            });
            toast.success('Recharge successful!');
            setShowRecharge(false);
            loadData();
          } catch {
            toast.error('Payment verified but credit failed. Contact support.');
          }
        },
        onDismiss: () => {
          toast.error('Payment cancelled');
          setProcessing(false);
        },
      });
    } catch {
      toast.error('Failed to initiate payment');
      setProcessing(false);
    }
  };

  if (loading) return <InlineLoader />;

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <Card className="bg-gradient-to-br from-[#25D366]/10 to-transparent border-[#25D366]/20">
        <CardContent className="p-8 text-center">
          <Wallet className="h-12 w-12 text-[#25D366] mx-auto mb-4" />
          <p className="text-sm text-gray-400 mb-1">
            {t.dashboard.walletBalance}
          </p>
          <p className="text-4xl font-bold text-white mb-4">
            {formatPrice(balance)}
          </p>
          {balance < 200 && (
            <p className="text-sm text-yellow-400 mb-4">{t.dashboard.lowBalance}</p>
          )}
          <Button
            size="lg"
            onClick={() => setShowRecharge(true)}
          >
            {t.dashboard.recharge}
          </Button>
        </CardContent>
      </Card>

      {/* Usage summary */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            Usage This Month
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Base subscription ({planType})</span>
              <span className="font-medium">{formatPrice(planPrice)}</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>
                Orders ({totalOrders} total, {extraOrders} extra × {formatPrice(perOrderCharge)})
              </span>
              <span className="font-medium">
                {formatPrice(extraOrders * perOrderCharge)}
              </span>
            </div>
            <hr className="border-gray-800" />
            <div className="flex justify-between text-white font-semibold">
              <span>Total deducted</span>
              <span>{formatPrice(totalDeduction)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction history */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-gray-400 uppercase mb-4">
            Transactions
          </h3>
          {transactions.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-800/30"
                >
                  <div className="flex items-center gap-3">
                    {tx.type === 'credit' ? (
                      <ArrowUpCircle className="h-5 w-5 text-green-400" />
                    ) : (
                      <ArrowDownCircle className="h-5 w-5 text-red-400" />
                    )}
                    <div>
                      <p className="text-sm text-white">{tx.description}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(tx.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-sm font-medium ${
                        tx.type === 'credit'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {tx.type === 'credit' ? '+' : '-'}
                      {formatPrice(tx.amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Balance: {formatPrice(tx.balance_after)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recharge dialog */}
      <Dialog open={showRecharge} onOpenChange={setShowRecharge}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dashboard.recharge}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {[500, 1000, 2000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setRechargeAmount(amt)}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    rechargeAmount === amt
                      ? 'border-[#25D366] bg-[#25D366]/10 text-white'
                      : 'border-gray-800 bg-gray-900/30 text-gray-400 hover:border-gray-700'
                  }`}
                >
                  <span className="text-lg font-bold">{formatPrice(amt)}</span>
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <p className="text-xs text-gray-500">Custom amount</p>
              <Input
                type="number"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(Number(e.target.value))}
                min={10}
              />
            </div>
            <Button
              onClick={handleRecharge}
              disabled={processing}
              className="w-full"
            >
              {processing
                ? 'Processing...'
                : `Pay ${formatPrice(rechargeAmount)}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
