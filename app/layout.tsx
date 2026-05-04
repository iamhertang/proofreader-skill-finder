import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import Link from 'next/link'
import './globals.css'

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'Proofreader Skill Finder',
  description: 'Generate AI proofreading skill files from human correction data for game localisation.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${nunito.className} bg-gradient-to-br from-amber-50 via-rose-50 to-sky-50 min-h-screen`}>
        {/* Nav */}
        <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-white/60 shadow-sm">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 group"
            >
              <span className="text-2xl group-hover:rotate-12 transition-transform duration-200">✨</span>
              <span className="font-black text-lg text-slate-800 tracking-tight">
                Skill<span className="text-coral">Finder</span>
              </span>
            </Link>

            <Link
              href="/history"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-violet-100 hover:bg-violet-200 text-violet-700 font-bold text-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
            >
              <span>🕐</span>
              <span>History</span>
            </Link>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-5 py-10">
          {children}
        </main>
      </body>
    </html>
  )
}
