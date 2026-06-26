import { useState } from 'react';
import type { Step, FileDetails, FiltersState, ProcessingParams, ExportState, JsonModelData } from '../types';
import { LoginScreen } from './LoginScreen';
import { UploadStep } from './UploadStep';
import { FiltersStep } from './FiltersStep';
import { ProcessStep } from './ProcessStep';
import { ExportStep } from './ExportStep';
import { ThreeViewport } from './ThreeViewport';
import { ArrowForwardIcon, MenuIcon, CloseIcon } from './Icons';
import { cleanGridsInModel } from '../utils/gridUtils';

const DEFAULT_FILTERS: FiltersState = {
  testMode: false,
  elements: { muros: true, vigas: true, losas: true, grillas: true },
  levels: [
    { id: 'l1', name: 'Nivel 1', checked: true },
    { id: 'l2', name: 'Nivel 2', checked: true },
    { id: 'l3', name: 'Nivel 3', checked: false }
  ],
  walls: [
    { id: 'w1', name: 'Muro H.A. 20cm', checked: true },
    { id: 'w2', name: 'Muro H.A. 25cm', checked: true }
  ],
  beams: [
    { id: 'b1', name: 'Viga 20x40', checked: true },
    { id: 'b2', name: 'Viga 30x60', checked: true }
  ],
  slabs: [
    { id: 's1', name: 'Losa Maciza 15cm', checked: true }
  ],
  thickness: {
    walls: { min: 100, max: 400 },
    beams: { min: 200, max: 600 },
    slabs: { min: 100, max: 250 }
  }
};

const DEFAULT_LIMITS = {
  walls: { min: 100, max: 400 },
  beams: { min: 200, max: 600 },
  slabs: { min: 100, max: 250 }
};

export const BimModelTransformer = () => {
  const [currentStep, setCurrentStep] = useState<Step>('login');
  
  // File Upload State
  const [fileDetails, setFileDetails] = useState<FileDetails | null>(null);
  const [modelData, setModelData] = useState<JsonModelData | null>(null);
  const [originalModel, setOriginalModel] = useState<JsonModelData | null>(null);
  const [processedModel, setProcessedModel] = useState<JsonModelData | null>(null);
  const [activeModelType, setActiveModelType] = useState<'original' | 'processed'>('original');

  // Thickness Limits State
  const [thicknessLimits, setThicknessLimits] = useState(DEFAULT_LIMITS);

  // Filters State
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [hiddenElementIds, setHiddenElementIds] = useState<Set<string>>(new Set());

  // Processing Parameters State
  const [processingParams, setProcessingParams] = useState<ProcessingParams>({
    grid: {
      angularTolerance: 1.0,
      minDistance: 0.5,
      decimals: 2,
      generateForBeams: true,
      keepExisting: false,
      distanceTolerance: 0.15,
      gridTolerance: 0.5
    },
    model: {
      canonicalAngles: '0, 90, 180, 270',
      maxNodeClusterDistance: 0.10,
      minElementLength: 0.2,
      verticalOffset: 0.0,
      levelAdjustment: 0.1,
      splitWallsOnBeams: true,
      snapThreshold: 20
    },
    processes: {
      target: 'ETABS',
      removeShort: true,
      adjustToGrids: true,
      moveModel: false,
      moveCoords: { dx: 0.0, dy: 0.0, dz: 0.0, alpha: 0.0 },
      snapNodes: true,
      removeBelowBase: true,
      snapNodesToLevel: true,
      splitVertical: true,
      splitIntersecting: true,
      convertShortBeamsToWalls: true,
      convertLongWallsToBeams: true,
      splitWallsHorizontal: true
    }
  });


  // Export State
  const [exportState, setExportState] = useState<ExportState>({
    format: 'rvt',
    completed: false,
    downloadProgress: 0
  });

  // Mobile Menu State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLoginSuccess = () => {
    setCurrentStep('upload');
  };

  const updateFiltersAndLimitsFromModel = (data: JsonModelData, currentFilters?: FiltersState) => {
    // 1. Process levels
    const dynamicLevels = data.levels.map(l => {
      const existingLvl = currentFilters?.levels.find(el => el.name === l.name);
      return {
        id: l.id,
        name: l.name,
        checked: existingLvl ? existingLvl.checked : true
      };
    });

    // 2. Process sections
    const wallsSecs: { id: string, name: string, checked: boolean, thickness: number }[] = [];
    const beamsSecs: { id: string, name: string, checked: boolean, thickness: number }[] = [];
    const slabsSecs: { id: string, name: string, checked: boolean, thickness: number }[] = [];

    data.sections.forEach((section, index) => {
      const secName = section.code_name;
      const secType = section.type;
      
      if (secType === 'Wall') {
        const thickness = (section.parameters.thickness || 0.2) * 1000;
        if (!wallsSecs.some(s => s.name === secName)) {
          const existingSec = currentFilters?.walls.find(es => es.name === secName);
          wallsSecs.push({ 
            id: `wall-${index}`, 
            name: secName, 
            checked: existingSec ? existingSec.checked : true, 
            thickness 
          });
        }
      } else if (secType === 'Slab') {
        const thickness = (section.parameters.thickness || 0.15) * 1000;
        if (!slabsSecs.some(s => s.name === secName)) {
          const existingSec = currentFilters?.slabs.find(es => es.name === secName);
          slabsSecs.push({ 
            id: `slab-${index}`, 
            name: secName, 
            checked: existingSec ? existingSec.checked : true, 
            thickness 
          });
        }
      } else if (secType === 'Frame') {
        const thickness = (section.parameters.width || 0.2) * 1000;
        if (!beamsSecs.some(s => s.name === secName)) {
          const existingSec = currentFilters?.beams.find(es => es.name === secName);
          beamsSecs.push({ 
            id: `beam-${index}`, 
            name: secName, 
            checked: existingSec ? existingSec.checked : true, 
            thickness 
          });
        }
      }
    });

    // 3. Compute dynamic thickness ranges
    const wallsThs = wallsSecs.map(s => s.thickness);
    const beamsThs = beamsSecs.map(s => s.thickness);
    const slabsThs = slabsSecs.map(s => s.thickness);

    const minMax = (arr: number[], defMin: number, defMax: number) => {
      if (arr.length === 0) return { min: defMin, max: defMax };
      return { min: Math.min(...arr), max: Math.max(...arr) };
    };

    const wallsRange = minMax(wallsThs, 100, 400);
    const beamsRange = minMax(beamsThs, 200, 600);
    const slabsRange = minMax(slabsThs, 100, 250);

    // 4. Update limits
    const newLimits = {
      walls: { min: wallsRange.min, max: wallsRange.max },
      beams: { min: beamsRange.min, max: beamsRange.max },
      slabs: { min: slabsRange.min, max: slabsRange.max }
    };
    setThicknessLimits(newLimits);

    // 5. Build new filters
    const preservedElements = currentFilters 
      ? { ...currentFilters.elements } 
      : { muros: true, vigas: true, losas: true, grillas: true };
    
    const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));
    
    const preservedThickness = currentFilters ? {
      walls: {
        min: clamp(currentFilters.thickness.walls.min, newLimits.walls.min, newLimits.walls.max),
        max: clamp(currentFilters.thickness.walls.max, newLimits.walls.min, newLimits.walls.max)
      },
      beams: {
        min: clamp(currentFilters.thickness.beams.min, newLimits.beams.min, newLimits.beams.max),
        max: clamp(currentFilters.thickness.beams.max, newLimits.beams.min, newLimits.beams.max)
      },
      slabs: {
        min: clamp(currentFilters.thickness.slabs.min, newLimits.slabs.min, newLimits.slabs.max),
        max: clamp(currentFilters.thickness.slabs.max, newLimits.slabs.min, newLimits.slabs.max)
      }
    } : {
      walls: { min: wallsRange.min, max: wallsRange.max },
      beams: { min: beamsRange.min, max: beamsRange.max },
      slabs: { min: slabsRange.min, max: slabsRange.max }
    };

    setFilters({
      testMode: currentFilters?.testMode ?? false,
      elements: preservedElements,
      levels: dynamicLevels,
      walls: wallsSecs,
      beams: beamsSecs,
      slabs: slabsSecs,
      thickness: preservedThickness
    });
  };

  const handleFileUploaded = (file: FileDetails, data: JsonModelData) => {
    setFileDetails(file);
    const cleanedData = cleanGridsInModel(data);
    setModelData(cleanedData);
    setOriginalModel(cleanedData);
    setProcessedModel(null);
    setActiveModelType('original');
    updateFiltersAndLimitsFromModel(cleanedData);
  };

  const handleClearFile = () => {
    setFileDetails(null);
    setModelData(null);
    setOriginalModel(null);
    setProcessedModel(null);
    setActiveModelType('original');
    setFilters(DEFAULT_FILTERS);
    setThicknessLimits(DEFAULT_LIMITS);
    setExportState(prev => ({ ...prev, completed: false }));
  };

  const handleProcessCompleted = (updatedModelData: JsonModelData) => {
    const cleanedData = cleanGridsInModel(updatedModelData);
    setOriginalModel(modelData);
    setProcessedModel(cleanedData);
    setActiveModelType('processed');
    setModelData(cleanedData);
    updateFiltersAndLimitsFromModel(cleanedData, filters);
  };

  const handleSwitchModel = (type: 'original' | 'processed') => {
    if (type === activeModelType) return;

    // Guardar el estado del modelo actual antes de cambiar
    if (activeModelType === 'original') {
      setOriginalModel(modelData);
    } else {
      setProcessedModel(modelData);
    }

    // Cambiar al modelo seleccionado
    const targetModel = type === 'original' ? originalModel : processedModel;
    if (targetModel) {
      setModelData(targetModel);
      updateFiltersAndLimitsFromModel(targetModel, filters);
    }
    setActiveModelType(type);
  };

  const handleFilterAndSave = () => {
    if (!modelData) return;

    // 1. Obtener niveles marcados
    const checkedLevels = new Set(
      filters.levels.filter((l) => l.checked).map((l) => l.id)
    );

    // 2. Obtener secciones marcadas
    const checkedWallsSecs = new Set(
      filters.walls.filter((s) => s.checked).map((s) => s.name)
    );
    const checkedBeamsSecs = new Set(
      filters.beams.filter((s) => s.checked).map((s) => s.name)
    );
    const checkedSlabsSecs = new Set(
      filters.slabs.filter((s) => s.checked).map((s) => s.name)
    );

    // 3. Filtrar muros
    const filteredWalls = (modelData.elements.walls || []).filter((wall) => {
      if (!filters.elements.muros) return false;
      if (!checkedLevels.has(wall.level)) return false;
      if (!checkedWallsSecs.has(wall.section)) return false;
      if (hiddenElementIds.has(wall.revit_id)) return false;

      const wallSec = modelData.sections.find(s => s.code_name === wall.section);
      if (wallSec) {
        const thickness = (wallSec.parameters.thickness || 0.2) * 1000;
        if (thickness < filters.thickness.walls.min || thickness > filters.thickness.walls.max) {
          return false;
        }
      }
      return true;
    });

    // 4. Filtrar vigas
    const filteredBeams = (modelData.elements.beams || []).filter((beam) => {
      if (!filters.elements.vigas) return false;
      if (!checkedLevels.has(beam.level)) return false;
      if (!checkedBeamsSecs.has(beam.section)) return false;
      if (hiddenElementIds.has(beam.revit_id)) return false;

      const beamSec = modelData.sections.find(s => s.code_name === beam.section);
      if (beamSec) {
        const thickness = (beamSec.parameters.width || 0.2) * 1000;
        if (thickness < filters.thickness.beams.min || thickness > filters.thickness.beams.max) {
          return false;
        }
      }
      return true;
    });

    // 5. Filtrar losas
    const filteredSlabs = (modelData.elements.slabs || []).filter((slab) => {
      if (!filters.elements.losas) return false;
      if (!checkedLevels.has(slab.level)) return false;
      if (!checkedSlabsSecs.has(slab.section)) return false;
      if (hiddenElementIds.has(slab.revit_id)) return false;

      const slabSec = modelData.sections.find(s => s.code_name === slab.section);
      if (slabSec) {
        const thickness = (slabSec.parameters.thickness || 0.15) * 1000;
        if (thickness < filters.thickness.slabs.min || thickness > filters.thickness.slabs.max) {
          return false;
        }
      }
      return true;
    });

    // 6. Columnas
    const filteredColumns = (modelData.elements.columns || []).filter((col) => {
      if (col.revit_id && hiddenElementIds.has(col.revit_id)) return false;
      return true;
    });

    // 7. Grillas (Las grillas de referencia no se eliminan al filtrar, solo se ocultan visualmente)
    const filteredGrids = modelData.grids || [];

    // 8. Filtrar secciones para dejar solo las usadas
    const usedSectionNames = new Set<string>();
    filteredWalls.forEach(w => usedSectionNames.add(w.section));
    filteredBeams.forEach(b => usedSectionNames.add(b.section));
    filteredSlabs.forEach(s => usedSectionNames.add(s.section));
    filteredColumns.forEach(c => {
      if (c.section) usedSectionNames.add(c.section);
    });

    const filteredSections = modelData.sections.filter(s => usedSectionNames.has(s.code_name));

    const updatedModelData: JsonModelData = {
      ...modelData,
      grids: filteredGrids,
      sections: filteredSections,
      elements: {
        ...modelData.elements,
        walls: filteredWalls,
        beams: filteredBeams,
        slabs: filteredSlabs,
        columns: filteredColumns
      }
    };

    setHiddenElementIds(new Set());
    setModelData(updatedModelData);
    if (activeModelType === 'original') {
      setOriginalModel(updatedModelData);
    } else {
      setProcessedModel(updatedModelData);
    }
    updateFiltersAndLimitsFromModel(updatedModelData, filters);
  };

  // Step access rules
  const isStepUnlocked = (step: Step): boolean => {
    if (step === 'login') return true;
    if (step === 'upload') return true;
    if (step === 'filters' || step === 'process' || step === 'export') {
      return !!fileDetails?.isUploaded;
    }
    return false;
  };

  // Continue Button behavior
  const isContinueEnabled = (): boolean => {
    if (currentStep === 'upload') {
      return !!fileDetails?.isUploaded;
    }
    if (currentStep === 'filters') {
      return true;
    }
    if (currentStep === 'process') {
      return true;
    }
    return false;
  };

  const handleContinue = () => {
    if (!isContinueEnabled()) return;
    if (currentStep === 'upload') {
      setCurrentStep('filters');
    } else if (currentStep === 'filters') {
      setCurrentStep('process');
    } else if (currentStep === 'process') {
      setCurrentStep('export');
    }
  };

  const getStepLabel = (step: Step): string => {
    switch (step) {
      case 'upload': return 'Cargar modelo';
      case 'filters': return 'Filtros';
      case 'process': return 'Procesar';
      case 'export': return 'Exportar';
      default: return '';
    }
  };

  if (currentStep === 'login') {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col antialiased h-screen overflow-hidden">
      {/* Top Navigation Bar */}
      <nav className="bg-[#faf8ff] flex justify-between items-center w-full px-6 md:px-8 h-[72px] max-w-full docked full-width border-b border-outline-variant/10 z-50">
        <div className="flex items-center gap-8">
          <span className="text-xl font-bold tracking-tight text-[#191b23] font-headline select-none">
            Revit2Etabs
          </span>
          {/* Desktop step links */}
          <div className="hidden md:flex items-center gap-6">
            {(['upload', 'filters', 'process', 'export'] as const).map((step) => {
              const active = currentStep === step;
              const unlocked = isStepUnlocked(step);
              return (
                <button
                  key={step}
                  onClick={() => unlocked && setCurrentStep(step)}
                  disabled={!unlocked}
                  className={`font-body text-sm tracking-tight pb-1 border-b-2 transition-all duration-150 select-none ${
                    active 
                      ? 'text-blue-700 border-blue-600 font-bold' 
                      : unlocked
                        ? 'text-[#191b23]/60 border-transparent hover:text-blue-600 font-medium'
                        : 'text-[#191b23]/30 border-transparent cursor-not-allowed font-medium'
                  }`}
                >
                  {getStepLabel(step)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action Button & Mobile Hamburguer */}
        <div className="flex items-center gap-3">
          {currentStep !== 'export' && (
            <button
              onClick={handleContinue}
              disabled={!isContinueEnabled()}
              className={`px-6 py-2.5 rounded-md font-label text-sm font-semibold flex items-center gap-1.5 transition-all select-none hover:scale-[0.99] active:scale-[0.97] ${
                isContinueEnabled()
                  ? 'signature-gradient text-on-primary shadow-md cursor-pointer'
                  : 'bg-surface-container-high text-on-surface-variant/40 opacity-50 cursor-not-allowed'
              }`}
            >
              <span>Continuar</span>
              <ArrowForwardIcon className="w-4 h-4" />
            </button>
          )}

          {/* Mobile Menu Icon Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="md:hidden p-2 text-on-surface hover:bg-surface-container-high rounded-md transition-colors"
          >
            {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Drawer Overlay */}
      {mobileMenuOpen && (
        <div 
          onClick={() => setMobileMenuOpen(false)}
          className="md:hidden fixed inset-0 top-[72px] bg-black/20 backdrop-blur-[2px] z-40 flex justify-end"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-64 bg-background h-full shadow-2xl p-6 flex flex-col gap-6 animate-slide-in"
          >
            <div>
              <span className="text-xs font-bold text-on-surface-variant tracking-wider uppercase block mb-4">
                Pestañas del Proceso
              </span>
              <div className="flex flex-col gap-2">
                {(['upload', 'filters', 'process', 'export'] as const).map((step) => {
                  const active = currentStep === step;
                  const unlocked = isStepUnlocked(step);
                  return (
                    <button
                      key={step}
                      disabled={!unlocked}
                      onClick={() => {
                        setCurrentStep(step);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 rounded-lg font-body text-sm flex items-center justify-between transition-colors ${
                        active 
                          ? 'bg-primary-fixed text-blue-800 font-bold' 
                          : unlocked
                            ? 'text-on-surface hover:bg-surface-container-low font-medium'
                            : 'text-on-surface-variant/40 cursor-not-allowed font-medium'
                      }`}
                    >
                      <span>{getStepLabel(step)}</span>
                      {!unlocked && (
                        <span className="text-xs text-on-surface-variant/30 font-light select-none">Bloqueado</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Quick Project Summary */}
            <div className="mt-auto border-t border-outline-variant/15 pt-4">
              <span className="text-[10px] font-bold text-on-surface-variant tracking-wider uppercase block mb-2">
                Archivo Activo
              </span>
              <span className="font-body text-xs text-on-surface font-semibold truncate block">
                {fileDetails ? fileDetails.name : 'Ninguno'}
              </span>
              {fileDetails && (
                <span className="font-body text-[10px] text-on-surface-variant block mt-1">
                  Formato: {fileDetails.format}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Background Tonal Shift Canvas layer */}
        <div className="absolute inset-0 bg-surface-container-low opacity-20 pointer-events-none"></div>

        {/* Persistent 3D Viewport on the right (stacked bottom on mobile) */}
        {(currentStep === 'filters' || currentStep === 'process' || currentStep === 'export') && (
          <div className="absolute md:left-[360px] left-0 right-0 md:top-0 top-[40vh] bottom-0 z-0 bg-surface-dim p-8 rounded-tl-2xl overflow-hidden flex flex-col min-h-[350px]">
            
            {/* Control de Modelos (Original / Procesado) */}
            {modelData && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex bg-[#faf8ff]/85 backdrop-blur-md p-1 rounded-xl border border-outline-variant/30 shadow-md pointer-events-auto">
                <button
                  onClick={() => handleSwitchModel('original')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all duration-150 select-none ${
                    activeModelType === 'original'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
                  }`}
                >
                  Original
                </button>
                {processedModel && (
                  <button
                    onClick={() => handleSwitchModel('processed')}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all duration-150 select-none ${
                      activeModelType === 'processed'
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
                    }`}
                  >
                    Procesado
                  </button>
                )}
              </div>
            )}

            <div className="flex-1 relative w-full mt-0" style={{ minHeight: '280px' }}>
              <ThreeViewport 
                key={fileDetails?.name || ''}
                modelData={modelData}
                filters={filters}
                showGrids={currentStep === 'process' ? true : filters.elements.grillas}
                activeStep={currentStep}
                fileName={fileDetails?.name}
                processTranslation={
                  currentStep === 'process' && processingParams.processes.moveModel
                    ? processingParams.processes.moveCoords
                    : { dx: 0, dy: 0, dz: 0, alpha: 0 }
                }
                hiddenElementIds={hiddenElementIds}
                setHiddenElementIds={setHiddenElementIds}
              />
            </div>
          </div>
        )}

        {/* Step Component Router */}
        {currentStep === 'upload' && (
          <UploadStep 
            onFileUploaded={handleFileUploaded} 
            fileDetails={fileDetails} 
            onClearFile={handleClearFile} 
          />
        )}
        
        {currentStep === 'filters' && (
          <FiltersStep 
            filters={filters} 
            setFilters={setFilters} 
            thicknessLimits={thicknessLimits}
            onFilterAndSave={handleFilterAndSave}
          />
        )}
        
        {currentStep === 'process' && (
          <ProcessStep 
            params={processingParams} 
            setParams={setProcessingParams} 
            onProcessCompleted={handleProcessCompleted}
            modelData={modelData}
            filters={filters}
          />
        )}
        
        {currentStep === 'export' && (
          <ExportStep 
            exportState={exportState} 
            setExportState={setExportState} 
            modelData={modelData}
          />
        )}
      </div>
    </div>
  );
};
export default BimModelTransformer;
