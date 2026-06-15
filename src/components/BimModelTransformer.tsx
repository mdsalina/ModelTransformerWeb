import { useState } from 'react';
import type { Step, FileDetails, FiltersState, ProcessingParams, ExportState, JsonModelData } from '../types';
import { LoginScreen } from './LoginScreen';
import { UploadStep } from './UploadStep';
import { FiltersStep } from './FiltersStep';
import { ProcessStep } from './ProcessStep';
import { ExportStep } from './ExportStep';
import { ArrowForwardIcon, MenuIcon, CloseIcon } from './Icons';

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

  // Thickness Limits State
  const [thicknessLimits, setThicknessLimits] = useState(DEFAULT_LIMITS);

  // Filters State
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);

  // Processing Parameters State
  const [processingParams, setProcessingParams] = useState<ProcessingParams>({
    grid: {
      angularTolerance: 1.0,
      minDistance: 0.5,
      decimals: 2,
      generateForBeams: true,
      keepExisting: false
    },
    model: {
      canonicalAngles: '0, 90, 180, 270',
      maxNodeClusterDistance: 0.10,
      minElementLength: 0.2,
      verticalOffset: 0.0,
      levelAdjustment: 0.1,
      splitWallsOnBeams: true
    },
    processes: {
      target: 'RVT',
      removeShort: false,
      adjustToGrids: false,
      moveModel: true,
      moveCoords: { dx: 0.0, dy: 0.0, dz: 0.0, alpha: 0.0 },
      snapNodes: false,
      removeBelowBase: false,
      snapNodesToLevel: false,
      splitVertical: false,
      splitIntersecting: false,
      convertShortBeamsToWalls: false,
      convertLongWallsToBeams: false,
      splitWallsHorizontal: false
    }
  });

  // State to check if processing is finished (unlocks step 4)
  const [processingCompleted, setProcessingCompleted] = useState(false);

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

  const handleFileUploaded = (file: FileDetails, data: JsonModelData) => {
    setFileDetails(file);
    setModelData(data);
    
    // 1. Process levels
    const dynamicLevels = data.levels.map(l => ({
      id: l.id,
      name: l.name,
      checked: true
    }));

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
          wallsSecs.push({ id: `wall-${index}`, name: secName, checked: true, thickness });
        }
      } else if (secType === 'Slab') {
        const thickness = (section.parameters.thickness || 0.15) * 1000;
        if (!slabsSecs.some(s => s.name === secName)) {
          slabsSecs.push({ id: `slab-${index}`, name: secName, checked: true, thickness });
        }
      } else if (secType === 'Frame') {
        const thickness = (section.parameters.width || 0.2) * 1000;
        if (!beamsSecs.some(s => s.name === secName)) {
          beamsSecs.push({ id: `beam-${index}`, name: secName, checked: true, thickness });
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

    // 4. Update limits and current selections
    setThicknessLimits({
      walls: { min: wallsRange.min, max: wallsRange.max },
      beams: { min: beamsRange.min, max: beamsRange.max },
      slabs: { min: slabsRange.min, max: slabsRange.max }
    });

    setFilters({
      testMode: false,
      elements: { muros: true, vigas: true, losas: true, grillas: true },
      levels: dynamicLevels,
      walls: wallsSecs,
      beams: beamsSecs,
      slabs: slabsSecs,
      thickness: {
        walls: { min: wallsRange.min, max: wallsRange.max },
        beams: { min: beamsRange.min, max: beamsRange.max },
        slabs: { min: slabsRange.min, max: slabsRange.max }
      }
    });
  };

  const handleClearFile = () => {
    setFileDetails(null);
    setModelData(null);
    setFilters(DEFAULT_FILTERS);
    setThicknessLimits(DEFAULT_LIMITS);
    setProcessingCompleted(false);
    setExportState(prev => ({ ...prev, completed: false }));
  };

  const handleProcessCompleted = () => {
    setProcessingCompleted(true);
  };

  // Step access rules
  const isStepUnlocked = (step: Step): boolean => {
    if (step === 'login') return true;
    if (step === 'upload') return true;
    if (step === 'filters' || step === 'process') {
      return !!fileDetails?.isUploaded;
    }
    if (step === 'export') {
      return processingCompleted;
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
      return processingCompleted;
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
      <nav className="bg-[#faf8ff] flex justify-between items-center w-full px-6 md:px-8 py-4 max-w-full docked full-width border-b border-outline-variant/10 z-50">
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
            fileDetails={fileDetails} 
            modelData={modelData}
            thicknessLimits={thicknessLimits}
          />
        )}
        
        {currentStep === 'process' && (
          <ProcessStep 
            params={processingParams} 
            setParams={setProcessingParams} 
            onProcessCompleted={handleProcessCompleted}
            isCompleted={processingCompleted}
            modelData={modelData}
            filters={filters}
          />
        )}
        
        {currentStep === 'export' && (
          <ExportStep 
            exportState={exportState} 
            setExportState={setExportState} 
            fileDetails={fileDetails} 
            modelData={modelData}
            filters={filters}
          />
        )}
      </div>
    </div>
  );
};
export default BimModelTransformer;
