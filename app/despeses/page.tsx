"use client";

import React, { useState, useMemo, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { 
  Search, 
  Receipt, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  ChevronLeft, 
  ChevronRight, 
  UploadCloud,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FolderTree,
  Table2,
  X,
  Edit,
  Briefcase,
  RotateCcw,
  Trash2,
  CheckSquare
} from "lucide-react";
import { useJustificacions } from "@/lib/store";
import { Despesa, Partida } from "@/lib/types";
import ImputacioModal from "@/components/ImputacioModal";
import ImportModal from "@/components/ImportModal";
import {
  BulkPartidaModal,
  BulkImputarModal,
  BulkResetModal,
  BulkDeleteModal,
} from "@/components/BulkActionsModals";

type SortField = 
  | "ndoc_a3" 
  | "factura" 
  | "proveidor" 
  | "partida_id" 
  | "data_emissio" 
  | "total_factura" 
  | "percentatge_total";

type SortOrder = "asc" | "desc";

const GROUP_PAGE_SIZE = 50;

// Same criterion everywhere: "0" and "1" are A3 placeholders, not real flats
const isValidPis = (pis?: string | null): pis is string => !!pis && pis !== "0" && pis !== "1";

// 1-decimal percentage that never shows a rounded 100% / 0% unless it really is
const fmtPct = (value?: number | null) => {
  const n = value ?? 0;
  const cents = Math.round(n * 100);
  if (cents === 10000) return "100";
  let r = Math.round(n * 10) / 10;
  if (r === 100) r = cents < 10000 ? 99.9 : 100.1;
  if (r === 0 && cents !== 0) r = cents > 0 ? 0.1 : -0.1;
  return r.toLocaleString("ca-ES", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
};

const fmtEur = (value?: number | null) =>
  (value ?? 0).toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DespesesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialFilter = searchParams.get("filter") || "tots";
  const projParam = searchParams.get("projecte");

  const {
    despeses,
    imputacions,
    partides,
    projectes,
    activeExercici,
    bulkAssignPartida,
    bulkImputar,
    bulkResetImputacions,
    bulkDeleteDespeses
  } = useJustificacions();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProjecte, setSelectedProjecte] = useState("tots");
  const [selectedPartida, setSelectedPartida] = useState("totes");
  const [selectedEstat, setSelectedEstat] = useState(initialFilter);
  // ?filter= follows the URL (e.g. from a dashboard link back to /despeses without filter)
  const filterParam = searchParams.get("filter");
  useEffect(() => {
    setSelectedEstat(filterParam || "tots");
  }, [filterParam]);
  const [selectedPis, setSelectedPis] = useState("tots");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDespesa, setSelectedDespesa] = useState<Despesa | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"partides" | "taula">(projParam ? "partides" : "taula");
  const [invalidProjParam, setInvalidProjParam] = useState<string | null>(null);
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});

  // Selection & Bulk Action States
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkPartidaOpen, setIsBulkPartidaOpen] = useState(false);
  const [isBulkImputarOpen, setIsBulkImputarOpen] = useState(false);
  const [isBulkResetOpen, setIsBulkResetOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  // URL -> state for ?projecte= (accepts id or codi, normalised to id)
  const appliedProjParam = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (appliedProjParam.current === projParam) return;
    if (!projParam) {
      appliedProjParam.current = projParam;
      setInvalidProjParam(null);
      setSelectedProjecte("tots");
      return;
    }
    if (projectes.length === 0) return; // wait for the catalog to load
    appliedProjParam.current = projParam;
    const match = projectes.find(p => p.id === projParam) || projectes.find(p => p.codi === projParam);
    if (match) {
      setInvalidProjParam(null);
      setSelectedProjecte(match.id);
      setViewMode("partides");
    } else {
      setInvalidProjParam(projParam);
      setSelectedProjecte("tots");
    }
  }, [projParam, projectes]);

  // State -> URL for ?projecte=
  const changeProjecte = (id: string) => {
    setSelectedProjecte(id);
    setInvalidProjParam(null);
    if (id !== "tots") setViewMode("partides");
    const nextParam = id === "tots" ? null : id;
    if (nextParam === projParam) return;
    appliedProjParam.current = nextParam;
    const params = new URLSearchParams(searchParams.toString());
    if (nextParam) params.set("projecte", nextParam);
    else params.delete("projecte");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Any filter change (or exercici switch) drops the selection and resets paging
  useEffect(() => {
    setSelectedIds(new Set());
    setCurrentPage(1);
    setGroupLimits({});
  }, [searchTerm, selectedProjecte, selectedPartida, selectedEstat, selectedPis, activeExercici]);

  // Sorting state
  const [sortField, setSortField] = useState<SortField>("data_emissio");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const pageSize = 25;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-300 ml-1 inline" />;
    }
    return sortOrder === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 ml-1 inline" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 ml-1 inline" />
    );
  };

  // Extract unique Pis codes for filtering
  const uniquePisos = useMemo(() => {
    const set = new Set<string>();
    despeses.forEach(d => {
      if (isValidPis(d.pis)) set.add(d.pis);
    });
    return Array.from(set).sort();
  }, [despeses]);

  const projecteCodiById = useMemo(() => {
    const map = new Map<string, string>();
    projectes.forEach(p => map.set(p.id, p.codi || p.id));
    return map;
  }, [projectes]);

  const projectesActius = useMemo(() => projectes.filter(p => p.actiu !== false), [projectes]);
  const projectesTancats = useMemo(() => projectes.filter(p => p.actiu === false), [projectes]);

  // Find active project object
  const currentProject = useMemo(() => {
    if (selectedProjecte === "tots") return null;
    return projectes.find(p => p.id === selectedProjecte || p.codi === selectedProjecte) || null;
  }, [projectes, selectedProjecte]);

  const projecteLabel = currentProject?.codi || selectedProjecte;

  // despesa_id -> imputacions, built once instead of filtering per row
  const imputacionsByDespesa = useMemo(() => {
    const map = new Map<string, typeof imputacions>();
    imputacions.forEach(imp => {
      const list = map.get(imp.despesa_id);
      if (list) list.push(imp);
      else map.set(imp.despesa_id, [imp]);
    });
    return map;
  }, [imputacions]);

  // Index allocations for this project
  const projectImputacionsMap = useMemo(() => {
    const map = new Map<string, { percentatge: number; import: number }>();
    if (selectedProjecte === "tots") return map;
    const targetId = currentProject?.id || selectedProjecte;
    imputacions
      .filter(imp => imp.projecte_id === targetId && (imp.percentatge > 0 || imp.import > 0))
      .forEach(imp => {
        map.set(imp.despesa_id, { percentatge: imp.percentatge, import: imp.import });
      });
    return map;
  }, [imputacions, selectedProjecte, currentProject]);

  // Total justified amount for this project
  const totalJustificatProjecte = useMemo(() => {
    return Array.from(projectImputacionsMap.values()).reduce((sum, item) => sum + item.import, 0);
  }, [projectImputacionsMap]);

  // Filtered despeses
  const filtered = useMemo(() => {
    return despeses.filter(d => {
      if (selectedProjecte !== "tots") {
        if (!projectImputacionsMap.has(d.id)) return false;
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchProv = (d.proveidor || "").toLowerCase().includes(term);
        const matchFra = (d.factura || "").toLowerCase().includes(term);
        const matchDoc = (d.ndoc_a3 || "").toLowerCase().includes(term);
        const matchCif = (d.cif || "").toLowerCase().includes(term);
        const matchDesc = (d.descripcio_linia || "").toLowerCase().includes(term);
        if (!matchProv && !matchFra && !matchDoc && !matchCif && !matchDesc) return false;
      }

      if (selectedPartida !== "totes" && d.partida_id !== selectedPartida) {
        return false;
      }

      if (selectedEstat === "pendent" && d.estat !== "pendent") return false;
      if (selectedEstat === "parcial" && d.estat !== "parcial") return false;
      if (selectedEstat === "completada" && d.estat !== "completada") return false;
      if (selectedEstat === "excedida" && d.estat !== "excedida") return false;
      if (selectedEstat === "modificada" && !d.modificat_a3) return false;

      if (selectedPis !== "tots" && d.pis !== selectedPis) {
        return false;
      }

      return true;
    });
  }, [despeses, searchTerm, selectedPartida, selectedEstat, selectedPis, selectedProjecte, projectImputacionsMap]);

  // Group filtered despeses by Partida (for "Per Partides" view)
  const despesesByPartida = useMemo(() => {
    const map = new Map<string, {
      partidaId: string;
      partidaObj: Partida | null;
      despeses: (Despesa & { projPercent: number; projImport: number })[];
      totalPartidaFactura: number;
      totalPartidaJustificat: number;
    }>();

    filtered.forEach(d => {
      const pId = d.partida_id || "SENSE_PARTIDA";
      const alloc = projectImputacionsMap.get(d.id) || {
        percentatge: selectedProjecte === "tots" ? (d.percentatge_total ?? 0) : 0,
        import: selectedProjecte === "tots" ? (d.import_total ?? 0) : 0
      };

      if (!map.has(pId)) {
        const partidaObj = partides.find(p => p.id === pId) || null;
        map.set(pId, {
          partidaId: pId,
          partidaObj,
          despeses: [],
          totalPartidaFactura: 0,
          totalPartidaJustificat: 0
        });
      }

      const group = map.get(pId)!;
      group.despeses.push({
        ...d,
        projPercent: alloc.percentatge,
        projImport: alloc.import
      });
      group.totalPartidaFactura += d.total_factura ?? 0;
      group.totalPartidaJustificat += alloc.import ?? 0;
    });

    return Array.from(map.values()).sort((a, b) => a.partidaId.localeCompare(b.partidaId));
  }, [filtered, projectImputacionsMap, partides, selectedProjecte]);

  // Sorted despeses
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const valA = a[sortField] ?? "";
      const valB = b[sortField] ?? "";

      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortOrder === "asc" ? -1 : 1;
      if (strA > strB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  // Keep the page in range when the list shrinks (deletes, live sync...)
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage]);

  // Effective selection: only ids that exist and are visible with current filters
  const selectedExpenses = useMemo(() => {
    if (selectedIds.size === 0) return [];
    return filtered.filter(d => selectedIds.has(d.id));
  }, [filtered, selectedIds]);

  const effectiveSelectedIds = useMemo(() => selectedExpenses.map(d => d.id), [selectedExpenses]);
  const selectedCount = effectiveSelectedIds.length;

  const selectedTotal = useMemo(() => {
    return selectedExpenses.reduce((sum, d) => sum + (d.total_factura ?? 0), 0);
  }, [selectedExpenses]);

  const selectedWithImputacions = useMemo(() => {
    return effectiveSelectedIds.filter(id => (imputacionsByDespesa.get(id)?.length ?? 0) > 0).length;
  }, [effectiveSelectedIds, imputacionsByDespesa]);

  // Selected rows per group, computed once per render cycle
  const groupSelectedCount = useMemo(() => {
    const map = new Map<string, number>();
    if (selectedIds.size === 0) return map;
    despesesByPartida.forEach(g => {
      let n = 0;
      g.despeses.forEach(d => { if (selectedIds.has(d.id)) n++; });
      map.set(g.partidaId, n);
    });
    return map;
  }, [despesesByPartida, selectedIds]);

  const pageSelectedCount = useMemo(
    () => paginated.reduce((n, d) => n + (selectedIds.has(d.id) ? 1 : 0), 0),
    [paginated, selectedIds]
  );

  const toggleSelectGroup = (groupDespeses: Despesa[], allSelected: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      groupDespeses.forEach(d => {
        if (allSelected) next.delete(d.id);
        else next.add(d.id);
      });
      return next;
    });
  };

  // Selection handlers
  const toggleSelectOne = (id: string, e?: React.MouseEvent | React.ChangeEvent) => {
    e?.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectPage = () => {
    const allPageSelected = paginated.length > 0 && pageSelectedCount === paginated.length;
    setSelectedIds(prev => {
      const next = new Set(prev);
      paginated.forEach(d => {
        if (allPageSelected) {
          next.delete(d.id);
        } else {
          next.add(d.id);
        }
      });
      return next;
    });
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedIds);
    filtered.forEach(d => next.add(d.id));
    setSelectedIds(next);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk action confirm handlers
  // Bulk actions only touch selected ∩ filtered
  const handleBulkPartidaConfirm = (partidaId: string, comentari?: string) => {
    if (effectiveSelectedIds.length > 0) bulkAssignPartida(effectiveSelectedIds, partidaId, comentari);
    clearSelection();
    setIsBulkPartidaOpen(false);
  };

  const handleBulkImputarConfirm = (
    allocations: { projecte_id: string; percentatge: number }[],
    comentari?: string
  ) => {
    if (effectiveSelectedIds.length > 0) bulkImputar(effectiveSelectedIds, allocations, comentari);
    clearSelection();
    setIsBulkImputarOpen(false);
  };

  const handleBulkResetConfirm = (comentari?: string) => {
    if (effectiveSelectedIds.length > 0) bulkResetImputacions(effectiveSelectedIds, comentari);
    clearSelection();
    setIsBulkResetOpen(false);
  };

  const handleBulkDeleteConfirm = (comentari?: string) => {
    if (effectiveSelectedIds.length > 0) bulkDeleteDespeses(effectiveSelectedIds, comentari);
    clearSelection();
    setIsBulkDeleteOpen(false);
  };

  const clearAllFilters = () => {
    setSearchTerm("");
    changeProjecte("tots");
    setSelectedPartida("totes");
    setSelectedEstat("tots");
    setSelectedPis("tots");
    setCurrentPage(1);
    setViewMode("taula");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Despeses i Imputacions
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visualitza, filtra i imputa cadascun dels gastos als projectes corresponents.
          </p>
        </div>

        <button
          onClick={() => setIsImportOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-sm transition-all"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Pujar Fitxer A3</span>
        </button>
      </div>

      {/* Project Banner if a project is actively selected */}
      {currentProject && (
        <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-emerald-950 text-white rounded-2xl p-5 shadow-lg border border-emerald-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-wider font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Projecte Seleccionat
              </span>
              <span className="text-xs text-slate-300">
                Finançador: <strong className="text-white">{currentProject.financador || "-"}</strong>
              </span>
              <span className="text-xs text-slate-300">
                Àrea: <strong className="text-white">{currentProject.area || "-"}</strong>
              </span>
            </div>
            <h2 className="text-2xl font-black mt-1 text-white tracking-tight flex items-center space-x-2">
              <span>{currentProject.codi}</span>
              <span className="text-sm font-normal text-slate-300">&bull; {currentProject.dates_text}</span>
            </h2>
            <p className="text-xs text-emerald-200/80 mt-1">
              Desglossament complet de despeses imputades organitzat per partides pressupostàries.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/10 text-right">
              <p className="text-[11px] text-slate-300 font-medium">Total Justificat al Projecte</p>
              <p className="text-xl font-bold text-emerald-300">
                {totalJustificatProjecte.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-3.5 py-2 border border-white/10 text-center">
              <p className="text-[11px] text-slate-300 font-medium">Factures</p>
              <p className="text-xl font-bold text-white">
                {projectImputacionsMap.size}
              </p>
            </div>

            <button
              onClick={() => {
                changeProjecte("tots");
                setCurrentPage(1);
                setViewMode("taula");
              }}
              className="px-3.5 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-semibold transition-colors flex items-center space-x-1.5"
              title="Treure filtre de projecte"
            >
              <X className="w-4 h-4" />
              <span>Treure filtre</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cercar per proveïdor, NIF, factura..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            />
          </div>

          <div>
            <select
              value={selectedProjecte}
              onChange={(e) => {
                changeProjecte(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full px-3 py-2 rounded-xl border text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                selectedProjecte !== "tots" 
                  ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold" 
                  : "bg-slate-50/50 border-slate-200"
              }`}
            >
              <option value="tots">Tots els Projectes ({projectes.length})</option>
              {projectesActius.length > 0 && (
                <optgroup label="Actius">
                  {projectesActius.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.codi} {p.financador ? `(${p.financador})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
              {projectesTancats.length > 0 && (
                <optgroup label="Tancats">
                  {projectesTancats.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.codi} {p.financador ? `(${p.financador})` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {invalidProjParam && (
              <p className="text-[11px] text-amber-700 mt-1">
                El projecte «{invalidProjParam}» de l&apos;enllaç no existeix.
              </p>
            )}
          </div>

          <div>
            <select
              value={selectedPartida}
              onChange={(e) => { setSelectedPartida(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="totes">Totes les Partides ({partides.length})</option>
              {partides.map(p => (
                <option key={p.id} value={p.id}>
                  {p.codi} {p.activa === false ? "⚠️ (Baixa)" : ""}
                </option>
              ))}
              <option value="SENSE_CORRESPONDENCIA">⚠️ Sense Correspondència</option>
            </select>
          </div>

          <div>
            <select
              value={selectedEstat}
              onChange={(e) => { setSelectedEstat(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="tots">Tots els Estats</option>
              <option value="pendent">Pendent d'Imputar (0%)</option>
              <option value="parcial">Imputada Parcial (&lt;100%)</option>
              <option value="completada">Completada (100%)</option>
              <option value="excedida">⚠️ Excedida (&gt;100%)</option>
              <option value="modificada">Modificada a l'A3</option>
            </select>
          </div>

          <div>
            <select
              value={selectedPis}
              onChange={(e) => { setSelectedPis(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50/50"
            >
              <option value="tots">Tots els Pisos / Immobles</option>
              {uniquePisos.map(pis => (
                <option key={pis} value={pis}>
                  {pis}
                </option>
              ))}
            </select>
          </div>

        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center space-x-3">
            <span>
              Mostrant <strong>{filtered.length}</strong> factures
              {selectedProjecte !== "tots" && (
                <span className="ml-1 text-emerald-700 font-semibold">
                  al projecte <strong>{projecteLabel}</strong>
                </span>
              )}
            </span>

            {(searchTerm || selectedPartida !== "totes" || selectedEstat !== "tots" || selectedPis !== "tots" || selectedProjecte !== "tots") && (
              <button
                onClick={clearAllFilters}
                className="text-emerald-600 hover:underline font-semibold"
              >
                Netejar filtres
              </button>
            )}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setViewMode("partides")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "partides"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Agrupat per Partides ({despesesByPartida.length})</span>
            </button>
            <button
              onClick={() => setViewMode("taula")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === "taula"
                  ? "bg-white text-emerald-800 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Llista Completa ({filtered.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Selection Info / Select All Banner */}
      {selectedCount > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 px-4 py-2.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-900 shadow-sm animate-in fade-in">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">
              Tens <strong>{selectedCount}</strong> {selectedCount === 1 ? "factura seleccionada" : "factures seleccionades"} (Total: <strong>{fmtEur(selectedTotal)} €</strong>).
            </span>
            {selectedCount < filtered.length && (
              <button
                onClick={selectAllFiltered}
                className="font-bold underline text-emerald-700 hover:text-emerald-900 ml-1"
              >
                Seleccionar totes les {filtered.length} factures filtrades
              </button>
            )}
          </div>
          <button
            onClick={clearSelection}
            className="text-xs text-slate-500 hover:text-slate-800 font-semibold self-start sm:self-auto hover:underline"
          >
            Deseleccionar totes
          </button>
        </div>
      )}

      {/* VIEW MODE 1: AGRUPAT PER PARTIDES */}
      {viewMode === "partides" && (
        <div className="space-y-4">
          {despesesByPartida.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Receipt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-base font-bold text-slate-800">No hi ha despeses per mostrar</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                {selectedProjecte !== "tots" 
                  ? `El projecte ${projecteLabel} encara no té despeses imputades. Pots canviar a 'Tots els Projectes' per veure totes les factures i assignar-ne.` 
                  : "No s'han trobat despeses amb els filtres seleccionats."}
              </p>
            </div>
          ) : (
            despesesByPartida.map((group) => {
              const groupSize = group.despeses.length;
              const groupSel = groupSelectedCount.get(group.partidaId) ?? 0;
              const groupAllSelected = groupSize > 0 && groupSel === groupSize;
              const groupSomeSelected = groupSel > 0 && !groupAllSelected;
              const limit = groupLimits[group.partidaId] ?? GROUP_PAGE_SIZE;
              const visibleRows = groupSize > limit ? group.despeses.slice(0, limit) : group.despeses;
              const hiddenRows = groupSize - visibleRows.length;
              const groupCheckbox = (title: string) => (
                <input
                  type="checkbox"
                  checked={groupAllSelected}
                  ref={el => { if (el) el.indeterminate = groupSomeSelected; }}
                  onChange={() => toggleSelectGroup(group.despeses, groupAllSelected)}
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  title={title}
                  aria-label={title}
                />
              );

              return (
              <div
                key={group.partidaId}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Partida Header Card */}
                <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center space-x-3">
                    {groupCheckbox("Seleccionar / deseleccionar totes les factures d'aquesta partida")}
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs">
                      {group.partidaId.substring(0, 2) === "DD" ? "DD" : "P"}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-base font-bold text-slate-900 tracking-tight">
                          {group.partidaObj?.codi || group.partidaId}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold">
                          {groupSize} {groupSize === 1 ? "factura" : "factures"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {group.partidaObj?.nom || "Partida pressupostària directa"}
                      </p>
                    </div>
                  </div>

                  {/* Partida totals badge */}
                  <div className="flex items-center space-x-5 self-start sm:self-auto">
                    <div className="text-right">
                      <span className="text-[11px] font-medium text-slate-500 block">
                        Total facturat:
                      </span>
                      <span className="text-base font-bold text-slate-800">
                        {fmtEur(group.totalPartidaFactura)} €
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] font-medium text-slate-500 block">
                        {selectedProjecte !== "tots" ? `Justificat a ${projecteLabel}:` : "Total justificat:"}
                      </span>
                      <span className="text-base font-black text-emerald-700">
                        {fmtEur(group.totalPartidaJustificat)} €
                      </span>
                      {selectedProjecte !== "tots" && totalJustificatProjecte !== 0 && (
                        <span className="text-[10px] text-slate-400 block">
                          ({((group.totalPartidaJustificat / totalJustificatProjecte) * 100).toFixed(1)}% del projecte)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Table of invoices for this Partida */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500 font-semibold text-xs bg-slate-50/40 uppercase tracking-wider">
                        <th className="py-2.5 px-3 w-10 text-center">
                          {groupCheckbox("Seleccionar totes les d'aquesta partida")}
                        </th>
                        <th className="py-2.5 px-4">Doc A3 / Factura</th>
                        <th className="py-2.5 px-4">Data</th>
                        <th className="py-2.5 px-4">Proveïdor / Concepte</th>
                        <th className="py-2.5 px-4">Immoble / Pis</th>
                        <th className="py-2.5 px-4 text-right">Total Factura</th>
                        <th className="py-2.5 px-4 text-right">
                          {selectedProjecte !== "tots" ? `Imputat a ${projecteLabel}` : "Total Imputat"}
                        </th>
                        <th className="py-2.5 px-4 text-center">Estat Factura</th>
                        <th className="py-2.5 px-4 text-center">Acció</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visibleRows.map((d) => (
                        <tr
                          key={d.id}
                          className={`transition-colors cursor-pointer ${
                            selectedIds.has(d.id) ? "bg-emerald-50/70 hover:bg-emerald-100/60" : "hover:bg-slate-50/80"
                          }`}
                          onClick={() => toggleSelectOne(d.id)}
                        >
                          <td className="py-3 px-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(d.id)}
                              onChange={(e) => toggleSelectOne(d.id, e)}
                              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              aria-label={`Seleccionar factura ${d.ndoc_a3 || ""}`}
                            />
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            <div>{d.ndoc_a3}</div>
                            <div className="text-xs text-slate-500 font-sans">{d.factura || "Sense Fra."}</div>
                            {d.modificat_a3 && (
                              <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold font-sans">
                                Modificat A3
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap text-xs">
                            {d.data_emissio || "-"}
                          </td>
                          <td className="py-3 px-4 max-w-xs">
                            <div className="font-semibold text-slate-900 truncate" title={d.proveidor}>
                              {d.proveidor}
                            </div>
                            <div className="text-xs text-slate-500 truncate" title={d.descripcio_linia}>
                              {d.descripcio_linia || d.cif}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 text-xs">
                            {isValidPis(d.pis) ? (
                              <span className="px-2 py-0.5 rounded bg-slate-100 font-medium">
                                {d.pis}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            {fmtEur(d.total_factura)} €
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="font-black text-emerald-700">
                              {fmtEur(d.projImport)} €
                            </div>
                            <div className="text-[11px] text-slate-500 font-semibold">
                              {fmtPct(d.projPercent)} %
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              d.estat === "completada"
                                ? "bg-emerald-100 text-emerald-800"
                                : d.estat === "parcial"
                                ? "bg-sky-100 text-sky-800"
                                : d.estat === "excedida"
                                ? "bg-rose-100 text-rose-800 animate-pulse"
                                : "bg-amber-100 text-amber-800"
                            }`}>
                              {d.estat === "completada" && "100% Imputada"}
                              {d.estat === "parcial" && "Imputació Parcial"}
                              {d.estat === "pendent" && "Pendent (0%)"}
                              {d.estat === "excedida" && "⚠️ >100% Excedida"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSelectedDespesa(d)}
                              className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold shadow-sm transition-all"
                            >
                              <Edit className="w-3 h-3" />
                              <span>Imputar</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {hiddenRows > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-3 px-6 py-3 border-t border-slate-100 bg-slate-50/60 text-xs">
                    <span className="text-slate-500">
                      Mostrant {visibleRows.length} de {groupSize} factures
                    </span>
                    <button
                      type="button"
                      onClick={() => setGroupLimits(prev => ({ ...prev, [group.partidaId]: limit + GROUP_PAGE_SIZE }))}
                      className="font-semibold text-emerald-700 hover:underline"
                    >
                      Mostrar {Math.min(GROUP_PAGE_SIZE, hiddenRows)} més
                    </button>
                    {hiddenRows > GROUP_PAGE_SIZE && (
                      <button
                        type="button"
                        onClick={() => setGroupLimits(prev => ({ ...prev, [group.partidaId]: groupSize }))}
                        className="font-semibold text-slate-600 hover:underline"
                      >
                        Mostrar totes ({groupSize})
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW MODE 2: TAULA LLISTA NORMAL */}
      {viewMode === "taula" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                <th className="py-3.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={paginated.length > 0 && pageSelectedCount === paginated.length}
                    ref={el => {
                      if (el) el.indeterminate = pageSelectedCount > 0 && pageSelectedCount < paginated.length;
                    }}
                    onChange={toggleSelectPage}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    title="Seleccionar / deseleccionar totes les d'aquesta pàgina"
                    aria-label="Seleccionar / deseleccionar totes les d'aquesta pàgina"
                  />
                </th>
                <th 
                  onClick={() => handleSort("ndoc_a3")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Document A3"
                >
                  <div className="flex items-center">
                    <span>Doc A3 / Factura</span>
                    {renderSortIcon("ndoc_a3")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("proveidor")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Proveïdor"
                >
                  <div className="flex items-center">
                    <span>Proveïdor / Concepte</span>
                    {renderSortIcon("proveidor")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("partida_id")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Partida"
                >
                  <div className="flex items-center">
                    <span>Partida / Pis</span>
                    {renderSortIcon("partida_id")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("data_emissio")}
                  className="py-3.5 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Data"
                >
                  <div className="flex items-center">
                    <span>Data</span>
                    {renderSortIcon("data_emissio")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("total_factura")}
                  className="py-3.5 px-4 text-right cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per Total Factura"
                >
                  <div className="flex items-center justify-end">
                    <span>Total Factura</span>
                    {renderSortIcon("total_factura")}
                  </div>
                </th>
                <th 
                  onClick={() => handleSort("percentatge_total")}
                  className="py-3.5 px-4 text-center cursor-pointer hover:bg-slate-100/80 transition-colors select-none"
                  title="Fes clic per ordenar per % Imputat"
                >
                  <div className="flex items-center justify-center">
                    <span>Estat / Imputat</span>
                    {renderSortIcon("percentatge_total")}
                  </div>
                </th>
                <th className="py-3.5 px-4">Projectes Assignats</th>
                <th className="py-3.5 px-4 text-center">Acció</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((despesa) => {
                const despesaImps = imputacionsByDespesa.get(despesa.id) ?? [];

                return (
                  <tr 
                    key={despesa.id} 
                    className={`transition-colors cursor-pointer ${
                      selectedIds.has(despesa.id) ? "bg-emerald-50/70 hover:bg-emerald-100/60" : "hover:bg-slate-50/70"
                    }`}
                    onClick={() => toggleSelectOne(despesa.id)}
                  >
                    <td className="py-3 px-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(despesa.id)}
                        onChange={(e) => toggleSelectOne(despesa.id, e)}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        aria-label={`Seleccionar factura ${despesa.ndoc_a3 || ""}`}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{despesa.ndoc_a3}</div>
                      <div className="text-xs text-slate-500">{despesa.factura || "Sense Fra."}</div>
                      {despesa.modificat_a3 && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                          Modificat A3
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-semibold text-slate-900 truncate" title={despesa.proveidor}>
                        {despesa.proveidor}
                      </div>
                      <div className="text-xs text-slate-500 truncate" title={despesa.descripcio_linia}>
                        {despesa.descripcio_linia || despesa.cif}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        despesa.partida_id === "SENSE_CORRESPONDENCIA"
                          ? "bg-rose-100 text-rose-800"
                          : "bg-slate-100 text-slate-700"
                      }`}>
                        {despesa.partida_id}
                      </span>
                      {isValidPis(despesa.pis) && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          {despesa.pis}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap text-xs">
                      {despesa.data_emissio || "-"}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="font-black text-slate-900">
                        {fmtEur(despesa.total_factura)} €
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Base: {fmtEur(despesa.base_imposable)} €
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          despesa.estat === "completada"
                            ? "bg-emerald-100 text-emerald-800"
                            : despesa.estat === "excedida"
                            ? "bg-rose-100 text-rose-800 animate-pulse"
                            : despesa.estat === "parcial"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {fmtPct(despesa.percentatge_total)}%
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          {fmtEur(despesa.import_total)} €
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {despesaImps.map(imp => (
                          <span
                            key={imp.projecte_id}
                            className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-medium"
                            title={`${fmtEur(imp.import)} €`}
                          >
                            {projecteCodiById.get(imp.projecte_id) || imp.projecte_id} ({fmtPct(imp.percentatge)}%)
                          </span>
                        ))}
                        {despesaImps.length === 0 && (
                          <span className="text-slate-400 text-xs italic">Sense assignar</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedDespesa(despesa)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition-colors"
                      >
                        Imputar
                      </button>
                    </td>

                  </tr>
                );
              })}

              {paginated.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">No s'ha trobat cap despesa</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {despeses.length === 0 
                        ? "Encara no has pujat cap fitxer d'A3. Fes clic a 'Pujar Fitxer A3' per començar." 
                        : "Prova de canviar els filtres de cerca."}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs">
            <span className="text-slate-500">
              Pàgina <strong>{safePage}</strong> de <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                aria-label="Pàgina anterior"
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                aria-label="Pàgina següent"
                className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-30 hover:bg-slate-200 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Floating Bottom Bulk Actions Bar */}
      {selectedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 border border-slate-700 max-w-4xl w-[95%] animate-in fade-in slide-in-from-bottom-5">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
              {selectedCount}
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-white leading-tight">
                {selectedCount} {selectedCount === 1 ? "factura seleccionada" : "factures seleccionades"}
              </p>
              <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                Total: <strong className="text-emerald-300">{fmtEur(selectedTotal)} €</strong>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsBulkPartidaOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Assignar Partida</span>
            </button>

            <button
              onClick={() => setIsBulkImputarOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Imputar a Projecte</span>
            </button>

            <button
              onClick={() => setIsBulkResetOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
              title="Reiniciar imputacions a 0%"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reiniciar</span>
            </button>

            <button
              onClick={() => setIsBulkDeleteOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition-colors flex items-center space-x-1.5"
              title="Eliminar factures seleccionades"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar</span>
            </button>

            <button
              onClick={clearSelection}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
              title="Deseleccionar totes"
              aria-label="Deseleccionar totes"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Modals */}
      <BulkPartidaModal
        isOpen={isBulkPartidaOpen}
        selectedCount={selectedCount}
        selectedTotal={selectedTotal}
        partides={partides}
        onClose={() => setIsBulkPartidaOpen(false)}
        onConfirm={handleBulkPartidaConfirm}
      />

      <BulkImputarModal
        isOpen={isBulkImputarOpen}
        selectedCount={selectedCount}
        selectedTotal={selectedTotal}
        withImputacionsCount={selectedWithImputacions}
        projectes={projectes}
        onClose={() => setIsBulkImputarOpen(false)}
        onConfirm={handleBulkImputarConfirm}
      />

      <BulkResetModal
        isOpen={isBulkResetOpen}
        selectedCount={selectedCount}
        selectedTotal={selectedTotal}
        onClose={() => setIsBulkResetOpen(false)}
        onConfirm={handleBulkResetConfirm}
      />

      <BulkDeleteModal
        isOpen={isBulkDeleteOpen}
        selectedCount={selectedCount}
        selectedTotal={selectedTotal}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDeleteConfirm}
      />

      {selectedDespesa && (
        <ImputacioModal
          despesa={selectedDespesa}
          onClose={() => setSelectedDespesa(null)}
        />
      )}

      {isImportOpen && (
        <ImportModal onClose={() => setIsImportOpen(false)} />
      )}
    </div>
  );
}

export default function DespesesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20 text-slate-400 space-x-2">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-sm font-medium">Carregant despeses...</span>
      </div>
    }>
      <DespesesContent />
    </Suspense>
  );
}
