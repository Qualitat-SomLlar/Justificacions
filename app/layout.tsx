import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { JustificacionsProvider } from "@/lib/store";
import Navbar from "@/components/Navbar";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Som Llar - Gestió i Control de Justificacions",
  description: "Plataforma per a la gestió, control i imputació econòmica de justificacions de subvencions i licitacions de Som Llar.",
  applicationName: "Som Llar - Justificacions",
  // Installed app (PWA): name and icon on macOS / iOS
  // (the favicon and the Apple icon come from app/icon.tsx and app/apple-icon.tsx)
  appleWebApp: { capable: true, title: "Justificacions", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ca">
      <body className="min-h-screen flex flex-col bg-slate-100/60 text-slate-900 font-sans antialiased">
        <PwaRegister />
        <AuthProvider>
          <JustificacionsProvider>
            <Navbar />
            <main className="flex-1 max-w-[1660px] w-full mx-auto p-4 sm:p-6 lg:p-8">
              {children}
            </main>
            <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
              <div className="max-w-[1660px] mx-auto px-4">
                Som Llar &copy; {new Date().getFullYear()} &mdash; Sistema de Gestió Econòmica i Control de Justificacions
              </div>
            </footer>
          </JustificacionsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
