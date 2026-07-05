'use client';

import { motion } from 'framer-motion';

interface MagicLinkSentProps {
  email: string;
  onBack: () => void;
}

export default function MagicLinkSent({ email, onBack }: MagicLinkSentProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-md mx-auto"
    >
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 sm:p-10 text-center">
        <div className="flex justify-center mb-6">
          <div className="h-14 w-14 rounded-xl bg-[#25D366] flex items-center justify-center text-white text-2xl shadow-lg shadow-[#25D366]/20">
            ✉
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">
          Check your email
        </h1>
        <p className="text-gray-400 text-sm mb-2">
          A magic link has been sent to
        </p>
        <p className="text-gray-200 font-medium mb-8">{email}</p>

        <p className="text-gray-500 text-sm mb-8">
          Click the link in the email to sign in. If you don&apos;t see it,
          check your spam folder.
        </p>

        <button
          onClick={onBack}
          className="text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          &larr; Use a different email
        </button>
      </div>
    </motion.div>
  );
}
