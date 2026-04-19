export interface ChartEntry {
  label: string;
  value: number;
}

export interface TimeSeriesEntry {
  month: string;
  [key: string]: string | number;
}

export interface InventarioKpis {
  total: number;
  categorias: number;
  activos: number;
  inactivos: number;
}

export interface InventarioData {
  kpis: InventarioKpis;
  byCategory: ChartEntry[];
  byStatus: ChartEntry[];
  byLocation: ChartEntry[];
}

export interface FinancieroKpis {
  valorTotal: number;
  depreciacionAcumulada: number;
  valorLibro: number;
}

export interface FinancieroData {
  kpis: FinancieroKpis;
  depreciationTrend: TimeSeriesEntry[];
  topAssets: ChartEntry[];
}

export interface AsignacionesKpis {
  activas: number;
  disponibles: number;
  retornadas: number;
  tasaUtilizacion: number;
}

export interface AsignacionesData {
  kpis: AsignacionesKpis;
  distribution: ChartEntry[];
  topEmployees: ChartEntry[];
}

export interface MovimientosKpis {
  total: number;
  esteMes: number;
  tipoMasFrecuente: string;
}

export interface MovimientosData {
  kpis: MovimientosKpis;
  timeline: TimeSeriesEntry[];
  byType: ChartEntry[];
}

export interface AnalyticsDashboardData {
  inventario: InventarioData;
  financiero: FinancieroData;
  asignaciones: AsignacionesData;
  movimientos: MovimientosData;
}
