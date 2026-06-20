import type { Metadata, Viewport } from 'next';
import { Lilita_One } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const lilitaOne = Lilita_One({
  subsets: ['latin'],
  variable: '--font-lilita-one',
  display: 'swap',
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Flappy Base',
  description: 'A Flappy Bird game on Base. Play, submit your high score on-chain, and compete on the leaderboard.',
  applicationName: 'Flappy Base',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#6BBFED',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={lilitaOne.variable}>
      <body className="font-sans min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
