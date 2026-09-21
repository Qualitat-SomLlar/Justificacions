export interface Despesa {
  id: string;
  numapunte: string;
  ndoc_a3: string;
  financador: string;
  area: string;
  projecte_a3: string;
  pis: string;
  compte_despesa: string;
  descripcio_compte: string;
  proveidor: string;
  cif: string;
  factura: string;
  data_emissio: string;
  data_pagament: string;
  descripcio_linia: string;
  any_fiscal: number;
  base_imposable: number;
  iva: number;
  irpf: number;
  cost_total: number;
  total_factura: number;
  partida_id: string;
  partida_nom?: string;
  modificat_a3?: boolean;
  es_compartida?: boolean;
  estat: 'pendent' | 'parcial' | 'completada' | 'excedida';
  percentatge_total: number;
  import_total: number;
}

export interface Imputacio {
  id: string;
  despesa_id: string;
  projecte_id: string;
  percentatge: number;
  import: number;
  observacions?: string;
  data_actualitzacio: string;
  usuari?: string;
}

export interface Projecte {
  id: string;
  codi: string;
  nom: string;
  financador: string;
  area: string;
  dates_text: string;
  pressupost_total?: number;
  actiu: boolean;
}

export interface Partida {
  id: string;
  codi: string;
  nom: string;
  activa?: boolean;
}

export interface Equivalencia {
  compte: string;
  descripcio: string;
  partida_id: string;
}

export interface ImportSummary {
  totalFilesLlegides: number;
  facturesNoves: number;
  facturesExistents: number;
  facturesModificades: number;
  senseCorrespondencia: number;
  despeses: Despesa[];
  fullUtilitzat?: string;
  columnesDetectades?: { camp: string; nomColumna: string; trobada: boolean }[];
  comptesSenseCorrespondencia?: { compte: string; descripcio: string; count: number }[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  tipus: 'imputacio' | 'importacio_a3' | 'projecte' | 'equivalencia' | 'partida' | 'nota_manual';
  titol: string;
  detall: string;
  usuari?: string;
  despesa_id?: string;
  projecte_id?: string;
  comentaris?: string;
}
