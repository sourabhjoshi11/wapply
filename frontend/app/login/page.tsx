'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import SignInStep from '@/components/auth/SignInStep';
import SignUpForm from '@/components/auth/SignUpForm';

// Must be client-rendered (Supabase browser client needs browser APIs + env vars at runtime)
export const dynamic = 'force-dynamic';

  type Tab = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('signin');
  const [checking, setChecking] = useState(true);

  // If already logged in, go to dashboard
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard');
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-[#25D366] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      {/* Tab Switcher */}
      <div className="w-full max-w-md mx-auto mb-6 flex bg-gray-900 rounded-xl p-1 border border-gray-800">
        <button
          onClick={() => setTab('signin')}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            tab === 'signin'
              ? 'bg-[#25D366] text-white shadow'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setTab('signup')}
          className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            tab === 'signup'
              ? 'bg-[#25D366] text-white shadow'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          Sign Up
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'signin' ? (
          <motion.div
            key="signin"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            <SignInStep />
          </motion.div>
        ) : (
          <motion.div
            key="signup"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="w-full"
          >
            <SignUpForm />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
