import { useState, useRef } from 'react';
import type { FileDetails, JsonModelData } from '../types';
import { UploadFileIcon, CheckCircleIcon, SyncIcon } from './Icons';

interface UploadStepProps {
  onFileUploaded: (file: FileDetails, data: JsonModelData) => void;
  fileDetails: FileDetails | null;
  onClearFile: () => void;
}

export const UploadStep = ({ onFileUploaded, fileDetails, onClearFile }: UploadStepProps) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    const fileName = file.name;
    const fileExtension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

    if (fileExtension !== '.json') {
      setError('Formato de archivo no compatible. Solo se permiten archivos .json.');
      return;
    }

    setError('');
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsedData = JSON.parse(text) as JsonModelData;

        // Basic verification of required keys
        if (
          !parsedData.project_info ||
          !parsedData.levels ||
          !parsedData.grids ||
          !parsedData.sections ||
          !parsedData.elements
        ) {
          setError('El archivo JSON no contiene la estructura esperada de un modelo BIM (project_info, levels, grids, sections, elements).');
          return;
        }

        setUploading(true);
        setProgress(0);

        const totalSteps = 20;
        let currentStep = 0;
        const interval = setInterval(() => {
          currentStep++;
          const currentProgress = Math.min((currentStep / totalSteps) * 100, 100);
          setProgress(currentProgress);

          if (currentStep >= totalSteps) {
            clearInterval(interval);
            setUploading(false);
            onFileUploaded({
              name: fileName,
              size: file.size,
              progress: 100,
              isUploaded: true,
              format: 'JSON',
            }, parsedData);
          }
        }, 50);

      } catch (err) {
        setError('Error al decodificar el archivo JSON. Verifique que sea un JSON válido.');
      }
    };

    reader.onerror = () => {
      setError('Error al leer el archivo del sistema.');
    };

    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (uploading) return;
    
    const file = e.dataTransfer.files[0];
    if (file) {
      processFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const triggerFileInput = () => {
    if (uploading || fileDetails) return;
    fileInputRef.current?.click();
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative z-10 w-full max-w-5xl mx-auto select-none">
      <div className="text-center mb-12">
        <h1 className="font-headline text-4xl font-extrabold text-on-surface mb-3 tracking-tight">Cargar archivo</h1>
        <p className="font-body text-on-surface-variant text-lg">
          Arrastra y suelta tu archivo de modelo aquí o haz clic para explorar.
        </p>
      </div>

      {error && (
        <div className="w-full mb-4 p-4 text-sm bg-error-container text-on-error-container rounded-lg border border-error/10 text-center">
          {error}
        </div>
      )}

      {/* Upload Area / Progress Display */}
      {!uploading && !fileDetails ? (
        <div 
          onClick={triggerFileInput}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`w-full bg-surface-container-lowest rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:bg-surface-container-low border border-outline-variant/15 relative group overflow-hidden ${
            isDragOver ? 'ring-2 ring-primary bg-surface-container-low' : ''
          }`} 
          style={{ minHeight: '400px', boxShadow: '0 8px 32px rgba(25, 27, 35, 0.02)' }}
        >
          {/* Inner Tonal Nesting */}
          <div className="absolute inset-4 rounded-lg bg-surface-container pointer-events-none opacity-20 group-hover:opacity-40 transition-opacity"></div>
          
          <div className="bg-primary-fixed/30 p-6 rounded-full mb-6 relative z-10 group-hover:scale-110 transition-transform duration-300 text-primary">
            <UploadFileIcon className="w-12 h-12" />
          </div>
          
          <h3 className="font-headline text-xl font-bold text-on-surface mb-2 relative z-10">
            Seleccionar archivo
          </h3>
          <p className="font-body text-on-surface-variant text-sm mb-8 relative z-10 text-center max-w-md">
            Formatos compatibles: .json. Tamaño máximo recomendado 500MB.
          </p>

          {/* Supported Formats Pills */}
          <div className="flex flex-wrap gap-4 justify-center relative z-10">
            {['.JSON'].map((ext) => (
              <div key={ext} className="px-4 py-2 bg-surface-container-highest rounded-full flex items-center gap-2">
                <span className="font-label text-xs font-semibold text-on-surface-variant tracking-wider uppercase">
                  {ext}
                </span>
              </div>
            ))}
          </div>

          {/* Input file */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept=".json"
          />

          {/* Overlay for Drop state */}
          {isDragOver && (
            <div className="absolute inset-0 bg-primary/5 flex items-center justify-center z-20 border-2 border-dashed border-primary rounded-xl">
              <span className="font-headline text-primary font-bold text-xl">Suelte el archivo aquí</span>
            </div>
          )}
        </div>
      ) : (
        /* Progress / File Details Card */
        <div 
          className="w-full bg-surface-container-lowest rounded-xl p-12 flex flex-col items-center justify-center border border-outline-variant/15 relative" 
          style={{ minHeight: '400px', boxShadow: '0 8px 32px rgba(25, 27, 35, 0.02)' }}
        >
          <div className="absolute inset-4 rounded-lg bg-surface-container pointer-events-none opacity-10"></div>
          
          <div className="w-full max-w-lg relative z-10 flex flex-col items-center">
            {uploading ? (
              <div className="bg-primary-fixed/20 p-6 rounded-full mb-6 text-primary animate-spin">
                <SyncIcon className="w-12 h-12" />
              </div>
            ) : (
              <div className="bg-primary-fixed/30 p-6 rounded-full mb-6 text-primary">
                <CheckCircleIcon className="w-12 h-12" />
              </div>
            )}

            <h3 className="font-headline text-xl font-bold text-on-surface mb-1 text-center truncate max-w-full">
              {uploading ? 'Cargando archivo...' : fileDetails?.name}
            </h3>
            
            <p className="font-body text-on-surface-variant text-sm mb-8">
              {uploading ? `Progreso: ${Math.round(progress)}%` : formatBytes(fileDetails?.size || 0)}
            </p>

            {/* Progress Bar Container */}
            <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden mb-6">
              <div 
                className="btn-primary-gradient h-full rounded-full transition-all duration-300"
                style={{ width: `${uploading ? progress : 100}%` }}
              ></div>
            </div>

            {!uploading && (
              <button 
                onClick={onClearFile}
                className="px-6 py-2.5 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant font-label text-sm font-semibold rounded-md transition-colors hover:text-on-surface"
              >
                Eliminar y cargar otro
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
