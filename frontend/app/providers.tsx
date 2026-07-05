'use client';

import { LangProvider } from '@/i18n/LangContext';
import { Toaster } from 'react-hot-toast';
import Navbar from '@/components/shared/Navbar';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LangProvider>
      <Navbar />
      <main className="min-h-screen">{children}</main>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#18181b',
            color: '#fafafa',
            border: '1px solid #27272a',
            borderRadius: '12px',
          },
          success: {
            iconTheme: {
              primary: '#25D366',
              secondary: '#fafafa',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fafafa',
            },
          },
        }}
      />
    </LangProvider>
  );
}
