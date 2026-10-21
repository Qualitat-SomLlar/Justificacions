"use client";

import React, { useState, useMemo } from "react";
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
  User as UserIcon,
  FolderTree,
  CloudOff,
  X
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import ImportModal from "./ImportModal";
import MigrationModal from "./MigrationModal";

export default function Navbar() {
  const pathname = usePathname();
  const { despeses, activeExercici, setActiveExercici, exportToExcel, cloudStatus, syncError, clearSyncError } = useJustificacions();
  const { user, logout } = useAuth();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isMigrationOpen, setIsMigrationOpen] = useState(false);

  const { pendingCount, alertCount } = useMemo(() => {
    let pending = 0;
    let alerts = 0;
    for (const d of despeses) {
      if (d.estat === "pendent") pending++;
      if (d.estat === "excedida" || d.modificat_a3) alerts++;
    }
    return { pendingCount: pending, alertCount: alerts };
  }, [despeses]);

  // Exercici options: current year + 1 down to current year - 3, always including the active one
  const exerciciOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const years = new Set<number>();
    for (let y = current + 1; y >= current - 3; y--) years.add(y);
    if (Number.isFinite(activeExercici)) years.add(activeExercici);
    return Array.from(years).sort((a, b) => b - a);
  }, [activeExercici]);

  const navItems: {
    href: string;
    label: string;
    icon: React.ElementType;
    badge?: number | null;
    badgeColor?: string;
    badgeTitle?: string;
  }[] = [
    { href: "/", label: "Panell Global", icon: LayoutDashboard },
    { 
      href: "/despeses", 
      label: "Despeses i Imputació", 
      icon: Receipt,
      badge: pendingCount > 0 ? pendingCount : null,
      badgeColor: "bg-amber-100 text-amber-800",
      badgeTitle: `${pendingCount} despeses pendents d'imputar`
    },
    { href: "/matriu", label: "Matriu Justificativa", icon: Table2 },
    { href: "/projectes", label: "Projectes", icon: Briefcase },
    { href: "/partides", label: "Partides", icon: FolderTree },
    { href: "/equivalencies", label: "Equivalències A3", icon: ArrowLeftRight },
    { href: "/historial", label: "Historial de Canvis", icon: History },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm w-full">
        <div className="w-full max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between min-h-[70px] py-2 gap-3 lg:gap-4">
            
            {/* Logo & Brand */}
            <div className="flex items-center space-x-3 flex-shrink-0">
              <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-inner flex-shrink-0">
                SL
              </div>
              <div className="flex-shrink-0">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-900 text-base tracking-tight whitespace-nowrap">Som Llar</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium whitespace-nowrap">Justificacions</span>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block whitespace-nowrap">Control de Subvencions i Licitacions</p>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="hidden lg:flex items-center space-x-1 flex-shrink-0">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-1.5 px-2.5 xl:px-3 py-2 rounded-lg text-xs xl:text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                      isActive
                        ? "bg-emerald-50 text-emerald-700 font-semibold shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">{item.label}</span>
                    {item.badge !== null && item.badge !== undefined && (
                      <span
                        className={`ml-1 px-1.5 py-0.5 text-[11px] font-semibold rounded-full flex-shrink-0 ${item.badgeColor}`}
                        title={item.badgeTitle}
                      >
                        {item.badge}
                      </span>
                    )}
                    {item.href === "/despeses" && alertCount > 0 && (
                      <span
                        className="ml-0.5 px-1.5 py-0.5 text-[11px] font-semibold rounded-full flex-shrink-0 bg-rose-100 text-rose-800 inline-flex items-center"
                        title={`${alertCount} despeses amb alertes (excedides o modificades a l'A3)`}
                        aria-label={`${alertCount} alertes`}
                      >
                        <AlertTriangle className="w-3 h-3 mr-0.5" />
                        {alertCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Action buttons & Exercici */}
            <div className="flex items-center space-x-2 xl:space-x-3 flex-shrink-0">
              {/* Exercici selector */}
              <div className="flex items-center space-x-1 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>Exercici:</span>
                <select 
                  value={activeExercici} 
                  onChange={(e) => setActiveExercici(Number(e.target.value))}
                  aria-label="Exercici actiu"
                  className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
                >
                  {exerciciOptions.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
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
                <span className="sr-only sm:hidden">Exportar Excel</span>
              </button>

              {/* User profile & Logout */}
              {user && (
                <div className="flex items-center space-x-2 pl-2 sm:pl-3 border-l border-slate-200">
                  <div className="hidden md:flex flex-col text-right">
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
                    aria-label="Tancar sessió"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile / Tablet navigation row */}
        <div className="lg:hidden border-t border-slate-200 px-4 py-2 flex items-center justify-start overflow-x-auto space-x-2 bg-slate-50">
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
                {item.href === "/despeses" && alertCount > 0 && (
                  <span
                    className="ml-1 px-1.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800"
                    title={`${alertCount} despeses amb alertes (excedides o modificades a l'A3)`}
                  >
                    {alertCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        {/* Sync status */}
        {cloudStatus === "migration_pending" && (
          <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-center gap-2">
            <CloudOff className="w-4 h-4 flex-shrink-0" />
            <span>
              Les dades del núvol encara tenen el format antic. Fins que no es migrin, l&apos;aplicació és només de consulta.
            </span>
            <button
              onClick={() => setIsMigrationOpen(true)}
              className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              Revisar i migrar
            </button>
          </div>
        )}
        {cloudStatus === "local" && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-1.5 text-xs text-slate-600 flex items-center justify-center gap-2">
            <CloudOff className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Mode local: sense sessió de Firebase, les dades només es guarden en aquest navegador.</span>
          </div>
        )}
        {syncError && (
          <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-800 flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>
              {syncError}
              {cloudStatus === "error" && " L'aplicació queda en mode només de consulta per no perdre canvis: recarrega la pàgina quan es resolgui."}
            </span>
            {cloudStatus !== "error" && (
              <button onClick={clearSyncError} className="p-1 rounded hover:bg-rose-100" title="Amagar" aria-label="Amagar avís">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </header>

      {isMigrationOpen && <MigrationModal onClose={() => setIsMigrationOpen(false)} />}

      {/* Import Modal */}
      {isImportOpen && <ImportModal onClose={() => setIsImportOpen(false)} />}
    </>
  );
}
