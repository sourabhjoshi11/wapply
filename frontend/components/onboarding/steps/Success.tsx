'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { Download, Share2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useOnboardingStore } from '@/store/onboardingStore';
import { Button } from '@/components/ui/button';
import { tableApi } from '@/lib/api';

export default function Success() {
  const { t } = useTranslation();
  const router = useRouter();
  const botNumber = useOnboardingStore((s) => s.botNumber);
  const businessType = useOnboardingStore((s) => s.businessType);
  const shopId = useOnboardingStore((s) => s.shopId);
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    // Fire confetti
    const duration = 2000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 80,
        origin: { x: 0, y: 0.7 },
        colors: ['#25D366', '#ffffff', '#1da851'],
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 80,
        origin: { x: 1, y: 0.7 },
        colors: ['#25D366', '#ffffff', '#1da851'],
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, []);

  const handleShare = () => {
    const text = `Order karo mere WhatsApp bot se! 🛒\nNumber: ${botNumber}\nCatalog dekho aur order karo.`;
    const url = `https://wa.me/${botNumber?.replace('+', '')}?text=Hi`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`, '_blank');
  };

  const handleDownloadQrs = async () => {
    if (!shopId) return;
    try {
      const res = await tableApi.generateQrs(shopId);
      const blob = new Blob([res.data as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'table_qrs.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: generate individual QR codes info
      alert('QR download will be available once tables are configured.');
    }
  };

  const goToDashboard = () => {
    // Clear onboarding storage but KEEP api_key and shop_id for dashboard
    localStorage.removeItem('weai_onboarding');
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 pt-20">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg mx-auto text-center"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="text-6xl mb-6"
        >
          🎉
        </motion.div>

        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
          {t.onboarding.success.title}
        </h1>

        {/* QR Code */}
        {botNumber && (
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-white rounded-2xl shadow-xl">
              <QRCodeSVG
                value={`https://wa.me/${botNumber.replace('+', '')}`}
                size={160}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
          </div>
        )}

        <p className="text-gray-400 text-sm mb-8">
          {botNumber && (
            <span className="text-[#25D366] font-medium">{botNumber}</span>
          )}
        </p>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 mb-8">
          <Button onClick={handleShare} size="lg" className="w-full">
            <Share2 className="h-5 w-5 mr-2" />
            {t.onboarding.success.shareWhatsApp}
          </Button>

          {businessType === 'restaurant' && (
            <Button
              onClick={handleDownloadQrs}
              variant="outline"
              size="lg"
              className="w-full"
            >
              <Download className="h-5 w-5 mr-2" />
              {t.onboarding.success.downloadQrs}
            </Button>
          )}
        </div>

        {/* Checklist */}
        <div className="text-left p-4 rounded-xl bg-gray-900/50 border border-gray-800 mb-8">
          <div className="space-y-3 text-sm">
            <p className="text-gray-300 flex items-center gap-2">
              {t.onboarding.success.checklist1}
            </p>
            <p className="text-gray-300 flex items-center gap-2">
              {t.onboarding.success.checklist2}
            </p>
            <p className="text-gray-300 flex items-center gap-2">
              {t.onboarding.success.checklist3}
            </p>
          </div>
        </div>

        <Button onClick={goToDashboard} size="xl" className="w-full font-semibold">
          {t.onboarding.success.goToDashboard}
        </Button>
      </motion.div>
    </div>
  );
}
