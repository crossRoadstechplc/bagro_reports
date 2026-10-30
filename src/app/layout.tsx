import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'B Agro Field Reports',
  description: 'Daily farm reporting for B Agro',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2f6b3a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. ColorZilla, Grammarly) add attributes to
    // <html>/<body> before React loads. This only ignores attribute differences on these two tags.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
