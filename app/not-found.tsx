import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <div className="text-6xl mb-6 opacity-30">⚔️</div>
      <p className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">404</p>
      <h1 className="text-2xl font-bold text-white/80 mb-3">Page not found</h1>
      <p className="text-gray-600 text-sm max-w-xs mb-8">
        This page doesn&apos;t exist or was moved. Head back to the arena.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 rounded-xl bg-white/[0.05] border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/[0.08] hover:border-white/20 transition-all"
      >
        Back to the Arena
      </Link>
    </div>
  );
}
