import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ExportState, FileDetails, FiltersState, JsonModelData } from '../types';
import { 
  LayersIcon, 
  MemoryIcon, 
  CheckCircleIcon, 
  InfoIcon, 
  DownloadIcon,
  CheckIcon
} from './Icons';
import { ThreeViewport } from './ThreeViewport';

interface ExportStepProps {
  exportState: ExportState;
  setExportState: Dispatch<SetStateAction<ExportState>>;
  fileDetails: FileDetails | null;
  modelData: JsonModelData | null;
  filters: FiltersState;
}

export const ExportStep = ({ exportState, setExportState, fileDetails, modelData, filters }: ExportStepProps) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadCompleted, setDownloadCompleted] = useState(false);

  const handleFormatChange = (format: ExportState['format']) => {
    if (downloading) return;
    setExportState(prev => ({
      ...prev,
      format,
      completed: false
    }));
    setDownloadCompleted(false);
  };

  const startDownload = () => {
    if (downloading) return;
    setDownloading(true);
    setProgress(0);
    setDownloadCompleted(false);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setDownloading(false);
          setDownloadCompleted(true);
          setExportState(prev => ({ ...prev, completed: true }));
          return 100;
        }
        return prev + 10;
      });
    }, 150);
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
    <div className="flex flex-1 overflow-hidden pt-4 pb-8 px-4 md:px-8 gap-6 h-[calc(100vh-72px)] select-none flex-col md:flex-row">
      {/* Left Side: 3D Preview Canvas */}
      <main className="flex-1 rounded-xl bg-surface-dim relative overflow-hidden flex flex-col group min-h-[300px] border border-outline-variant/15">
        {/* Three.js 3D Viewport Area */}
        <div className="absolute inset-0 w-full h-full">
          <ThreeViewport 
            modelData={modelData}
            filters={filters}
            showGrids={false}
            activeStep="export"
          />
        </div>

        {/* Contextual Overlay Bottom Left */}
        <div className="absolute bottom-6 left-6 glass-panel px-4 py-3 rounded-lg flex items-center gap-4 shadow-[0_8px_32px_rgba(25,27,35,0.06)] border border-outline-variant/15 z-10">
          <div className="flex items-center gap-2">
            <LayersIcon className="text-primary w-5 h-5" />
            <span className="font-body text-sm font-semibold text-on-surface">
              {fileDetails ? `Optimized_${fileDetails.name}` : 'V6_Optimized_Mesh'}
            </span>
          </div>
          <div className="w-px h-4 bg-outline-variant/30"></div>
          <div className="flex items-center gap-2 text-on-surface-variant font-body text-xs">
            <MemoryIcon className="w-4 h-4" />
            <span>Polígonos: 24.5k</span>
          </div>
        </div>

        {/* Success Toast Overlay */}
        <div className="absolute top-6 right-6 glass-panel px-5 py-3 rounded-lg flex items-center gap-3 shadow-[0_8px_32px_rgba(25,27,35,0.06)] border border-primary/20 z-10 animate-fade-in">
          <CheckCircleIcon className="text-primary w-5 h-5" />
          <span className="font-body text-sm font-semibold text-on-surface">Procesamiento completado con éxito</span>
        </div>
      </main>

      {/* Right Side: Configuration Panel */}
      <aside className="w-full md:w-80 lg:w-96 flex flex-col gap-6 bg-surface-container-low rounded-xl p-6 overflow-y-auto border border-outline-variant/15">
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
              className={`cursor-pointer relative flex items-start gap-4 p-4 rounded-lg border transition-all duration-200 ${
                exportState.format === 'rvt'
                  ? 'bg-primary-fixed border-primary/20 ring-1 ring-primary/10'
                  : 'bg-surface-container-lowest hover:bg-surface-container border-outline-variant/15'
              }`}
            >
              <div className="pt-1">
                <input 
                  type="radio" 
                  name="export_format" 
                  checked={exportState.format === 'rvt'}
                  onChange={() => {}}
                  className="w-4 h-4 text-primary bg-surface-container-lowest border-outline focus:ring-primary focus:ring-2 cursor-pointer"
                />
              </div>
              <div className="flex flex-col flex-1 gap-1">
                <span className={`font-body text-sm font-bold ${
                  exportState.format === 'rvt' ? 'text-on-primary-fixed-variant' : 'text-on-surface'
                }`}>.RVT (Revit)</span>
                <span className={`font-body text-xs ${
                  exportState.format === 'rvt' ? 'text-on-secondary-fixed-variant' : 'text-on-surface-variant'
                }`}>Modelo BIM nativo con metadatos preservados. Ideal para integraciones directas.</span>
              </div>
              {exportState.format === 'rvt' && (
                <CheckIcon className="text-primary w-5 h-5 self-center absolute right-4" />
              )}
            </label>

            {/* Format Option 2 (.EDB) */}
            <label 
              onClick={() => handleFormatChange('edb')}
              className={`cursor-pointer relative flex items-start gap-4 p-4 rounded-lg border transition-all duration-200 ${
                exportState.format === 'edb'
                  ? 'bg-primary-fixed border-primary/20 ring-1 ring-primary/10'
                  : 'bg-surface-container-lowest hover:bg-surface-container border-outline-variant/15'
              }`}
            >
              <div className="pt-1">
                <input 
                  type="radio" 
                  name="export_format" 
                  checked={exportState.format === 'edb'}
                  onChange={() => {}}
                  className="w-4 h-4 text-primary bg-surface-container-lowest border-outline focus:ring-primary focus:ring-2 cursor-pointer"
                />
              </div>
              <div className="flex flex-col flex-1 gap-1">
                <span className={`font-body text-sm font-bold ${
                  exportState.format === 'edb' ? 'text-on-primary-fixed-variant' : 'text-on-surface'
                }`}>.EDB (ETABS)</span>
                <span className={`font-body text-xs ${
                  exportState.format === 'edb' ? 'text-on-secondary-fixed-variant' : 'text-on-surface-variant'
                }`}>Geometría 3D estandarizada para compatibilidad amplia.</span>
              </div>
              {exportState.format === 'edb' && (
                <CheckIcon className="text-primary w-5 h-5 self-center absolute right-4" />
              )}
            </label>

            {/* Format Option 3 (.IFC) */}
            <label 
              onClick={() => handleFormatChange('ifc')}
              className={`cursor-pointer relative flex items-start gap-4 p-4 rounded-lg border transition-all duration-200 ${
                exportState.format === 'ifc'
                  ? 'bg-primary-fixed border-primary/20 ring-1 ring-primary/10'
                  : 'bg-surface-container-lowest hover:bg-surface-container border-outline-variant/15'
              }`}
            >
              <div className="pt-1">
                <input 
                  type="radio" 
                  name="export_format" 
                  checked={exportState.format === 'ifc'}
                  onChange={() => {}}
                  className="w-4 h-4 text-primary bg-surface-container-lowest border-outline focus:ring-primary focus:ring-2 cursor-pointer"
                />
              </div>
              <div className="flex flex-col flex-1 gap-1">
                <span className={`font-body text-sm font-bold ${
                  exportState.format === 'ifc' ? 'text-on-primary-fixed-variant' : 'text-on-surface'
                }`}>.IFC</span>
                <span className={`font-body text-xs ${
                  exportState.format === 'ifc' ? 'text-on-secondary-fixed-variant' : 'text-on-surface-variant'
                }`}>Estándar abierto para intercambio de modelos BIM.</span>
              </div>
              {exportState.format === 'ifc' && (
                <CheckIcon className="text-primary w-5 h-5 self-center absolute right-4" />
              )}
            </label>
          </div>
        </div>

        {/* Spacer to push final action to bottom */}
        <div className="flex-1"></div>

        {/* Final Action / Download Button */}
        <div className="pt-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1 text-tertiary font-body text-xs">
            <InfoIcon className="w-4 h-4 flex-shrink-0" />
            <span>El archivo final pesará aproximadamente {getFileSize()}.</span>
          </div>

          <button 
            onClick={startDownload}
            disabled={downloading}
            className={`w-full h-12 rounded-lg text-on-primary font-body text-base font-semibold flex items-center justify-center gap-2 hover:scale-[0.98] transition-all duration-200 shadow-[0_8px_32px_rgba(37,99,235,0.2)] cursor-pointer relative overflow-hidden ${
              downloading ? 'bg-primary-container border-transparent' : 'btn-primary-gradient hover:opacity-95'
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
                  <span>¡Descargado con éxito!</span>
                </>
              ) : (
                <>
                  <DownloadIcon className="w-5 h-5" />
                  <span>Exportar Modelo</span>
                </>
              )}
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
};
