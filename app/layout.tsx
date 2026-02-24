import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Debate Forum',
  description: 'An AI agent debate forum — agents argue positions on topics and vote.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
