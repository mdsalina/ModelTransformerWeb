import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ExportState, JsonModelData } from '../types';
import {
  InfoIcon,
  DownloadIcon,
  CheckIcon
} from './Icons';

interface ExportStepProps {
  exportState: ExportState;
  setExportState: Dispatch<SetStateAction<ExportState>>;
  modelData: JsonModelData | null;
}

export const ExportStep = ({ exportState, setExportState, modelData }: ExportStepProps) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadCompleted, setDownloadCompleted] = useState(false);

  // ETABS Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<'idle' | 'connecting' | 'connection_failed' | 'modeling' | 'modeling_success' | 'modeling_failed'>('idle');
  const [errorDetail, setErrorDetail] = useState('');
  const [modelingSummary, setModelingSummary] = useState<{ stories: number; materials: number; sections: number; frames: number; shells: number } | null>(null);

  const handleFormatChange = (format: ExportState['format']) => {
    if (downloading) return;
    setExportState(prev => ({
      ...prev,
      format,
      completed: false
    }));
    setDownloadCompleted(false);
  };

  const downloadJson = (data: JsonModelData) => {
    const jsonString = JSON.stringify(data, null, 4);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');

    const rawName = data.project_info.name || 'modelo';
    const cleanName = rawName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    a.href = url;
    a.download = `${cleanName}_processed.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const startDownload = () => {
    if (downloading) return;
    setDownloading(true);
    setProgress(0);
    setDownloadCompleted(false);

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 10;
      if (currentProgress >= 100) {
        clearInterval(interval);
        setProgress(100);
        setDownloading(false);
        setDownloadCompleted(true);
        setExportState(prev => ({ ...prev, completed: true }));

        if (modelData) {
          downloadJson(modelData);
        }
      } else {
        setProgress(currentProgress);
      }
    }, 150);
  };

  // Mapper from JsonModelData to ETABS local agent format
  const mapToEtabsPayload = (data: JsonModelData) => {
    const stories = (data.levels || []).map(lvl => ({
      name: lvl.name,
      elevation: lvl.elevation,
      id: lvl.id
    }));

    const sections: Record<string, any> = {};
    if (data.sections) {
      data.sections.forEach(sec => {
        sections[sec.code_name] = {
          type: sec.type,
          shape: sec.shape,
          parameters: sec.parameters || {},
          material: sec.material
        };
      });
    }

    const uniqueMaterials = new Set<string>();
    if (data.sections) {
      data.sections.forEach(sec => {
        if (sec.material) {
          uniqueMaterials.add(sec.material);
        }
      });
    }
    const materials = Array.from(uniqueMaterials).map(matName => ({
      name: matName
    }));

    const beams = (data.elements?.beams || []).map(b => ({
      p1: b.location?.start || [0, 0, 0],
      p2: b.location?.end || [0, 0, 0],
      section: b.section
    }));

    const columns = (data.elements?.columns || []).map(c => ({
      p1: c.location?.start || c.p1 || [0, 0, 0],
      p2: c.location?.end || c.p2 || [0, 0, 0],
      section: c.section
    }));

    const wallsList = (data.elements?.walls || []).map(w => ({
      points: w.location?.outline || [],
      section: w.section
    }));

    const slabsList = (data.elements?.slabs || []).map(s => ({
      points: s.location?.outline || [],
      section: s.section
    }));

    // Combine walls and slabs since ETABS writer treats area elements under walls
    const combinedWalls = [...wallsList, ...slabsList];

    const grids = (data.grids || []).map(g => ({
      name: g.name,
      p1: g.p1,
      p2: g.p2
    }));

    return {
      stories,
      sections,
      materials,
      beams,
      columns,
      walls: combinedWalls,
      grids
    };
  };

  const handleEtabsModeling = async () => {
    setIsModalOpen(true);
    setModalStatus('connecting');
    setErrorDetail('');
    setModelingSummary(null);

    try {
      // 1. Connect to active ETABS session via local agent
      const connectResponse = await fetch('http://127.0.0.1:18290/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!connectResponse.ok) {
        const errData = await connectResponse.json().catch(() => ({}));
        throw new Error(errData.detail || 'Fallo en la comunicación con el servidor local o ETABS cerrado.');
      }

      // 2. Connection successful, start modeling phase
      setModalStatus('modeling');

      if (!modelData) {
        throw new Error('No hay datos del modelo cargados.');
      }

      // Map modelData to the layout expected by local_etabs_writer.py
      const payload = {
        modelData: mapToEtabsPayload(modelData)
      };

      // 3. Send payload to local agent modelar endpoint
      const modelarResponse = await fetch('http://127.0.0.1:18290/api/modelar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!modelarResponse.ok) {
        const errData = await modelarResponse.json().catch(() => ({}));
        throw new Error(errData.detail || 'Fallo al modelar la estructura en ETABS.');
      }

      const result = await modelarResponse.json();
      if (result.status === 'success') {
        setModelingSummary(result.summary);
        setModalStatus('modeling_success');
        setDownloadCompleted(true);
        setExportState(prev => ({ ...prev, completed: true }));
      } else {
        throw new Error(result.message || 'Error desconocido al inyectar datos en ETABS.');
      }
    } catch (err: any) {
      console.error('Error in ETABS loopback integration:', err);
      // Determine failure stage
      setModalStatus(prev => (prev === 'modeling' ? 'modeling_failed' : 'connection_failed'));
      setErrorDetail(err.message || 'No se pudo contactar con el Agente Local de Loopback. Asegúrate de ejecutar el servidor agent_server.py en tu máquina.');
    }
  };

  const handleExportClick = () => {
    if (exportState.format === 'edb') {
      handleEtabsModeling();
    } else {
      startDownload();
    }
  };

  const getFileSize = () => {
    switch (exportState.format) {
      case 'rvt': return '45 MB';
      case 'edb': return '12 MB';
      case 'ifc': return '28 MB';
      default: return '45 MB';
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative z-10 select-none pointer-events-none h-full w-full">
      {/* Inline styles for modal animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .scale-up-anim {
          animation: scaleUp 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.4s ease-in-out;
        }
      `}} />

      {/* Left Side: Configuration Panel (Sidebar) */}
      <aside className="w-full md:w-[360px] flex-shrink-0 flex flex-col bg-background h-full overflow-hidden border-r border-outline-variant/15 pointer-events-auto shadow-[4px_0_24px_rgba(25,27,35,0.02)] z-10">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          <header className="flex flex-col gap-1">
            <h1 className="font-headline text-2xl font-bold text-on-surface tracking-tight">Exportar</h1>
            <p className="font-body text-sm text-on-surface-variant">Configura el formato final para tu modelo optimizado.</p>
          </header>

          {/* Export Formats Group */}
          <div className="flex flex-col gap-4 mt-2">
            <h3 className="font-body text-sm font-semibold text-on-surface">Formato de Salida</h3>
            <div className="flex flex-col gap-3">
              {/* Format Option 1 (.RVT) */}
              <label
                onClick={() => handleFormatChange('rvt')}
                className={`cursor-pointer relative flex items-start gap-4 p-4 rounded-lg border transition-all duration-200 ${exportState.format === 'rvt'
                    ? 'bg-primary-fixed border-primary/20 ring-1 ring-primary/10'
                    : 'bg-surface-container-lowest hover:bg-surface-container border-outline-variant/15'
                  }`}
              >
                <div className="pt-1">
                  <input
                    type="radio"
                    name="export_format"
                    checked={exportState.format === 'rvt'}
                    onChange={() => { }}
                    className="w-4 h-4 text-primary bg-surface-container-lowest border-outline focus:ring-primary focus:ring-2 cursor-pointer"
                  />
                </div>
                <div className="flex flex-col flex-1 gap-1">
                  <span className={`font-body text-sm font-bold ${exportState.format === 'rvt' ? 'text-on-primary-fixed-variant' : 'text-on-surface'
                    }`}>.RVT (Revit)</span>
                  <span className={`font-body text-xs ${exportState.format === 'rvt' ? 'text-on-secondary-fixed-variant' : 'text-on-surface-variant'
                    }`}>Modelo BIM nativo con metadatos preservados. Ideal para integraciones directas.</span>
                </div>
                {exportState.format === 'rvt' && (
                  <CheckIcon className="text-primary w-5 h-5 self-center absolute right-4" />
                )}
              </label>

              {/* Format Option 2 (.EDB) */}
              <label
                onClick={() => handleFormatChange('edb')}
                className={`cursor-pointer relative flex items-start gap-4 p-4 rounded-lg border transition-all duration-200 ${exportState.format === 'edb'
                    ? 'bg-primary-fixed border-primary/20 ring-1 ring-primary/10'
                    : 'bg-surface-container-lowest hover:bg-surface-container border-outline-variant/15'
                  }`}
              >
                <div className="pt-1">
                  <input
                    type="radio"
                    name="export_format"
                    checked={exportState.format === 'edb'}
                    onChange={() => { }}
                    className="w-4 h-4 text-primary bg-surface-container-lowest border-outline focus:ring-primary focus:ring-2 cursor-pointer"
                  />
                </div>
                <div className="flex flex-col flex-1 gap-1">
                  <span className={`font-body text-sm font-bold ${exportState.format === 'edb' ? 'text-on-primary-fixed-variant' : 'text-on-surface'
                    }`}>.EDB (ETABS)</span>
                  <span className={`font-body text-xs ${exportState.format === 'edb' ? 'text-on-secondary-fixed-variant' : 'text-on-surface-variant'
                    }`}>Inyección directa por API COM de elementos estructurales y perfiles en ETABS.</span>
                </div>
                {exportState.format === 'edb' && (
                  <CheckIcon className="text-primary w-5 h-5 self-center absolute right-4" />
                )}
              </label>

              {/* Format Option 3 (.IFC) */}
              <label
                onClick={() => handleFormatChange('ifc')}
                className={`cursor-pointer relative flex items-start gap-4 p-4 rounded-lg border transition-all duration-200 ${exportState.format === 'ifc'
                    ? 'bg-primary-fixed border-primary/20 ring-1 ring-primary/10'
                    : 'bg-surface-container-lowest hover:bg-surface-container border-outline-variant/15'
                  }`}
              >
                <div className="pt-1">
                  <input
                    type="radio"
                    name="export_format"
                    checked={exportState.format === 'ifc'}
                    onChange={() => { }}
                    className="w-4 h-4 text-primary bg-surface-container-lowest border-outline focus:ring-primary focus:ring-2 cursor-pointer"
                  />
                </div>
                <div className="flex flex-col flex-1 gap-1">
                  <span className={`font-body text-sm font-bold ${exportState.format === 'ifc' ? 'text-on-primary-fixed-variant' : 'text-on-surface'
                    }`}>.IFC</span>
                  <span className={`font-body text-xs ${exportState.format === 'ifc' ? 'text-on-secondary-fixed-variant' : 'text-on-surface-variant'
                    }`}>Estándar abierto para intercambio de modelos BIM.</span>
                </div>
                {exportState.format === 'ifc' && (
                  <CheckIcon className="text-primary w-5 h-5 self-center absolute right-4" />
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Final Action / Download Button */}
        <div className="p-6 bg-surface-container-lowest border-t border-outline-variant/15 flex-shrink-0 flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1 text-tertiary font-body text-xs">
            <InfoIcon className="w-4 h-4 flex-shrink-0" />
            <span>
              {exportState.format === 'edb'
                ? 'Requiere ejecutar el servidor local y tener ETABS abierto.'
                : `El archivo final pesará aproximadamente ${getFileSize()}.`}
            </span>
          </div>

          <button
            onClick={handleExportClick}
            disabled={downloading}
            className={`w-full h-12 rounded-lg text-on-primary font-body text-base font-semibold flex items-center justify-center gap-2 hover:scale-[0.98] transition-all duration-200 shadow-[0_8px_32px_rgba(37,99,235,0.2)] cursor-pointer relative overflow-hidden ${downloading ? 'bg-primary-container border-transparent' : 'btn-primary-gradient hover:opacity-95'
              }`}
          >
            {/* Loading slide progress bar inside button */}
            {downloading && (
              <div
                className="absolute left-0 top-0 bottom-0 bg-primary/20 transition-all duration-150"
                style={{ width: `${progress}%` }}
              />
            )}

            <span className="relative z-10 flex items-center justify-center gap-2">
              {downloading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-on-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Exportando ({progress}%)</span>
                </>
              ) : downloadCompleted ? (
                <>
                  <CheckIcon className="w-5 h-5" />
                  <span>{exportState.format === 'edb' ? '¡Modelado con éxito!' : '¡Descargado con éxito!'}</span>
                </>
              ) : (
                <>
                  <DownloadIcon className="w-5 h-5" />
                  <span>{exportState.format === 'edb' ? 'Conectar y Modelar en ETABS' : 'Exportar Modelo'}</span>
                </>
              )}
            </span>
          </button>
        </div>
      </aside>


      {/* ETABS Integration Status Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in transition-all pointer-events-auto">
          <div className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl w-full max-w-md p-8 shadow-2xl relative flex flex-col gap-6 scale-up-anim">
            {/* Header / Title */}
            <div className="flex flex-col gap-1.5">
              <h2 className="font-headline text-2xl font-bold tracking-tight text-on-surface">
                {modalStatus === 'connecting' && 'Conectando con ETABS'}
                {modalStatus === 'connection_failed' && 'Error de Conexión'}
                {modalStatus === 'modeling' && 'Modelando Estructura'}
                {modalStatus === 'modeling_success' && '¡Modelo Generado!'}
                {modalStatus === 'modeling_failed' && 'Error al Modelar'}
              </h2>
              <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                {modalStatus === 'connecting' && 'Estableciendo comunicación con el agente local en el puerto 18290 y verificando instancia de ETABS...'}
                {modalStatus === 'connection_failed' && 'No se pudo conectar con ETABS. Verifica que el Agente Local esté activo y que tengas ETABS abierto.'}
                {modalStatus === 'modeling' && 'Conexión establecida con éxito. Transfiriendo geometría e inyectando elementos estructurales en ETABS...'}
                {modalStatus === 'modeling_success' && 'El modelo ha sido inyectado y dibujado exitosamente en tu sesión activa de ETABS.'}
                {modalStatus === 'modeling_failed' && 'La conexión fue exitosa, pero ocurrió un error durante el proceso de dibujo.'}
              </p>
            </div>

            {/* Visual State / Spinner */}
            <div className="flex justify-center items-center py-4">
              {(modalStatus === 'connecting' || modalStatus === 'modeling') && (
                <div className="relative w-20 h-20">
                  <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-t-primary border-r-primary animate-spin"></div>
                  <div className="absolute inset-0 rounded-full bg-primary/5 animate-pulse"></div>
                </div>
              )}

              {modalStatus === 'connection_failed' && (
                <div className="w-20 h-20 rounded-full bg-error-container/30 flex items-center justify-center border border-error/20 shadow-[0_0_24px_rgba(239,68,68,0.15)]">
                  <svg className="w-10 h-10 text-error animate-bounce" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
              )}

              {modalStatus === 'modeling_failed' && (
                <div className="w-20 h-20 rounded-full bg-error-container/30 flex items-center justify-center border border-error/20 shadow-[0_0_24px_rgba(239,68,68,0.15)]">
                  <svg className="w-10 h-10 text-error animate-shake" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}

              {modalStatus === 'modeling_success' && (
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-[0_0_24px_rgba(16,185,129,0.15)] animate-scale-in">
                  <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>

            {/* Error or Log Details */}
            {errorDetail && (modalStatus === 'connection_failed' || modalStatus === 'modeling_failed') && (
              <div className="bg-error-container/10 border border-error/15 rounded-lg p-4 font-mono text-[10px] text-error max-h-32 overflow-y-auto leading-relaxed">
                <span className="font-bold">Detalle del Error:</span>
                <p className="mt-1">{errorDetail}</p>
              </div>
            )}

            {/* Summary Details for Success */}
            {modalStatus === 'modeling_success' && modelingSummary && (
              <div className="bg-surface-container-low border border-outline-variant/10 rounded-lg p-5 flex flex-col gap-3">
                <span className="font-headline text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
                  Resumen del Modelado en ETABS
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col bg-surface-container-lowest px-4 py-2.5 rounded border border-outline-variant/10">
                    <span className="font-body text-[10px] text-on-surface-variant font-semibold">Niveles (Stories)</span>
                    <span className="font-headline text-base font-extrabold text-primary">{modelingSummary.stories}</span>
                  </div>
                  <div className="flex flex-col bg-surface-container-lowest px-4 py-2.5 rounded border border-outline-variant/10">
                    <span className="font-body text-[10px] text-on-surface-variant font-semibold">Materiales</span>
                    <span className="font-headline text-base font-extrabold text-primary">{modelingSummary.materials}</span>
                  </div>
                  <div className="flex flex-col bg-surface-container-lowest px-4 py-2.5 rounded border border-outline-variant/10">
                    <span className="font-body text-[10px] text-on-surface-variant font-semibold">Perfiles (Sections)</span>
                    <span className="font-headline text-base font-extrabold text-primary">{modelingSummary.sections}</span>
                  </div>
                  <div className="flex flex-col bg-surface-container-lowest px-4 py-2.5 rounded border border-outline-variant/10">
                    <span className="font-body text-[10px] text-on-surface-variant font-semibold">Marcos (Frames)</span>
                    <span className="font-headline text-base font-extrabold text-primary">{modelingSummary.frames}</span>
                  </div>
                  <div className="flex flex-col bg-surface-container-lowest px-4 py-2.5 rounded border border-outline-variant/10 col-span-2">
                    <span className="font-body text-[10px] text-on-surface-variant font-semibold">Muros y Losas (Shells)</span>
                    <span className="font-headline text-base font-extrabold text-primary">{modelingSummary.shells}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex justify-end gap-3 pt-2">
              {(modalStatus === 'connection_failed' || modalStatus === 'modeling_failed') && (
                <>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 h-11 rounded-lg border border-outline-variant/30 font-body text-xs font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleEtabsModeling}
                    className="px-5 h-11 rounded-lg btn-primary-gradient text-on-primary font-body text-xs font-semibold hover:opacity-95 transition-all shadow-md cursor-pointer"
                  >
                    Reintentar Conexión
                  </button>
                </>
              )}

              {modalStatus === 'modeling_success' && (
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="w-full h-11 rounded-lg btn-primary-gradient text-on-primary font-body text-sm font-semibold hover:opacity-95 transition-all shadow-md cursor-pointer"
                >
                  Cerrar Ventana
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
