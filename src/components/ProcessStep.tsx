import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ProcessingParams, FiltersState, JsonModelData } from '../types';
import { 
  MemoryIcon, 
  ExpandMoreIcon, 
  CheckIcon, 
  SyncIcon, 
  CheckCircleIcon
} from './Icons';

interface ProcessStepProps {
  params: ProcessingParams;
  setParams: Dispatch<SetStateAction<ProcessingParams>>;
  onProcessCompleted: (updatedModelData: JsonModelData) => void;
  modelData: JsonModelData | null;
  filters: FiltersState;
}

export const ProcessStep = ({ params, setParams, onProcessCompleted, modelData, filters }: ProcessStepProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStateMessage, setProcessStateMessage] = useState('Esperando parámetros...');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const getFilteredModelData = (): JsonModelData | null => {
    if (!modelData) return null;

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
    const filteredColumns = modelData.elements.columns || [];

    // 7. Grillas (Las grillas de referencia no se eliminan al filtrar, solo se ocultan visualmente)
    const filteredGrids = modelData.grids || [];

    // 8. Crear estructura final
    return {
      ...modelData,
      grids: filteredGrids,
      elements: {
        ...modelData.elements,
        walls: filteredWalls,
        beams: filteredBeams,
        slabs: filteredSlabs,
        columns: filteredColumns
      }
    };
  };



  const runProcessing = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setErrorMessage(null);

    setProcessStateMessage('Filtrando geometría...');

    try {
      const filteredData = getFilteredModelData();
      if (!filteredData) {
        throw new Error('No hay datos del modelo para procesar.');
      }

      setProcessStateMessage('Enviando datos al servidor backend...');

      const payloadParams = {
        angularTolerance: params.grid.angularTolerance,
        distanceTolerance: params.grid.distanceTolerance,
        roundDecimal: params.grid.decimals,
        snapThreshold: params.model.snapThreshold,
        canonicalAngles: params.model.canonicalAngles
          ? params.model.canonicalAngles.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n))
          : [],
        maxDistance: params.model.maxNodeClusterDistance,
        lmin: params.model.minElementLength,
        dz: params.model.verticalOffset,
        dzLevel: params.model.levelAdjustment,
        beamGrid: params.grid.generateForBeams,
        divideOnlyWallsByIntersection: params.model.splitWallsOnBeams,
        keepGrids: params.grid.keepExisting,
        gridTolerance: params.grid.gridTolerance,
        removeShort: params.processes.removeShort,
        adjustToGrids: params.processes.adjustToGrids,
        moveModel: params.processes.moveModel,
        moveCoords: params.processes.moveCoords,
        snapNodes: params.processes.snapNodes,
        removeBelowBase: params.processes.removeBelowBase,
        snapNodesToLevel: params.processes.snapNodesToLevel,
        splitVertical: params.processes.splitVertical,
        splitIntersecting: params.processes.splitIntersecting,
        convertShortBeamsToWalls: params.processes.convertShortBeamsToWalls,
        convertLongWallsToBeams: params.processes.convertLongWallsToBeams,
        splitWallsHorizontal: params.processes.splitWallsHorizontal
      };

      const response = await fetch('http://127.0.0.1:8000/procesar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          revit_json_data: filteredData,
          params: payloadParams
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const detail = errorBody?.detail || response.statusText;
        throw new Error(`Error del servidor backend: ${detail}`);
      }

      const processedData = await response.json();

      setProcessStateMessage('Modelo Optimizado');
      setIsProcessing(false);
      setShowSuccessModal(true);

      onProcessCompleted(processedData);

    } catch (error: any) {
      console.error(error);
      setErrorMessage(error.message || 'Error de conexión con el backend.');
      setIsProcessing(false);
      setProcessStateMessage('Error en el procesamiento');
    }
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
    <div className="flex flex-1 overflow-hidden relative select-none pointer-events-none h-full w-full">
      {/* Left Side Panel: Processing Parameters */}
      <aside className="w-full md:w-[360px] flex-shrink-0 bg-background h-full flex flex-col shadow-[4px_0_24px_rgba(25,27,35,0.02)] relative z-10 border-r border-outline-variant/15 pointer-events-auto overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                <label className="font-body text-xs font-semibold text-on-surface-variant">Tolerancia distancia elementos (m)</label>
                <input 
                  type="number"
                  step="0.01"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.grid.distanceTolerance}
                  onChange={(e) => handleGridParamChange('distanceTolerance', parseFloat(e.target.value) || 0)}
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
                <label className="font-body text-xs font-semibold text-on-surface-variant">Tolerancia ajuste grilla (m)</label>
                <input 
                  type="number"
                  step="0.01"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.grid.gridTolerance}
                  onChange={(e) => handleGridParamChange('gridTolerance', parseFloat(e.target.value) || 0)}
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
                <label className="font-body text-xs font-semibold text-on-surface-variant">Tolerancia angular snap (°)</label>
                <input 
                  type="number"
                  step="1"
                  className="w-full bg-surface-container px-3 py-2 rounded-md border border-outline-variant/30 text-sm font-body text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  value={params.model.snapThreshold}
                  onChange={(e) => handleModelParamChange('snapThreshold', parseFloat(e.target.value) || 0)}
                />
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
                      onChange={() => setParams(prev => ({ 
                        ...prev, 
                        processes: { 
                          ...prev.processes, 
                          target: 'RVT',
                          removeShort: false,
                          adjustToGrids: false,
                          moveModel: false,
                          snapNodes: false,
                          removeBelowBase: false,
                          snapNodesToLevel: false,
                          splitVertical: false,
                          splitIntersecting: false,
                          convertShortBeamsToWalls: false,
                          convertLongWallsToBeams: false,
                          splitWallsHorizontal: false
                        } 
                      }))}
                      className="w-4 h-4 text-primary focus:ring-primary border-outline-variant cursor-pointer"
                    />
                    <span className="text-sm font-body text-on-surface">RVT</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio"
                      name="proc_target"
                      checked={params.processes.target === 'ETABS'}
                      onChange={() => setParams(prev => ({ 
                        ...prev, 
                        processes: { 
                          ...prev.processes, 
                          target: 'ETABS',
                          removeShort: true,
                          adjustToGrids: true,
                          moveModel: false,
                          snapNodes: true,
                          removeBelowBase: true,
                          snapNodesToLevel: true,
                          splitVertical: true,
                          splitIntersecting: true,
                          convertShortBeamsToWalls: true,
                          convertLongWallsToBeams: true,
                          splitWallsHorizontal: true
                        } 
                      }))}
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
        <div className="p-6 bg-surface-container-low border-t border-outline-variant/15 flex-shrink-0">
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

      {/* Right Main Content Area: 3D Preview (Transparent Overlay) */}
      <main className="flex-1 flex flex-col p-6 overflow-hidden min-h-[350px] pointer-events-none">
        {/* 3D Preview Container Overlay */}
        <div className="flex-1 relative overflow-hidden flex items-center justify-center pointer-events-none">
          {/* Processing / Success Modal Overlay */}
          {(isProcessing || showSuccessModal) && (
            <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex flex-col items-center justify-center z-15 pointer-events-auto">
              <div className={`bg-surface p-6 rounded-xl border border-outline-variant/20 shadow-xl flex flex-col items-center gap-4 max-w-[320px] text-center ${isProcessing ? 'animate-bounce' : 'animate-fade-in'}`}>
                {isProcessing ? (
                  <>
                    <SyncIcon className="w-8 h-8 text-primary animate-spin" />
                    <span className="font-headline font-bold text-sm text-on-surface">{processStateMessage}</span>
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="w-8 h-8 text-primary" />
                    <span className="font-headline font-bold text-sm text-on-surface">Procesamiento completado con éxito</span>
                    <button 
                      onClick={() => setShowSuccessModal(false)}
                      className="mt-2 px-6 py-2 bg-primary text-on-primary font-body font-semibold text-sm rounded-md hover:bg-primary/90 transition-all cursor-pointer shadow-sm hover:scale-[0.98] active:scale-[0.96]"
                    >
                      Ok
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Error Toast */}
          {errorMessage && (
            <div className="absolute bottom-6 right-6 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-5 py-3 rounded-lg flex flex-col gap-2 shadow-[0_8px_32px_rgba(25,27,35,0.08)] border border-red-500/20 animate-fade-in z-25 max-w-[320px] pointer-events-auto">
              <div className="flex items-center justify-between gap-2">
                <span className="font-body text-sm font-bold">Error de Procesamiento</span>
                <button onClick={() => setErrorMessage(null)} className="text-xs hover:underline text-red-500 font-semibold cursor-pointer">Cerrar</button>
              </div>
              <p className="font-body text-xs break-words">{errorMessage}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
