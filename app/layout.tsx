import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book-N-Pay",
  description: "Booking and payments for Jamaican service hustlers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6">
          <header className="flex items-center justify-between pb-8">
            <a href="/" className="text-2xl font-semibold text-primary">
              Book-N-Pay
            </a>
            <nav className="flex items-center gap-4 text-sm text-slate-300">
              <a href="/#features" className="hover:text-white">
                Features
              </a>
              <a href="/#pricing" className="hover:text-white">
                Pricing
              </a>
              <a href="/#contact" className="hover:text-white">
                Contact
              </a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="pt-10 text-sm text-slate-400">
            © {new Date().getFullYear()} Book-N-Pay. All rights reserved.
          </footer>
        </div>
      </body>
    </html>
  );
}
