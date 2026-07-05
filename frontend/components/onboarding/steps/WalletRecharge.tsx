'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatPrice, getPlanPrice } from '@/lib/utils';
import { loadRazorpayScript, openRazorpayCheckout } from '@/lib/razorpay';
import { walletApi } from '@/lib/api';
import axios from 'axios';

const RECHARGE_AMOUNTS = [500, 1000, 2000];

export default function WalletRecharge() {
  const { t } = useTranslation();
  const shopId = useOnboardingStore((s) => s.shopId);
  const planType = useOnboardingStore((s) => s.planType);
  const setWalletRecharged = useOnboardingStore((s) => s.setWalletRecharged);
  const nextStep = useOnboardingStore((s) => s.nextStep);

  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(false);

  const planPrice = getPlanPrice(planType || 'shop');

  const handleRecharge = async () => {
    const finalAmount = isCustom ? Number(customAmount) : amount;
    if (!finalAmount || finalAmount < 10) {
      toast.error('Enter a valid amount (min ₹10)');
      return;
    }

    setLoading(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast.error('Failed to load payment gateway');
        setLoading(false);
        return;
      }

      // Create Razorpay order via our API
      const orderRes = await axios.post('/api/recharge', {
        amount: finalAmount,
        shop_id: shopId,
      });
      const orderData = orderRes.data as {
        order_id: string;
        amount: number;
        currency: string;
      };

      openRazorpayCheckout({
        orderId: orderData.order_id,
        amount: finalAmount,
        name: 'Wapply Wallet Recharge',
        onSuccess: async (paymentId, orderId) => {
          try {
            await walletApi.verifyPayment({
              razorpay_payment_id: paymentId,
              razorpay_order_id: orderId,
              shop_id: shopId || '',
              amount: finalAmount,
            });
            setWalletRecharged(true);
            toast.success('Wallet recharged successfully! 🎉');
            nextStep();
          } catch {
            toast.error('Payment verification failed. Contact support.');
            nextStep();
          }
        },
        onDismiss: () => {
          toast.error('Payment cancelled');
          setLoading(false);
        },
      });
    } catch {
      toast.error('Failed to initiate payment');
      setLoading(false);
    }
  };

  const skipRecharge = () => {
    setWalletRecharged(false);
    nextStep();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-2xl mx-auto"
    >
      <h2 className="text-2xl font-bold text-white mb-6">
        {t.onboarding.walletRecharge.title}
      </h2>

      {/* Plan Summary */}
      <Card className="mb-8">
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">
            {t.onboarding.walletRecharge.planSummary}
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold text-white capitalize">
                {planType} Plan — {formatPrice(planPrice)}/month
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {t.onboarding.walletRecharge.afterTrial}
              </p>
            </div>
            <Badge className="bg-[#25D366] text-white border-0 px-4 py-1.5 text-sm">
              🎁 {t.onboarding.walletRecharge.freeTrial}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Recharge options */}
      <div className="mb-8">
        <h3 className="text-sm font-semibold text-gray-400 mb-4">
          {t.onboarding.walletRecharge.rechargeOptions}
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          {RECHARGE_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => {
                setIsCustom(false);
                setAmount(amt);
              }}
              className={`relative p-4 rounded-xl border text-center transition-all ${
                !isCustom && amount === amt
                  ? 'border-[#25D366] bg-[#25D366]/10 text-white'
                  : 'border-gray-800 bg-gray-900/30 text-gray-300 hover:border-gray-700'
              }`}
            >
              {amt === 1000 && (
                <span className="absolute -top-2 -right-2 text-[10px] px-2 py-0.5 rounded-full bg-[#25D366] text-white font-medium">
                  {t.onboarding.walletRecharge.recommended}
                </span>
              )}
              <p className="text-xl font-bold">{formatPrice(amt)}</p>
            </button>
          ))}
        </div>

        {/* Custom amount */}
        <div className="space-y-1">
          <Label>{t.onboarding.walletRecharge.custom}</Label>
          <Input
            type="number"
            placeholder="Enter amount"
            value={isCustom ? customAmount : ''}
            onFocus={() => setIsCustom(true)}
            onChange={(e) => {
              setIsCustom(true);
              setCustomAmount(e.target.value);
            }}
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 text-center mb-6">
        {t.onboarding.walletRecharge.note}
      </p>

      <div className="flex gap-3">
        <Button variant="outline" onClick={skipRecharge} className="flex-1">
          Skip
        </Button>
        <Button
          onClick={handleRecharge}
          disabled={loading}
          size="lg"
          className="flex-1"
        >
          {loading ? 'Processing...' : t.onboarding.walletRecharge.recharge}
        </Button>
      </div>
    </motion.div>
  );
}
