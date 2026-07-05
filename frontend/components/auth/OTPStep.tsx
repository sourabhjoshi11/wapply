'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import api from '@/lib/api';

const OTP_LENGTH = 8;

interface OTPStepProps {
  email: string;
  onBack: () => void;
}

export default function OTPStep({ email, onBack }: OTPStepProps) {
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Auto-focus first box on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Resend countdown
  useEffect(() => {
    if (countdown <= 0) {
      setCanResend(true);
      return;
    }
    if (!canResend) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, canResend]);

  const otpString = otp.join('');

  const handleChange = useCallback(
    (index: number, value: string) => {
      // Only allow single digit
      const digit = value.replace(/\D/g, '').slice(0, 1);
      if (!digit && value !== '') return;

      const next = [...otp];
      next[index] = digit;
      setOtp(next);

      // Auto-advance
      if (digit && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [otp],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !otp[index] && index > 0) {
        // Clear current and focus previous
        const next = [...otp];
        next[index] = '';
        setOtp(next);
        inputRefs.current[index - 1]?.focus();
      }
    },
    [otp],
  );

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;

    const next = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]!;
    }
    setOtp(next);

    // Focus next empty or last box
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  }, []);

  const handleVerify = async () => {
    if (otpString.length !== OTP_LENGTH) return;

    setVerifying(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: otpString,
        type: 'email',
      });

      if (verifyError) {
        toast.error(verifyError.message);
        setOtp(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        return;
      }

      // Session is now in cookies via Supabase SSR
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Failed to get session');
        return;
      }

      // Exchange session for shop info via backend
      const authRes = await api.post(
        '/api/auth/supabase-session',
        {},
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'X-API-Key': '',
          },
        },
      );

      const { shop } = authRes.data as {
        shop: Record<string, unknown> | null;
        has_api_key: boolean;
        email: string;
      };

      // Route based on shop existence
      if (!shop) {
        window.location.href = '/onboarding';
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
      toast.error(msg);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setCanResend(false);
    setCountdown(30);

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({ email });
      if (otpError) {
        toast.error(otpError.message);
        return;
      }
      toast.success(`OTP resent to ${email}`);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch {
      toast.error('Failed to resend OTP');
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
        <h1 className="text-2xl font-bold text-white text-center mb-2">
          Check your email
        </h1>
        <p className="text-gray-400 text-center text-sm mb-8">
          Enter the 8-digit code sent to{' '}
          <span className="text-gray-200 font-medium">{email}</span>
        </p>

        {/* OTP boxes */}
        <div className="flex gap-3 justify-center mb-8" onPaste={handlePaste}>
          {Array.from({ length: OTP_LENGTH }).map((_, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={otp[i]}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-12 h-14 text-center text-xl font-bold text-white bg-gray-800 border
                         border-gray-700 rounded-xl focus:outline-none focus:ring-2
                         focus:ring-[#25D366]/50 focus:border-[#25D366] transition-colors
                         [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none
                         [&::-webkit-outer-spin-button]:appearance-none"
            />
          ))}
        </div>

        {/* Verify button */}
        <button
          onClick={handleVerify}
          disabled={otpString.length !== OTP_LENGTH || verifying}
          className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#1da851] disabled:opacity-50
                     disabled:cursor-not-allowed text-white font-semibold text-sm
                     transition-colors flex items-center justify-center gap-2 mb-6"
        >
          {verifying ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Verifying...
            </>
          ) : (
            'Verify'
          )}
        </button>

        {/* Resend + Change email */}
        <div className="flex items-center justify-center gap-4 text-sm">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            Change email &rarr;
          </button>

          <span className="text-gray-600">|</span>

          {canResend ? (
            <button
              onClick={handleResend}
              className="text-[#25D366] hover:text-[#1da851] font-medium transition-colors"
            >
              Resend OTP
            </button>
          ) : (
            <span className="text-gray-500">Resend in {countdown}s</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
