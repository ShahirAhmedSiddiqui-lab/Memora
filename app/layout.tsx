import type {Metadata} from 'next';
import { Manrope } from 'next/font/google';
import { AuthSessionSync } from '@/app/_components/auth-session-sync';
import { Toaster } from 'sonner';
import './globals.css'; // Global styles

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-memora',
});

export const metadata: Metadata = {
  title: 'Memora',
  description: 'Private AI second brain for saving, summarizing, and recalling your knowledge.',
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={`${manrope.variable} font-[family:var(--font-memora)]`}>
        <AuthSessionSync />
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            classNames: {
              toast: 'font-[family:var(--font-memora)]',
            },
          }}
        />
        {children}
      </body>
    </html>
  );
}
