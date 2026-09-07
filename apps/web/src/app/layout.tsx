import type { Metadata } from 'next';
import { Archivo, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/*
 * Archivo for interface text — a grotesque with a slightly industrial,
 * squared-off character that suits a dispatch console, and enough weight range
 * to build hierarchy without changing size.
 *
 * IBM Plex Mono for every figure, coordinate, status and column label. In an
 * ops interface the numbers are the content, so they get a face that keeps
 * columns aligned and cannot be confused with prose.
 */
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-archivo',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EasyDel — Route Manager',
  description: 'Delivery agent route management, dispatch and live tracking.',
};

/*
 * Root layout is chrome-free on purpose. The console sidebar lives in
 * (console)/layout.tsx and the centred card in (auth)/layout.tsx, so the
 * password-reset page — which legitimately holds a Supabase recovery session —
 * renders bare instead of appearing signed in.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} ${plexMono.variable} console-field min-h-screen bg-surface font-sans text-ink antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
