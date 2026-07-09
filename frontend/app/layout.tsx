import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const APP_NAME = 'Wapply';
const APP_DEFAULT_TITLE = 'Wapply - More Orders, Less Work for Your Shop';
const APP_DESCRIPTION =
  "Turn WhatsApp into your shop's ordering system. Customers browse your catalog, place orders, and book appointments — all without apps or downloads. For Indian shops, restaurants, salons, and services.";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0b',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://wapply.store'),
  title: {
    default: APP_DEFAULT_TITLE,
    template: '%s | Wapply',
  },
  description: APP_DESCRIPTION,
  keywords: [
    'WhatsApp ordering',
    'order on WhatsApp',
    'online ordering for shops India',
    'restaurant ordering system',
    'salon appointment booking',
    'WhatsApp catalog for business',
    'small business tools India',
    'no app ordering',
    'restaurant QR menu ordering',
    'turf booking system',
    'WhatsApp commerce India',
    'digital India small business',
    'online store WhatsApp',
    'kirana store online ordering',
    'appointment booking WhatsApp',
  ],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  publisher: APP_NAME,
  robots: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
  manifest: '/manifest.json',
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    siteName: APP_NAME,
    title: APP_DEFAULT_TITLE,
    description: APP_DESCRIPTION,
    url: 'https://wapply.store/',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: APP_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: APP_DEFAULT_TITLE,
    description: APP_DESCRIPTION,
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: 'https://wapply.store/',
    languages: {
      en: 'https://wapply.store/',
      hi: 'https://wapply.store/hi',
    },
  },
  formatDetection: {
    telephone: true,
    email: false,
    address: false,
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': APP_NAME,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="alternate" hrefLang="en" href="https://wapply.store/" />
        <link rel="alternate" hrefLang="hi" href="https://wapply.store/hi" />
        <link rel="alternate" hrefLang="x-default" href="https://wapply.store/" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
