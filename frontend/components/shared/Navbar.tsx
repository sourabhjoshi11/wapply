'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Globe, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { key: 'features', href: '#features' },
  { key: 'pricing', href: '#pricing' },
  { key: 'howItWorks', href: '#how-it-works' },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { t, lang, toggleLang } = useTranslation();

  const isDashboard = pathname?.startsWith('/dashboard');
  const isOnboarding = pathname?.startsWith('/onboarding');
  const isThankYou = pathname?.startsWith('/thank-you');

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });
    return () => listener?.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (isOnboarding) {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/90 backdrop-blur-xl border-b border-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366] font-bold text-white text-sm transition-transform group-hover:scale-105">
                W
              </div>
              <span className="text-xl font-bold text-white">
                <span className="text-[#25D366]">W</span>apply
              </span>
            </Link>
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-gray-950/90 backdrop-blur-xl border-b border-gray-800/50 shadow-lg shadow-black/10'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#25D366] font-bold text-white text-sm transition-transform group-hover:scale-105">
              W
            </div>
            <span className="text-xl font-bold text-white">
              <span className="text-[#25D366]">W</span>apply
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800/50 transition-all"
              >
                {t.nav[item.key as keyof typeof t.nav]}
              </Link>
            ))}
          </div>

          {/* Desktop Right */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800/50 transition-all"
            >
              <Globe className="h-4 w-4" />
              <span className="font-medium">{lang === 'hi' ? 'EN' : 'हि'}</span>
            </button>

            {isDashboard ? (
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="font-medium text-gray-300 border-gray-700 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
              >
                <LogOut className="h-4 w-4 mr-1.5" />
                Logout
              </Button>
            ) : isThankYou ? null : isLoggedIn ? (
              <Link href="/dashboard">
                <Button size="default" className="font-medium">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="default" className="font-medium">
                  {t.nav.startNow}
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={toggleLang}
              className="flex items-center gap-1 px-2 py-2 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800/50 transition-all"
            >
              <Globe className="h-4 w-4" />
              <span className="text-xs font-medium">
                {lang === 'hi' ? 'EN' : 'हि'}
              </span>
            </button>
            {!isDashboard && (
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-gray-300 hover:text-white rounded-lg hover:bg-gray-800/50 transition-all"
              >
                {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {isOpen && !isDashboard && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden border-t border-gray-800/50 bg-gray-950/95 backdrop-blur-xl overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="block px-4 py-3 text-sm text-gray-300 hover:text-white rounded-lg hover:bg-gray-800/50 transition-all"
                >
                  {t.nav[item.key as keyof typeof t.nav]}
                </Link>
              ))}
              <div className="pt-2">
                {isLoggedIn ? (
                  <Link href="/dashboard" className="block w-full">
                    <Button className="w-full font-medium">
                      Dashboard
                    </Button>
                  </Link>
                ) : (
                  <Link href="/login" className="block w-full">
                    <Button className="w-full font-medium">
                      {t.nav.startNow}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
