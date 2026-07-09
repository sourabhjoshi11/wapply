'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, X } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export default function Hero() {
  const { t, lang } = useTranslation();
  const [visibleMessages, setVisibleMessages] = useState<number>(0);
  const [videoOpen, setVideoOpen] = useState(false);

  const chatMessages = t.hero.chatMessages || [];

  // Reset animation when language changes
  useEffect(() => {
    setVisibleMessages(0);
  }, [lang]);

  useEffect(() => {
    if (visibleMessages < chatMessages.length) {
      const timer = setTimeout(() => {
        setVisibleMessages((prev) => prev + 1);
      }, chatMessages[visibleMessages]?.delay ?? 2000);
      return () => clearTimeout(timer);
    }
    // Loop
    const resetTimer = setTimeout(() => setVisibleMessages(0), 10000);
    return () => clearTimeout(resetTimer);
  }, [visibleMessages, chatMessages]);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Background gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#25D366]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left content */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-sm font-medium mb-6">
                <span className="h-2 w-2 rounded-full bg-[#25D366] animate-pulse" />
                Your Shop, Always Open
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                {t.hero.headline}
                <br />
                <span className="text-[#25D366]">{t.hero.subheadline}</span>
              </h1>

              <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                {t.hero.description}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Link href="/login">
                  <Button size="xl" className="font-semibold text-base w-full sm:w-auto">
                    {t.hero.ctaPrimary}
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="xl"
                  className="font-medium text-base"
                  onClick={() => setVideoOpen(true)}
                >
                  <Play className="h-5 w-5" />
                  {t.hero.ctaSecondary}
                </Button>
              </div>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-8 mt-12 justify-center lg:justify-start"
            >
              {[
                { number: '10K+', label: 'Active Merchants' },
                { number: '1M+', label: 'Orders Processed' },
                { number: '50+', label: 'Cities' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl font-bold text-white">{stat.number}</div>
                  <div className="text-sm text-gray-500">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right - Chat mockup */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden lg:block"
          >
            <div className="relative mx-auto max-w-sm">
              {/* Phone frame */}
              <div className="bg-gray-900 rounded-3xl border border-gray-800 shadow-2xl shadow-[#25D366]/5 overflow-hidden">
                {/* Phone header */}
                <div className="bg-gray-950 px-4 py-3 border-b border-gray-800 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-[#25D366] flex items-center justify-center text-white font-bold text-sm">
                    W
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{t.hero.chatBotName}</p>
                    <p className="text-xs text-gray-500">{t.hero.chatBotStatus}</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="p-4 space-y-3 min-h-[400px] bg-gray-900">
                  <AnimatePresence mode="popLayout">
                    {chatMessages.slice(0, visibleMessages).map((msg, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className={
                          msg.sender === 'system'
                            ? 'flex justify-center'
                            : msg.sender === 'bot'
                            ? 'flex justify-start'
                            : 'flex justify-end'
                        }
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            msg.sender === 'system'
                              ? 'bg-gray-800 text-gray-300 text-center text-xs rounded-xl'
                              : msg.sender === 'bot'
                              ? 'bg-gray-800 text-gray-100 rounded-bl-md'
                              : 'bg-[#25D366] text-white rounded-br-md'
                          }`}
                        >
                          {msg.text.split('\n').map((line, j) => (
                            <p key={j}>{line}</p>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {visibleMessages < chatMessages.length && (
                    <div className="flex justify-start">
                      <div className="bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex gap-1">
                          <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input bar */}
                <div className="bg-gray-950 px-4 py-3 border-t border-gray-800">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-10 rounded-full bg-gray-800 border border-gray-700 px-4 flex items-center">
                      <span className="text-sm text-gray-500">{t.hero.chatPlaceholder}</span>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-[#25D366] flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating badge */}
              <div className="absolute -bottom-4 -right-4 bg-[#25D366] text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg shadow-[#25D366]/20">
                {t.hero.chatBadge}
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Demo Video Modal */}
      <Dialog open={videoOpen} onOpenChange={setVideoOpen}>
        <DialogContent className="sm:max-w-2xl bg-gray-950 border-gray-800">
          <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <Play className="h-16 w-16 text-[#25D366] mx-auto mb-4" />
              <p className="text-gray-400">Demo video coming soon</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
