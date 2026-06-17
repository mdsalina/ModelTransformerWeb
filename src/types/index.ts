export type Step = 'login' | 'upload' | 'filters' | 'process' | 'export';

export interface FileDetails {
  name: string;
  size: number; // in bytes
  progress: number; // 0 to 100
  isUploaded: boolean;
  format: string; // e.g. 'ifc' | 'dwg' | 'json' | 'edb'
}

export interface LevelsFilter {
  id: string;
  name: string;
  checked: boolean;
}

export interface SectionsFilter {
  id: string;
  name: string;
  checked: boolean;
}

export interface FiltersState {
  testMode?: boolean;
  elements: {
    muros: boolean;
    vigas: boolean;
    losas: boolean;
    grillas: boolean;
  };
  levels: LevelsFilter[];
  walls: SectionsFilter[];
  beams: SectionsFilter[];
  slabs: SectionsFilter[];
  thickness: {
    walls: { min: number; max: number };
    beams: { min: number; max: number };
    slabs: { min: number; max: number };
  };
}

export interface ProcessingParams {
  grid: {
    angularTolerance: number;
    minDistance: number;
    decimals: number;
    generateForBeams: boolean;
    keepExisting: boolean;
    distanceTolerance: number;
    gridTolerance: number;
  };
  model: {
    canonicalAngles: string; // comma separated
    maxNodeClusterDistance: number;
    minElementLength: number;
    verticalOffset: number;
    levelAdjustment: number;
    splitWallsOnBeams: boolean;
    snapThreshold: number;
  };
  processes: {
    target: 'RVT' | 'ETABS';
    removeShort: boolean;
    adjustToGrids: boolean;
    moveModel: boolean;
    moveCoords: { dx: number; dy: number; dz: number; alpha: number };
    snapNodes: boolean;
    removeBelowBase: boolean;
    snapNodesToLevel: boolean;
    splitVertical: boolean;
    splitIntersecting: boolean;
    convertShortBeamsToWalls: boolean;
    convertLongWallsToBeams: boolean;
    splitWallsHorizontal: boolean;
  };
}

export interface ExportState {
  format: 'rvt' | 'edb' | 'ifc';
  completed: boolean;
  downloadProgress: number;
}

export interface JsonProjectInfo {
  name: string;
  unit_system: string;
  discipline: string;
}

export interface JsonLevel {
  elevation: number;
  name: string;
  id: string;
}

export interface JsonGrid {
  name: string;
  p1: [number, number];
  p2: [number, number];
}

export interface JsonSection {
  code_name: string;
  type: 'Wall' | 'Slab' | 'Frame' | string;
  parameters: {
    thickness?: number;
    height?: number;
    width?: number;
    [key: string]: any;
  };
  material: string;
  shape?: string;
}

export interface JsonBeamElement {
  revit_id: string;
  section: string;
  level: string;
  location: {
    start: [number, number, number];
    end: [number, number, number];
  };
}

export interface JsonWallElement {
  revit_id: string;
  section: string;
  level: string;
  location: {
    height: number;
    outline: [number, number, number][];
    openings: any[];
  };
}

export interface JsonSlabElement {
  revit_id: string;
  section: string;
  level: string;
  location: {
    outline: [number, number, number][];
    openings: {
      outline: [number, number, number][];
      area: number;
    }[];
  };
}

export interface JsonModelData {
  project_info: JsonProjectInfo;
  levels: JsonLevel[];
  grids: JsonGrid[];
  sections: JsonSection[];
  elements: {
    beams: JsonBeamElement[];
    columns: any[];
    walls: JsonWallElement[];
    slabs: JsonSlabElement[];
  };
}

