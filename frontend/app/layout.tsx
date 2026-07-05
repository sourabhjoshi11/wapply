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
const APP_DEFAULT_TITLE = 'Wapply - WhatsApp Business Bot for Indian Small Businesses';
const APP_DESCRIPTION =
  "Apni shop ka WhatsApp bot banayein 10 minutes mein. Customers khud catalog dekhein, order karein, appointment book karein. India's simplest WhatsApp business solution.";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0b',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://wapply.in'),
  title: {
    default: APP_DEFAULT_TITLE,
    template: '%s | Wapply',
  },
  description: APP_DESCRIPTION,
  keywords: [
    'WhatsApp bot',
    'WhatsApp business',
    'shop automation',
    'kirana store automation',
    'India small business',
    'WhatsApp ordering system',
    'restaurant ordering system',
    'salon booking app',
    'appointment booking WhatsApp',
    'WhatsApp catalog',
    'digital India',
    'online ordering for shops',
    'WhatsApp commerce',
    'small business tools India',
    'no app ordering',
    'restaurant QR ordering',
    'turf booking system',
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
    url: 'https://wapply.in/',
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
    canonical: 'https://wapply.in/',
    languages: {
      en: 'https://wapply.in/',
      hi: 'https://wapply.in/hi',
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
        <link rel="alternate" hrefLang="en" href="https://wapply.in/" />
        <link rel="alternate" hrefLang="hi" href="https://wapply.in/hi" />
        <link rel="alternate" hrefLang="x-default" href="https://wapply.in/" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
