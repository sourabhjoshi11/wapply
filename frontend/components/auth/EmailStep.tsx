'use client';

import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

const emailSchema = z.string().email('Please enter a valid email address');

interface EmailStepProps {
  onSuccess: (email: string, mode: 'ml' | 'otp') => void;
}

export default function EmailStep({ onSuccess }: EmailStepProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState<'ml' | 'otp' | null>(null);

  const sendLoginLink = async (mode: 'ml' | 'otp') => {
    setError('');
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Invalid email');
      return;
    }

    setSending(mode);
    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: parsed.data,
      });
      if (authError) {
        toast.error(authError.message);
        return;
      }
      if (mode === 'ml') {
        toast.success(`Magic link sent to ${parsed.data}`);
      } else {
        toast.success(`OTP sent to ${parsed.data}`);
      }
      onSuccess(parsed.data, mode);
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSending(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 sm:p-10">
        <div className="flex justify-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-[#25D366] flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-[#25D366]/20">
            W
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-2">
          Welcome to Wapply
        </h1>
        <p className="text-gray-400 text-center text-sm mb-8">
          Enter your email to sign in
        </p>

        <div className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1.5">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              className="w-full h-11 px-4 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm
                         placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#25D366]/50
                         focus:border-[#25D366] transition-colors"
            />
            {error && (
              <p className="text-red-400 text-xs mt-1.5">{error}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => sendLoginLink('ml')}
              disabled={sending !== null}
              className="flex-1 h-11 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:opacity-50
                         disabled:cursor-not-allowed text-white font-semibold text-sm
                         transition-colors flex items-center justify-center gap-2"
            >
              {sending === 'ml' ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" />
                  </svg>
                  Magic Link
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => sendLoginLink('otp')}
              disabled={sending !== null}
              className="flex-1 h-11 rounded-xl bg-[#25D366] hover:bg-[#1da851] disabled:opacity-50
                         disabled:cursor-not-allowed text-white font-semibold text-sm
                         transition-colors flex items-center justify-center gap-2"
            >
              {sending === 'otp' ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                  OTP Code
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
