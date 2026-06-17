import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: 'VoteLab',
  description: 'Tools and visualizations for understanding elections.',
};

function Navigation() {
  return (
    <nav className="p-4 bg-white shadow">
      <div className="container mx-auto flex flex-wrap gap-4">
        <Link href="/" className="font-semibold hover:underline">
          VoteLab
        </Link>
        <Link href="/elections" className="hover:underline">
          Run Elections
        </Link>
        <Link href="/visualizations" className="hover:underline">
          Visualizations
        </Link>
        <Link href="/yee" className="hover:underline">
          Yee Diagrams
        </Link>
        <Link href="/comparison" className="hover:underline">
          Method Comparison
        </Link>
        <Link href="/detailed" className="hover:underline">
          Detailed View
        </Link>
        <Link href="/perturbation" className="hover:underline">
          Perturbation Maps
        </Link>
        <Link href="/districts" className="hover:underline">
          Voting Districts
        </Link>
      </div>
    </nav>
  );
}

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
        <Navigation />
        {children}
      </body>
    </html>
  );
}
