'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function ThankYouPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/');
    }, 5000);

    const interval = setInterval(() => {
      setCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [router]);

  const goHome = useCallback(() => router.push('/'), [router]);
  const goDashboard = useCallback(() => router.push('/dashboard'), [router]);

  const progressPercent = ((5 - countdown) / 5) * 100;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-md mx-auto text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2, stiffness: 200 }}
          className="text-7xl mb-6"
        >
          🚀
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl sm:text-4xl font-bold text-white mb-4"
        >
          Welcome to Wapply!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-gray-400 mb-6"
        >
          Your WhatsApp bot is live. Redirecting you to home in {countdown}...
        </motion.p>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="w-full h-2 bg-gray-800 rounded-full mb-8 overflow-hidden"
        >
          <motion.div
            className="h-full bg-[#25D366] rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.1 }}
          />
        </motion.div>

        {/* Countdown text */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-5xl font-bold text-[#25D366] mb-8 tabular-nums"
        >
          {countdown}
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col gap-3"
        >
          <button
            onClick={goHome}
            className="w-full py-3 px-6 rounded-xl bg-[#25D366] text-white font-semibold text-base hover:bg-[#1da851] transition-colors active:scale-[0.97]"
          >
            Go to Home Now
          </button>
          <button
            onClick={goDashboard}
            className="w-full py-3 px-6 rounded-xl border border-gray-700 text-gray-200 font-medium text-base hover:bg-gray-800 transition-colors active:scale-[0.97]"
          >
            Go to Dashboard
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
