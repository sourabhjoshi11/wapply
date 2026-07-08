import type { Metadata } from 'next';
import LandingContent from '@/components/landing/LandingContent';

export const metadata: Metadata = {
  title: 'Wapply - WhatsApp Business Bot for Indian Shops, Restaurants & Salons',
  description:
    "Apni shop ka WhatsApp bot banayein 10 minutes mein. Customers khud catalog dekhein, order karein, appointment book karein. India's simplest WhatsApp business solution — 1 month free trial.",
  openGraph: {
    title: 'Wapply - WhatsApp Business Bot for Indian Small Businesses',
    description:
      "Apni shop ka WhatsApp bot banayein 10 minutes mein. Customers khud catalog dekhein, order karein, appointment book karein. Free trial available.",
  url: 'https://wapply.store/',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Wapply WhatsApp Business Bot',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wapply - WhatsApp Business Bot',
    description:
      'Apni shop ka WhatsApp bot banayein 10 minutes mein. Free trial.',
    images: ['/og-image.png'],
  },
  alternates: {
    canonical: 'https://wapply.store/',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Wapply',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'India\'s simplest WhatsApp business solution. Turn your shop into a WhatsApp bot in 10 minutes. Customers browse catalog, place orders, and book appointments — all on WhatsApp.',
  url: 'https://wapply.store/',
  offers: [
    {
      '@type': 'Offer',
      price: '299',
      priceCurrency: 'INR',
      description: 'Basic plan — 500 orders/month',
    },
    {
      '@type': 'Offer',
      price: '499',
      priceCurrency: 'INR',
      description: 'Standard plan — 1,000 orders/month (Most Popular)',
    },
    {
      '@type': 'Offer',
      price: '799',
      priceCurrency: 'INR',
      description: 'Pro plan — 2,000 orders/month',
    },
  ],
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '250',
    bestRating: '5',
  },
  author: {
    '@type': 'Organization',
    name: 'Wapply',
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingContent />
    </>
  );
}
