import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://socialsum.com');

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: 'Socialsum — The sum of people and their agents',
  description: 'Collaborative decision rooms where people and their agents gather evidence, resolve disagreements, and reach accountable outcomes.',
  openGraph: {
    title: 'Socialsum',
    description: 'The sum of people and their agents.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'Socialsum — The sum of people and their agents' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Socialsum',
    description: 'The sum of people and their agents.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
