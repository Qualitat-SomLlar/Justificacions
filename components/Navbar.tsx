"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Receipt, 
  Table2, 
  Briefcase, 
  ArrowLeftRight, 
  UploadCloud, 
  Download, 
  AlertTriangle,
  Building2,
  Calendar,
  History,
  LogOut,
  User as UserIcon
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import ImportModal from "./ImportModal";

export default function Navbar() {
  const pathname = usePathname();
  const { despeses, activeExercici, setActiveExercici, exportToExcel } = useJustificacions();
  const { user, logout } = useAuth();
  const [isImportOpen, setIsImportOpen] = useState(false);

  const pendingCount = despeses.filter(d => d.estat === "pendent").length;
  const alertCount = despeses.filter(d => d.estat === "excedida" || d.modificat_a3).length;

  const navItems = [
    { href: "/", label: "Panell Global", icon: LayoutDashboard },
    { 
      href: "/despeses", 
      label: "Despeses i Imputació", 
      icon: Receipt,
      badge: pendingCount > 0 ? pendingCount : null,
      badgeColor: "bg-amber-100 text-amber-800"
    },
    { href: "/matriu", label: "Matriu Justificativa", icon: Table2 },
    { href: "/projectes", label: "Projectes", icon: Briefcase },
    { href: "/equivalencies", label: "Equivalències A3", icon: ArrowLeftRight },
    { href: "/historial", label: "Historial de Canvis", icon: History },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo & Brand */}
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-inner">
                SL
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-900 text-base tracking-tight">Som Llar</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">Justificacions</span>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">Control de Subvencions i Licitacions</p>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                    {item.badge !== null && item.badge !== undefined && (
                      <span className={`ml-1.5 px-1.5 py-0.5 text-xs font-semibold rounded-full ${item.badgeColor}`}>
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Action buttons & Exercici */}
            <div className="flex items-center space-x-3">
              {/* Exercici selector */}
              <div className="flex items-center space-x-1 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Exercici:</span>
                <select 
                  value={activeExercici} 
                  onChange={(e) => setActiveExercici(Number(e.target.value))}
                  className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                  <option value={2024}>2024</option>
                </select>
              </div>

              {/* Upload A3 button */}
              <button
                onClick={() => setIsImportOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-medium shadow-sm transition-all"
              >
                <UploadCloud className="w-4 h-4" />
                <span className="hidden sm:inline">Pujar Excel A3</span>
                <span className="sm:hidden">Pujar A3</span>
              </button>

              {/* Export Excel button */}
              <button
                onClick={exportToExcel}
                disabled={despeses.length === 0}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-medium shadow-sm transition-all"
                title="Exportar fulls de càlcul oficials de justificació"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Exportar Excel</span>
              </button>

              {/* User profile & Logout */}
              {user && (
                <div className="flex items-center space-x-2 pl-2 sm:pl-3 border-l border-slate-200">
                  <div className="hidden lg:flex flex-col text-right">
                    <span className="text-xs font-bold text-slate-800 leading-tight">
                      {user.displayName || user.email?.split("@")[0]}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {user.email}
                    </span>
                  </div>
                  <button
                    onClick={logout}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title={`Tancar sessió (${user.email})`}
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="md:hidden border-t border-slate-200 px-4 py-2 flex items-center justify-between overflow-x-auto space-x-2 bg-slate-50">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${
                  isActive ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      {/* Import Modal */}
      {isImportOpen && <ImportModal onClose={() => setIsImportOpen(false)} />}
    </>
  );
}
