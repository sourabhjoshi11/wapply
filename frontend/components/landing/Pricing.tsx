'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function Pricing() {
  const { t } = useTranslation();

  const plans = [
    {
      key: 'basic',
      name: t.pricing.basic.name,
      price: t.pricing.basic.price,
      period: t.pricing.basic.period,
      orders: t.pricing.basic.orders,
      batch: t.pricing.basic.batch,
      features: t.pricing.basic.features,
      popular: false,
    },
    {
      key: 'standard',
      name: t.pricing.standard.name,
      price: t.pricing.standard.price,
      period: t.pricing.standard.period,
      orders: t.pricing.standard.orders,
      batch: t.pricing.standard.batch,
      features: t.pricing.standard.features,
      popular: true,
    },
    {
      key: 'pro',
      name: t.pricing.pro.name,
      price: t.pricing.pro.price,
      period: t.pricing.pro.period,
      orders: t.pricing.pro.orders,
      batch: t.pricing.pro.batch,
      features: t.pricing.pro.features,
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t.pricing.title}
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            {t.pricing.subtitle}
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={`relative rounded-2xl border p-8 transition-all duration-300 border-gray-800 bg-gray-900/50 hover:border-[#25D366]/40 hover:bg-[#25D366]/5 hover:shadow-xl hover:shadow-[#25D366]/5`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-[#25D366] text-white px-4 py-1 text-xs font-semibold border-0">
                    {t.pricing.popular}
                  </Badge>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-semibold text-white mb-2">
                  {plan.name}
                </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">
                      {plan.price}
                    </span>
                    <span className="text-gray-400">{plan.period}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">{plan.orders}</p>
                  <p className="text-sm text-gray-500">{plan.batch}</p>
              </div>

              {/* Free trial badge */}
              <Badge variant="outline" className="mb-6 text-xs border-[#25D366]/30 text-[#25D366]">
                🎁 {t.pricing.freeTrial}
              </Badge>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-gray-300">
                    <span className="flex-shrink-0 h-5 w-5 rounded-full bg-[#25D366]/10 flex items-center justify-center">
                      <Check className="h-3 w-3 text-[#25D366]" />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>

              <Link href="/login">
                <Button
                  variant="outline"
                  className="w-full font-medium hover:bg-[#25D366] hover:text-white hover:border-[#25D366]"
                  size="lg"
                >
                  {t.nav.startNow}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
