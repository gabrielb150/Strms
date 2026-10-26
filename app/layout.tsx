import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Combined Charts",
  description: "Weekly Top 100 artists and songs across Spotify, Apple Music and YouTube, combined into one chart.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

// Applies the saved or system theme before first paint, so dark mode never flashes white.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-zinc-50/85 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-950/85">
          <nav className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-lg bg-accent text-sm font-bold text-white">C</span>
              <span className="whitespace-nowrap">Combined Charts</span>
            </Link>
            <div className="ml-auto flex items-center gap-1 text-sm">
              <Link href="/" className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">Charts</Link>
              <Link href="/about/" className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"><span className="sm:hidden">About</span><span className="hidden sm:inline">About the data</span></Link>
              <ThemeToggle />
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-16">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-zinc-500">
          Personal, non-commercial project. Chart data from public sources; see{" "}
          <Link href="/about/" className="underline">About the data</Link>. Not affiliated with Spotify, Apple or YouTube.
        </footer>
      </body>
    </html>
  );
}
