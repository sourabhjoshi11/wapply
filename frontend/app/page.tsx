import type { Metadata } from 'next';
import LandingContent from '@/components/landing/LandingContent';

export const metadata: Metadata = {
  title: 'Wapply - More Orders, Less Work for Your Shop',
  description:
    'Let your customers browse catalog, place orders, and book appointments — all on their own. You just accept. Free 1-month trial.',
  openGraph: {
    title: 'Wapply - More Orders, Less Work',
    description:
      'Your customers can browse, order, and book anytime. Free 1-month trial.',
    url: 'https://wapply.store/',
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Wapply',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wapply',
    description:
      'Get more orders with less effort. Free 1-month trial.',
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
    'India\'s simplest digital solution for your shop. Get more orders with less effort — customers browse, order, and book on their own.',
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
