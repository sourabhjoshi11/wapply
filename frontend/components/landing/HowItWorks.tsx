'use client';

import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';

const STEP_ICONS = ['📝', '➕', '🚀'];

export default function HowItWorks() {
  const { t } = useTranslation();

  return (
    <section id="how-it-works" className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t.howItWorks.title}
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            {t.howItWorks.subtitle}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-1/2 left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-[#25D366]/0 via-[#25D366]/30 to-[#25D366]/0 -translate-y-1/2" />

          {t.howItWorks.steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.15 }}
              className="relative flex flex-col items-center text-center"
            >
              {/* Step number */}
              <div className="relative mb-6">
                <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-[#25D366]/20 to-[#25D366]/5 border border-[#25D366]/20 flex items-center justify-center text-3xl">
                  {STEP_ICONS[i]}
                </div>
                <div className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-[#25D366] text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </div>
              </div>

              <h3 className="text-xl font-semibold text-white mb-3">
                {step.title}
              </h3>
              <p className="text-gray-400 text-sm mb-4 max-w-xs">
                {step.desc}
              </p>
              <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#25D366]/10 text-[#25D366] text-xs font-medium border border-[#25D366]/20">
                ⏱ {step.time}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
