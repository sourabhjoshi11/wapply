'use client';

import { motion } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

const AVATAR_COLORS = ['#25D366', '#3B82F6', '#F59E0B'];

export default function Testimonials() {
  const { t } = useTranslation();

  return (
    <section className="relative py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t.testimonials.title}
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {t.testimonials.items.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="relative p-6 rounded-2xl border border-gray-800 bg-gray-900/30 hover:bg-gray-900/60 transition-all duration-300"
            >
              {/* Quote mark */}
              <div className="text-4xl text-[#25D366]/20 absolute top-4 right-6 leading-none font-serif">
                &ldquo;
              </div>

              <p className="text-gray-300 text-sm leading-relaxed mb-6 relative z-10">
                &ldquo;{item.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback
                    style={{ backgroundColor: AVATAR_COLORS[i] || '#25D366' }}
                    className="text-white text-sm font-medium"
                  >
                    {item.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-white">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.shop}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
