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
  ClipboardList,
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
    { href: "/informes", label: "Informes", icon: ClipboardList },
    { href: "/projectes", label: "Projectes", icon: Briefcase },
    { href: "/partides", label: "Partides", icon: FolderTree },
    { href: "/equivalencies", label: "Equivalències A3", icon: ArrowLeftRight },
    { href: "/historial", label: "Historial de Canvis", icon: History },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm w-full">
        {/* Row 1: brand and actions. Wraps (actions below the brand) when the screen is narrow */}
        <div className="w-full max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between min-h-[64px] py-2 gap-x-4 gap-y-2">

            {/* Logo & Brand */}
            <div className="flex items-center space-x-3 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-inner flex-shrink-0">
                SL
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-slate-900 text-base tracking-tight whitespace-nowrap">Som Llar</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium whitespace-nowrap">Justificacions</span>
                </div>
                <p className="text-xs text-slate-500 hidden md:block truncate">Control de Subvencions i Licitacions</p>
              </div>
            </div>

            {/* Action buttons & Exercici */}
            <div className="flex flex-wrap items-center justify-end gap-2 xl:gap-3 min-w-0">
              {/* Exercici selector */}
              <div className="flex items-center space-x-1 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">Exercici:</span>
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
                <div className="flex items-center space-x-2 pl-2 sm:pl-3 border-l border-slate-200 min-w-0">
                  <div className="hidden lg:flex flex-col text-right min-w-0 max-w-[16rem]">
                    <span className="text-xs font-bold text-slate-800 leading-tight truncate">
                      {user.displayName || user.email?.split("@")[0]}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono truncate" title={user.email || undefined}>
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

        {/* Row 2: sections. They wrap onto another line instead of going off the right edge */}
        <nav aria-label="Seccions" className="border-t border-slate-200 bg-slate-50">
          <div className="w-full max-w-[1660px] mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-1.5">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.badge !== null && item.badge !== undefined && (
                    <span
                      className={`px-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold ${isActive ? "bg-white/90 text-amber-800" : item.badgeColor}`}
                      title={item.badgeTitle}
                    >
                      {item.badge}
                    </span>
                  )}
                  {item.href === "/despeses" && alertCount > 0 && (
                    <span
                      className={`px-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold inline-flex items-center ${isActive ? "bg-white/90 text-rose-800" : "bg-rose-100 text-rose-800"}`}
                      title={`${alertCount} despeses amb alertes (excedides o modificades a l'A3)`}
                      aria-label={`${alertCount} alertes`}
                    >
                      <AlertTriangle className="w-3 h-3 mr-0.5" aria-hidden="true" />
                      {alertCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
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
