import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ProcessingParams, FiltersState, JsonModelData } from '../types';
import { 
  MemoryIcon, 
  ExpandMoreIcon, 
  CheckIcon, 
  SyncIcon, 
  CheckCircleIcon
} from './Icons';
import { ThreeViewport } from './ThreeViewport';

interface ProcessStepProps {
  params: ProcessingParams;
  setParams: Dispatch<SetStateAction<ProcessingParams>>;
  onProcessCompleted: () => void;
  isCompleted: boolean;
  modelData: JsonModelData | null;
  filters: FiltersState;
}

export const ProcessStep = ({ params, setParams, onProcessCompleted, isCompleted, modelData, filters }: ProcessStepProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStateMessage, setProcessStateMessage] = useState('Esperando parámetros...');
  const [showToast, setShowToast] = useState(isCompleted);
  const [gridVisible, setGridVisible] = useState(true);

  useEffect(() => {
    if (isCompleted) {
      setShowToast(true);
    }
  }, [isCompleted]);

  const runProcessing = () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setShowToast(false);

    const steps = [
      'Cargando geometría base...',
      'Generando grillas estructurales...',
      'Alineando nodos y columnas...',
      'Dividir muros e intersecciones...',
      'Optimizando malla de elementos...'
    ];

    let current = 0;
    setProcessStateMessage(steps[0]);

    const interval = setInterval(() => {
      current++;
      if (current < steps.length) {
        setProcessStateMessage(steps[current]);
      } else {
        clearInterval(interval);
        setIsProcessing(false);
        setProcessStateMessage('Modelo Optimizado');
        setShowToast(true);
        onProcessCompleted();
      }
    }, 600);
  };

  const handleGridParamChange = (key: keyof ProcessingParams['grid'], value: any) => {
    setParams(prev => ({
      ...prev,
      grid: { ...prev.grid, [key]: value }
    }));
  };

  const handleModelParamChange = (key: keyof ProcessingParams['model'], value: any) => {
    setParams(prev => ({
      ...prev,
      model: { ...prev.model, [key]: value }
    }));
  };

  const handleProcessParamToggle = (key: keyof Omit<ProcessingParams['processes'], 'target' | 'moveCoords'>) => {
    setParams(prev => ({
      ...prev,
      processes: {
        ...prev.processes,
        [key]: !prev.processes[key]
      }
    }));
  };

  const handleMoveCoordChange = (key: keyof ProcessingParams['processes']['moveCoords'], value: number) => {
    setParams(prev => ({
      ...prev,
      processes: {
        ...prev.processes,
        moveCoords: {
          ...prev.processes.moveCoords,
          [key]: value
        }
      }
    }));
  };

  return (
    <div className="flex flex-1 overflow-hidden relative bg-surface-container-low select-none">
      {/* Left Side Panel: Processing Parameters */}
      <aside className="w-[360px] bg-background h-full overflow-y-auto flex flex-col shadow-[4px_0_24px_rgba(25,27,35,0.02)] relative z-10 border-r border-outline-variant/15">
        <div className="p-6 flex flex-col gap-6">
          <div>
            <h2 className="font-headline text-lg font-bold text-on-surface mb-1">Parámetros de Procesamiento</h2>
            <p className="font-body text-sm text-on-surface-variant">Configura las reglas geométricas y estructuración.</p>
          </div>

          {/* Expandable Section: Parámetros Grillas */}
          <details className="group bg-surface-container-lowest border border-outline-variant/30 rounded-lg overflow-hidden" open>
            <summary className="p-4 flex items-center justify-between cursor-pointer bg-surface-container-low hover:bg-surface-container-high transition-colors">
              <h3 className="font-headline font-semibold text-on-surface text-sm">Parámetros Grillas</h3>
              <ExpandMoreIcon className="w-5 h-5 text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="p-4 flex flex-col gap-5 border-t border-outline-variant/30 bg-surface-container-lowest">
              <div className="flex flex-col gap-1.5">
                <label className="font-body text-xs font-semibold text-on-surface-variant">Tolerancia angular (°)</label>
                <input 
                  type="number"
                  step="0.1"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.grid.angularTolerance}
                  onChange={(e) => handleGridParamChange('angularTolerance', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-body text-xs font-semibold text-on-surface-variant">Distancia mínima entre grillas (m)</label>
                <input 
                  type="number"
                  step="0.1"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.grid.minDistance}
                  onChange={(e) => handleGridParamChange('minDistance', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-body text-xs font-semibold text-on-surface-variant">Decimales de redondeo</label>
                <input 
                  type="number"
                  step="1"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.grid.decimals}
                  onChange={(e) => handleGridParamChange('decimals', parseInt(e.target.value) || 0)}
                />
              </div>

              {/* Custom Checkbox 1 */}
              <label className="flex items-center gap-3 cursor-pointer group pt-1">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox"
                    checked={params.grid.generateForBeams}
                    onChange={(e) => handleGridParamChange('generateForBeams', e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 rounded border-2 border-outline-variant peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                    <CheckIcon className="w-4 h-4 text-on-primary opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="font-body text-sm text-on-surface group-hover:text-primary transition-colors">
                  Generar grillas para vigas
                </span>
              </label>

              {/* Custom Checkbox 2 */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox"
                    checked={params.grid.keepExisting}
                    onChange={(e) => handleGridParamChange('keepExisting', e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 rounded border-2 border-outline-variant peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                    <CheckIcon className="w-4 h-4 text-on-primary opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="font-body text-sm text-on-surface group-hover:text-primary transition-colors">
                  Conservar grillas existentes
                </span>
              </label>
            </div>
          </details>

          {/* Expandable Section: Parámetros Modelo */}
          <details className="group bg-surface-container-lowest border border-outline-variant/30 rounded-lg overflow-hidden">
            <summary className="p-4 flex items-center justify-between cursor-pointer bg-surface-container-low hover:bg-surface-container-high transition-colors">
              <h3 className="font-headline font-semibold text-on-surface text-sm">Parámetros Modelo</h3>
              <ExpandMoreIcon className="w-5 h-5 text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="p-4 flex flex-col gap-5 border-t border-outline-variant/30 bg-surface-container-lowest">
              <div className="flex flex-col gap-1.5">
                <label className="font-body text-xs font-semibold text-on-surface-variant">Ángulos canónicos (°)</label>
                <input 
                  type="text"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.model.canonicalAngles}
                  onChange={(e) => handleModelParamChange('canonicalAngles', e.target.value)}
                />
                <p className="text-[10px] text-on-surface-variant">Separados por comas</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-body text-xs font-semibold text-on-surface-variant">Máx. distancia agrupación nodos (m)</label>
                <input 
                  type="number"
                  step="0.01"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.model.maxNodeClusterDistance}
                  onChange={(e) => handleModelParamChange('maxNodeClusterDistance', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-body text-xs font-semibold text-on-surface-variant">Longitud mínima de elementos (m)</label>
                <input 
                  type="number"
                  step="0.1"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.model.minElementLength}
                  onChange={(e) => handleModelParamChange('minElementLength', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-body text-xs font-semibold text-on-surface-variant">Desplazamiento vertical (m)</label>
                <input 
                  type="number"
                  step="0.1"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.model.verticalOffset}
                  onChange={(e) => handleModelParamChange('verticalOffset', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="font-body text-xs font-semibold text-on-surface-variant">Ajustes elementos a nivel (m)</label>
                <input 
                  type="number"
                  step="0.1"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.model.levelAdjustment}
                  onChange={(e) => handleModelParamChange('levelAdjustment', parseFloat(e.target.value) || 0)}
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer group pt-1">
                <div className="relative flex items-center">
                  <input 
                    type="checkbox"
                    checked={params.model.splitWallsOnBeams}
                    onChange={(e) => handleModelParamChange('splitWallsOnBeams', e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 rounded border-2 border-outline-variant peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                    <CheckIcon className="w-4 h-4 text-on-primary opacity-0 peer-checked:opacity-100 transition-opacity" />
                  </div>
                </div>
                <span className="font-body text-sm text-on-surface group-hover:text-primary transition-colors">
                  Dividir muros en intersección de vigas
                </span>
              </label>
            </div>
          </details>

          {/* Expandable Section: Procesos */}
          <details className="group bg-surface-container-lowest border border-outline-variant/30 rounded-lg overflow-hidden">
            <summary className="p-4 flex items-center justify-between cursor-pointer bg-surface-container-low hover:bg-surface-container-high transition-colors">
              <h3 className="font-headline font-semibold text-on-surface text-sm">Procesos</h3>
              <ExpandMoreIcon className="w-5 h-5 text-on-surface-variant group-open:rotate-180 transition-transform" />
            </summary>
            <div className="p-4 flex flex-col gap-5 border-t border-outline-variant/30 bg-surface-container-lowest">
              <div className="p-3 bg-surface-container-low rounded-md border border-outline-variant/20">
                <p className="font-body text-xs font-semibold text-on-surface-variant mb-2">Procesar para</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio"
                      name="proc_target"
                      checked={params.processes.target === 'RVT'}
                      onChange={() => setParams(prev => ({ ...prev, processes: { ...prev.processes, target: 'RVT' } }))}
                      className="w-4 h-4 text-primary focus:ring-primary border-outline-variant cursor-pointer"
                    />
                    <span className="text-sm font-body text-on-surface">RVT</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio"
                      name="proc_target"
                      checked={params.processes.target === 'ETABS'}
                      onChange={() => setParams(prev => ({ ...prev, processes: { ...prev.processes, target: 'ETABS' } }))}
                      className="w-4 h-4 text-primary focus:ring-primary border-outline-variant cursor-pointer"
                    />
                    <span className="text-sm font-body text-on-surface">ETABS</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {/* Processes Options */}
                {[
                  { key: 'removeShort', label: 'Remover elementos cortos' },
                  { key: 'adjustToGrids', label: 'Ajustar elementos a grillas' },
                  { key: 'moveModel', label: 'Mover o rotar modelo' },
                ].map((item) => (
                  <div key={item.key} className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input 
                          type="checkbox"
                          checked={(params.processes as any)[item.key]}
                          onChange={() => handleProcessParamToggle(item.key as any)}
                          className="peer sr-only"
                        />
                        <div className="w-5 h-5 rounded border-2 border-outline-variant peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                          <CheckIcon className="w-4 h-4 text-on-primary opacity-0 peer-checked:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <span className="font-body text-sm text-on-surface group-hover:text-primary transition-colors">
                        {item.label}
                      </span>
                    </label>

                    {item.key === 'moveModel' && params.processes.moveModel && (
                      <div className="grid grid-cols-2 gap-2 ml-8 mt-1 border-l-2 border-primary-fixed pl-3 py-1">
                        {(['dx', 'dy', 'dz', 'alpha'] as const).map((coord) => {
                          const labels: Record<string, string> = {
                            dx: 'Dx (m)',
                            dy: 'Dy (m)',
                            dz: 'Dz (m)',
                            alpha: 'Alpha (°)'
                          };
                          return (
                            <div key={coord} className="flex flex-col gap-1">
                              <label className="text-[10px] font-semibold text-on-surface-variant">
                                {labels[coord]}
                              </label>
                              <input 
                                type="number"
                                className="w-full bg-surface-container px-2 py-1 rounded border border-outline-variant/30 text-xs font-body text-on-surface focus:outline-none focus:border-primary"
                                value={params.processes.moveCoords[coord]}
                                onChange={(e) => handleMoveCoordChange(coord, parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}

                {[
                  { key: 'snapNodes', label: 'Snap nodos' },
                  { key: 'removeBelowBase', label: 'Remover elementos bajos nivel base' },
                  { key: 'snapNodesToLevel', label: 'Snap nodos a nivel' },
                  { key: 'splitVertical', label: 'Dividir elementos verticalmente' },
                  { key: 'splitIntersecting', label: 'Dividir elementos en intersección con otros' },
                  { key: 'convertShortBeamsToWalls', label: 'Convertir vigas cortas a muros' },
                  { key: 'convertLongWallsToBeams', label: 'Convertir muros largos a vigas' },
                  { key: 'splitWallsHorizontal', label: 'Dividir muros en horizontal' },
                ].map((item) => (
                  <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox"
                        checked={(params.processes as any)[item.key]}
                        onChange={() => handleProcessParamToggle(item.key as any)}
                        className="peer sr-only"
                      />
                      <div className="w-5 h-5 rounded border-2 border-outline-variant peer-checked:bg-primary peer-checked:border-primary transition-all flex items-center justify-center">
                        <CheckIcon className="w-4 h-4 text-on-primary opacity-0 peer-checked:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <span className="font-body text-sm text-on-surface group-hover:text-primary transition-colors">
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </details>
        </div>

        {/* Sidebar Footer Execution Button */}
        <div className="mt-auto p-6 bg-surface-container-low border-t border-outline-variant/15">
          <button 
            onClick={runProcessing}
            disabled={isProcessing}
            className={`w-full py-3 px-4 text-on-primary hover:opacity-95 font-body font-semibold text-sm rounded-DEFAULT transition-all flex justify-center items-center gap-2 shadow-sm cursor-pointer hover:scale-[0.99] active:scale-[0.97] ${
              isProcessing ? 'bg-primary-container cursor-not-allowed opacity-80' : 'bg-primary'
            }`}
          >
            {isProcessing ? (
              <SyncIcon className="w-4 h-4 animate-spin" />
            ) : (
              <MemoryIcon className="w-4 h-4" />
            )}
            <span>{isProcessing ? 'Procesando modelo...' : 'Ejecutar Procesamiento'}</span>
          </button>
        </div>
      </aside>

      {/* Right Main Content Area: 3D Preview */}
      <main className="flex-1 flex flex-col p-6 overflow-hidden min-h-[350px]">
        {/* 3D Preview Container */}
        <div className="flex-1 bg-surface-dim rounded-xl relative overflow-hidden flex items-center justify-center border border-outline-variant/20 shadow-inner">
          
          {/* Three.js 3D Viewport Area */}
          <div className="absolute inset-0 w-full h-full">
            <ThreeViewport 
              modelData={modelData}
              filters={filters}
              showGrids={gridVisible}
              activeStep="process"
              processTranslation={
                params.processes.moveModel 
                  ? params.processes.moveCoords 
                  : { dx: 0, dy: 0, dz: 0, alpha: 0 }
              }
            />
          </div>

          {/* Floating Glass Viewport controls */}
          <div className="absolute top-6 left-6 glass-panel rounded-lg p-2 flex flex-col gap-2 ambient-shadow border border-outline-variant/15 z-20">
            <button 
              onClick={() => setGridVisible(prev => !prev)}
              className={`p-2 rounded transition-colors group relative ${
                gridVisible ? 'text-primary bg-primary-fixed/30 hover:bg-primary-fixed/50' : 'text-on-surface hover:bg-surface-container-low'
              }`}
              title="Toggle Grid"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6h16.5M9 3.75v16.5m6-16.5v16.5" />
              </svg>
            </button>
          </div>

          {/* Processing Status Overlay */}
          <div className="absolute top-6 right-6 glass-panel rounded-lg px-4 py-3 ambient-shadow border border-outline-variant/15 flex items-center gap-3 z-20">
            <SyncIcon className={`text-primary w-5 h-5 ${isProcessing ? 'animate-spin' : ''}`} />
            <div>
              <p className="font-body text-xs font-semibold text-on-surface">
                {isProcessing ? 'Procesando...' : isCompleted ? 'Modelo Optimizado' : 'Modelo Listo'}
              </p>
              <p className="font-body text-[10px] text-on-surface-variant truncate max-w-[140px]">
                {isProcessing ? processStateMessage : isCompleted ? 'Procesado con éxito' : 'Esperando parámetros...'}
              </p>
            </div>
          </div>

          {/* Live Loading Overlay */}
          {isProcessing && (
            <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-15">
              <div className="bg-surface p-6 rounded-xl border border-outline-variant/20 shadow-xl flex flex-col items-center gap-4 animate-bounce">
                <SyncIcon className="w-8 h-8 text-primary animate-spin" />
                <span className="font-headline font-bold text-sm text-on-surface">{processStateMessage}</span>
              </div>
            </div>
          )}

          {/* Success Toast */}
          {showToast && !isProcessing && (
            <div className="absolute bottom-6 right-6 glass-panel px-5 py-3 rounded-lg flex items-center gap-3 shadow-[0_8px_32px_rgba(25,27,35,0.06)] border border-primary/20 animate-fade-in z-20">
              <CheckCircleIcon className="text-primary w-5 h-5" />
              <span className="font-body text-sm font-medium text-on-surface">Procesamiento completado con éxito</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
