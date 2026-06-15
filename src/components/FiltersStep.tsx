import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import type { FiltersState, FileDetails, JsonModelData } from '../types';
import { 
  ExpandMoreIcon
} from './Icons';
import { ThreeViewport } from './ThreeViewport';

interface FiltersStepProps {
  filters: FiltersState;
  setFilters: Dispatch<SetStateAction<FiltersState>>;
  fileDetails: FileDetails | null;
  modelData: JsonModelData | null;
  thicknessLimits: {
    walls: { min: number; max: number };
    beams: { min: number; max: number };
    slabs: { min: number; max: number };
  };
}

export const FiltersStep = ({ filters, setFilters, fileDetails, modelData, thicknessLimits }: FiltersStepProps) => {

  const handleElementToggle = (key: keyof FiltersState['elements']) => {
    setFilters(prev => ({
      ...prev,
      elements: {
        ...prev.elements,
        [key]: !prev.elements[key]
      }
    }));
  };

  const handleLevelToggle = (id: string) => {
    setFilters(prev => ({
      ...prev,
      levels: prev.levels.map(l => l.id === id ? { ...l, checked: !l.checked } : l)
    }));
  };

  const setAllLevels = (checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      levels: prev.levels.map(l => ({ ...l, checked }))
    }));
  };

  const handleSectionToggle = (type: 'walls' | 'beams' | 'slabs', id: string) => {
    setFilters(prev => ({
      ...prev,
      [type]: (prev[type] as any[]).map((item: any) => 
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    }));
  };

  const setAllSections = (type: 'walls' | 'beams' | 'slabs', checked: boolean) => {
    setFilters(prev => ({
      ...prev,
      [type]: (prev[type] as any[]).map((item: any) => ({ ...item, checked }))
    }));
  };

  const handleThicknessChange = (type: 'walls' | 'beams' | 'slabs', bound: 'min' | 'max', value: number) => {
    setFilters(prev => ({
      ...prev,
      thickness: {
        ...prev.thickness,
        [type]: {
          ...prev.thickness[type],
          [bound]: value
        }
      }
    }));
  };

  const startDrag = (
    type: 'walls' | 'beams' | 'slabs',
    bound: 'min' | 'max',
    e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    const isTouch = 'touches' in e;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startVal = filters.thickness[type][bound];
    const minLimit = thicknessLimits[type].min;
    const maxLimit = thicknessLimits[type].max;
    const range = maxLimit - minLimit;
    if (range <= 0) return;

    const container = (e.currentTarget as HTMLElement).parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    if (width <= 0) return;

    const handleMove = (clientX: number) => {
      const deltaX = clientX - startX;
      const deltaValue = (deltaX / width) * range;
      const rawValue = startVal + deltaValue;

      // Snap to nearest multiple of 50mm
      let newValue = Math.round(rawValue / 50) * 50;

      if (bound === 'min') {
        newValue = Math.max(minLimit, Math.min(filters.thickness[type].max, newValue));
      } else {
        newValue = Math.max(filters.thickness[type].min, Math.min(maxLimit, newValue));
      }

      handleThicknessChange(type, bound, newValue);
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientX);
    };

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length > 0) {
        handleMove(moveEvent.touches[0].clientX);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };

    if (isTouch) {
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    } else {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
  };

  const [localThickness, setLocalThickness] = useState({
    walls: { min: String(filters.thickness.walls.min), max: String(filters.thickness.walls.max) },
    beams: { min: String(filters.thickness.beams.min), max: String(filters.thickness.beams.max) },
    slabs: { min: String(filters.thickness.slabs.min), max: String(filters.thickness.slabs.max) }
  });

  useEffect(() => {
    setLocalThickness({
      walls: { min: String(filters.thickness.walls.min), max: String(filters.thickness.walls.max) },
      beams: { min: String(filters.thickness.beams.min), max: String(filters.thickness.beams.max) },
      slabs: { min: String(filters.thickness.slabs.min), max: String(filters.thickness.slabs.max) }
    });
  }, [filters.thickness]);

  const handleLocalThicknessChange = (type: 'walls' | 'beams' | 'slabs', bound: 'min' | 'max', value: string) => {
    setLocalThickness(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [bound]: value
      }
    }));
  };

  const applyLocalThickness = (type: 'walls' | 'beams' | 'slabs', bound: 'min' | 'max') => {
    const minLimit = thicknessLimits[type].min;
    const maxLimit = thicknessLimits[type].max;
    const rawVal = localThickness[type][bound];

    const parsed = parseInt(rawVal, 10);
    if (isNaN(parsed)) {
      setLocalThickness(prev => ({
        ...prev,
        [type]: {
          ...prev[type],
          [bound]: String(filters.thickness[type][bound])
        }
      }));
      return;
    }

    let clampedValue = parsed;
    if (bound === 'min') {
      clampedValue = Math.max(minLimit, Math.min(filters.thickness[type].max, parsed));
    } else {
      clampedValue = Math.max(filters.thickness[type].min, Math.min(maxLimit, parsed));
    }

    handleThicknessChange(type, bound, clampedValue);
  };

  return (
    <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative z-10 md:pt-0 select-none">
      {/* Left Panel: Sidebar / Filters */}
      <div className="w-full md:w-80 lg:w-96 bg-surface-container-lowest border-r border-surface-container-highest flex flex-col h-full overflow-y-auto">
        <div className="p-6 lg:p-8 flex-1">
          <header className="mb-8">
            <h1 className="font-headline text-2xl font-extrabold tracking-tight text-on-surface mb-2">Filtros</h1>
            <p className="font-body text-sm text-on-surface-variant">Seleccione los elementos y defina rangos paramétricos.</p>
          </header>

          <div className="flex flex-col gap-8">
            {/* Elementos Checkbox Grid */}
            <section>
              <h3 className="font-body text-xs font-bold text-on-surface-variant mb-4 tracking-wider uppercase">Elementos</h3>
              <div className="grid grid-cols-2 gap-3">
                {(Object.keys(filters.elements) as Array<keyof FiltersState['elements']>).map((key) => {
                  const labels: Record<string, string> = {
                    muros: 'Muros',
                    vigas: 'Vigas',
                    losas: 'Losas',
                    grillas: 'Grillas'
                  };
                  return (
                    <label 
                      key={key} 
                      className={`flex items-center gap-3 p-3 rounded-lg border border-outline-variant/50 hover:bg-surface-container-low cursor-pointer transition-colors ${
                        filters.elements[key] ? 'bg-surface-container-low border-primary/20' : ''
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={filters.elements[key]}
                        onChange={() => handleElementToggle(key)}
                        className="w-4 h-4 text-primary bg-surface border-outline-variant rounded-DEFAULT focus:ring-primary focus:ring-2 cursor-pointer"
                      />
                      <span className="font-body text-sm font-medium text-on-surface capitalize">
                        {labels[key] || key}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            <div className="w-full h-px bg-surface-container-highest"></div>

            {/* Expanders Details */}
            <section className="flex flex-col gap-3">
              {/* Niveles Expandable */}
              <details className="group bg-surface border border-outline-variant/40 rounded-xl overflow-hidden" open>
                <summary className="font-body text-sm font-semibold text-on-surface p-4 cursor-pointer select-none flex justify-between items-center hover:bg-surface-container-low transition-colors">
                  <span>Niveles</span>
                  <ExpandMoreIcon className="w-5 h-5 text-on-surface-variant transition-transform group-open:rotate-180" />
                </summary>
                <div className="p-4 pt-0 border-t border-outline-variant/20">
                  <div className="flex justify-between items-center mb-3 pt-3">
                    <button 
                      onClick={() => setAllLevels(true)}
                      className="text-xs font-semibold text-primary hover:text-primary-container transition-colors"
                    >
                      Seleccionar todo
                    </button>
                    <button 
                      onClick={() => setAllLevels(false)}
                      className="text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      Ninguno
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {filters.levels.map((lvl) => (
                      <label key={lvl.id} className="flex items-center gap-3 cursor-pointer p-1">
                        <input 
                          type="checkbox"
                          checked={lvl.checked}
                          onChange={() => handleLevelToggle(lvl.id)}
                          className="w-4 h-4 text-primary bg-surface border-outline-variant rounded-DEFAULT focus:ring-primary focus:ring-2 cursor-pointer"
                        />
                        <span className="text-sm font-body text-on-surface">{lvl.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>

              {/* Secciones Muros Expandable */}
              <details className="group bg-surface border border-outline-variant/40 rounded-xl overflow-hidden">
                <summary className="font-body text-sm font-semibold text-on-surface p-4 cursor-pointer select-none flex justify-between items-center hover:bg-surface-container-low transition-colors">
                  <span>Secciones Muros</span>
                  <ExpandMoreIcon className="w-5 h-5 text-on-surface-variant transition-transform group-open:rotate-180" />
                </summary>
                <div className="p-4 pt-0 border-t border-outline-variant/20">
                  <div className="flex justify-between items-center mb-3 pt-3">
                    <button 
                      onClick={() => setAllSections('walls', true)}
                      className="text-xs font-semibold text-primary hover:text-primary-container transition-colors"
                    >
                      Seleccionar todo
                    </button>
                    <button 
                      onClick={() => setAllSections('walls', false)}
                      className="text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      Ninguno
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {filters.walls.map((wl) => (
                      <label key={wl.id} className="flex items-center gap-3 cursor-pointer p-1">
                        <input 
                          type="checkbox"
                          checked={wl.checked}
                          onChange={() => handleSectionToggle('walls', wl.id)}
                          className="w-4 h-4 text-primary bg-surface border-outline-variant rounded-DEFAULT focus:ring-primary focus:ring-2 cursor-pointer"
                        />
                        <span className="text-sm font-body text-on-surface">{wl.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>

              {/* Secciones Vigas Expandable */}
              <details className="group bg-surface border border-outline-variant/40 rounded-xl overflow-hidden">
                <summary className="font-body text-sm font-semibold text-on-surface p-4 cursor-pointer select-none flex justify-between items-center hover:bg-surface-container-low transition-colors">
                  <span>Secciones Vigas</span>
                  <ExpandMoreIcon className="w-5 h-5 text-on-surface-variant transition-transform group-open:rotate-180" />
                </summary>
                <div className="p-4 pt-0 border-t border-outline-variant/20">
                  <div className="flex justify-between items-center mb-3 pt-3">
                    <button 
                      onClick={() => setAllSections('beams', true)}
                      className="text-xs font-semibold text-primary hover:text-primary-container transition-colors"
                    >
                      Seleccionar todo
                    </button>
                    <button 
                      onClick={() => setAllSections('beams', false)}
                      className="text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      Ninguno
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {filters.beams.map((bm) => (
                      <label key={bm.id} className="flex items-center gap-3 cursor-pointer p-1">
                        <input 
                          type="checkbox"
                          checked={bm.checked}
                          onChange={() => handleSectionToggle('beams', bm.id)}
                          className="w-4 h-4 text-primary bg-surface border-outline-variant rounded-DEFAULT focus:ring-primary focus:ring-2 cursor-pointer"
                        />
                        <span className="text-sm font-body text-on-surface">{bm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>

              {/* Tipos Losas Expandable */}
              <details className="group bg-surface border border-outline-variant/40 rounded-xl overflow-hidden">
                <summary className="font-body text-sm font-semibold text-on-surface p-4 cursor-pointer select-none flex justify-between items-center hover:bg-surface-container-low transition-colors">
                  <span>Tipos Losas</span>
                  <ExpandMoreIcon className="w-5 h-5 text-on-surface-variant transition-transform group-open:rotate-180" />
                </summary>
                <div className="p-4 pt-0 border-t border-outline-variant/20">
                  <div className="flex justify-between items-center mb-3 pt-3">
                    <button 
                      onClick={() => setAllSections('slabs', true)}
                      className="text-xs font-semibold text-primary hover:text-primary-container transition-colors"
                    >
                      Seleccionar todo
                    </button>
                    <button 
                      onClick={() => setAllSections('slabs', false)}
                      className="text-xs font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      Ninguno
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {filters.slabs.map((sb) => (
                      <label key={sb.id} className="flex items-center gap-3 cursor-pointer p-1">
                        <input 
                          type="checkbox"
                          checked={sb.checked}
                          onChange={() => handleSectionToggle('slabs', sb.id)}
                          className="w-4 h-4 text-primary bg-surface border-outline-variant rounded-DEFAULT focus:ring-primary focus:ring-2 cursor-pointer"
                        />
                        <span className="text-sm font-body text-on-surface">{sb.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </details>
            </section>

            <div className="w-full h-px bg-surface-container-highest"></div>

            {/* Range Inputs & Sliders */}
            <section className="flex flex-col gap-6">
              {/* Espesor Muros */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-body text-xs font-bold text-on-surface-variant tracking-wider uppercase">Espesor Muros (mm)</h3>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="number"
                    className="w-20 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm font-body text-on-surface text-center focus:outline-none focus:border-primary"
                    value={localThickness.walls.min}
                    onChange={(e) => handleLocalThicknessChange('walls', 'min', e.target.value)}
                    onBlur={() => applyLocalThickness('walls', 'min')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyLocalThickness('walls', 'min');
                      }
                    }}
                  />
                  <div className="flex-1 h-1 bg-surface-container-high rounded-full relative select-none">
                    {/* Dynamic colored bar */}
                    <div 
                      className="absolute h-full bg-primary rounded-full"
                      style={{
                        left: `${((filters.thickness.walls.min - thicknessLimits.walls.min) / (thicknessLimits.walls.max - thicknessLimits.walls.min || 1)) * 100}%`,
                        right: `${100 - ((filters.thickness.walls.max - thicknessLimits.walls.min) / (thicknessLimits.walls.max - thicknessLimits.walls.min || 1)) * 100}%`
                      }}
                    ></div>
                    {/* Left knob */}
                    <div 
                      className="absolute w-4 h-4 bg-primary rounded-full -mt-1.5 -ml-2 shadow ring-2 ring-surface cursor-pointer hover:scale-110 active:scale-125 transition-transform duration-100"
                      style={{
                        left: `${((filters.thickness.walls.min - thicknessLimits.walls.min) / (thicknessLimits.walls.max - thicknessLimits.walls.min || 1)) * 100}%`
                      }}
                      onMouseDown={(e) => startDrag('walls', 'min', e)}
                      onTouchStart={(e) => startDrag('walls', 'min', e)}
                    ></div>
                    {/* Right knob */}
                    <div 
                      className="absolute w-4 h-4 bg-primary rounded-full -mt-1.5 -mr-2 shadow ring-2 ring-surface cursor-pointer hover:scale-110 active:scale-125 transition-transform duration-100"
                      style={{
                        left: `${((filters.thickness.walls.max - thicknessLimits.walls.min) / (thicknessLimits.walls.max - thicknessLimits.walls.min || 1)) * 100}%`
                      }}
                      onMouseDown={(e) => startDrag('walls', 'max', e)}
                      onTouchStart={(e) => startDrag('walls', 'max', e)}
                    ></div>
                  </div>
                  <input 
                    type="number"
                    className="w-20 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm font-body text-on-surface text-center focus:outline-none focus:border-primary"
                    value={localThickness.walls.max}
                    onChange={(e) => handleLocalThicknessChange('walls', 'max', e.target.value)}
                    onBlur={() => applyLocalThickness('walls', 'max')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyLocalThickness('walls', 'max');
                      }
                    }}
                  />
                </div>
              </div>

              {/* Espesor Vigas */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-body text-xs font-bold text-on-surface-variant tracking-wider uppercase">Espesor Vigas (mm)</h3>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="number"
                    className="w-20 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm font-body text-on-surface text-center focus:outline-none focus:border-primary"
                    value={localThickness.beams.min}
                    onChange={(e) => handleLocalThicknessChange('beams', 'min', e.target.value)}
                    onBlur={() => applyLocalThickness('beams', 'min')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyLocalThickness('beams', 'min');
                      }
                    }}
                  />
                  <div className="flex-1 h-1 bg-surface-container-high rounded-full relative select-none">
                    <div 
                      className="absolute h-full bg-primary rounded-full"
                      style={{
                        left: `${((filters.thickness.beams.min - thicknessLimits.beams.min) / (thicknessLimits.beams.max - thicknessLimits.beams.min || 1)) * 100}%`,
                        right: `${100 - ((filters.thickness.beams.max - thicknessLimits.beams.min) / (thicknessLimits.beams.max - thicknessLimits.beams.min || 1)) * 100}%`
                      }}
                    ></div>
                    <div 
                      className="absolute w-4 h-4 bg-primary rounded-full -mt-1.5 -ml-2 shadow ring-2 ring-surface cursor-pointer hover:scale-110 active:scale-125 transition-transform duration-100"
                      style={{
                        left: `${((filters.thickness.beams.min - thicknessLimits.beams.min) / (thicknessLimits.beams.max - thicknessLimits.beams.min || 1)) * 100}%`
                      }}
                      onMouseDown={(e) => startDrag('beams', 'min', e)}
                      onTouchStart={(e) => startDrag('beams', 'min', e)}
                    ></div>
                    <div 
                      className="absolute w-4 h-4 bg-primary rounded-full -mt-1.5 -mr-2 shadow ring-2 ring-surface cursor-pointer hover:scale-110 active:scale-125 transition-transform duration-100"
                      style={{
                        left: `${((filters.thickness.beams.max - thicknessLimits.beams.min) / (thicknessLimits.beams.max - thicknessLimits.beams.min || 1)) * 100}%`
                      }}
                      onMouseDown={(e) => startDrag('beams', 'max', e)}
                      onTouchStart={(e) => startDrag('beams', 'max', e)}
                    ></div>
                  </div>
                  <input 
                    type="number"
                    className="w-20 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm font-body text-on-surface text-center focus:outline-none focus:border-primary"
                    value={localThickness.beams.max}
                    onChange={(e) => handleLocalThicknessChange('beams', 'max', e.target.value)}
                    onBlur={() => applyLocalThickness('beams', 'max')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyLocalThickness('beams', 'max');
                      }
                    }}
                  />
                </div>
              </div>

              {/* Espesor Losas */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-body text-xs font-bold text-on-surface-variant tracking-wider uppercase">Espesor Losas (mm)</h3>
                </div>
                <div className="flex items-center gap-3">
                  <input 
                    type="number"
                    className="w-20 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm font-body text-on-surface text-center focus:outline-none focus:border-primary"
                    value={localThickness.slabs.min}
                    onChange={(e) => handleLocalThicknessChange('slabs', 'min', e.target.value)}
                    onBlur={() => applyLocalThickness('slabs', 'min')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyLocalThickness('slabs', 'min');
                      }
                    }}
                  />
                  <div className="flex-1 h-1 bg-surface-container-high rounded-full relative select-none">
                    <div 
                      className="absolute h-full bg-primary rounded-full"
                      style={{
                        left: `${((filters.thickness.slabs.min - thicknessLimits.slabs.min) / (thicknessLimits.slabs.max - thicknessLimits.slabs.min || 1)) * 100}%`,
                        right: `${100 - ((filters.thickness.slabs.max - thicknessLimits.slabs.min) / (thicknessLimits.slabs.max - thicknessLimits.slabs.min || 1)) * 100}%`
                      }}
                    ></div>
                    <div 
                      className="absolute w-4 h-4 bg-primary rounded-full -mt-1.5 -ml-2 shadow ring-2 ring-surface cursor-pointer hover:scale-110 active:scale-125 transition-transform duration-100"
                      style={{
                        left: `${((filters.thickness.slabs.min - thicknessLimits.slabs.min) / (thicknessLimits.slabs.max - thicknessLimits.slabs.min || 1)) * 100}%`
                      }}
                      onMouseDown={(e) => startDrag('slabs', 'min', e)}
                      onTouchStart={(e) => startDrag('slabs', 'min', e)}
                    ></div>
                    <div 
                      className="absolute w-4 h-4 bg-primary rounded-full -mt-1.5 -mr-2 shadow ring-2 ring-surface cursor-pointer hover:scale-110 active:scale-125 transition-transform duration-100"
                      style={{
                        left: `${((filters.thickness.slabs.max - thicknessLimits.slabs.min) / (thicknessLimits.slabs.max - thicknessLimits.slabs.min || 1)) * 100}%`
                      }}
                      onMouseDown={(e) => startDrag('slabs', 'max', e)}
                      onTouchStart={(e) => startDrag('slabs', 'max', e)}
                    ></div>
                  </div>
                  <input 
                    type="number"
                    className="w-20 bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-1.5 text-sm font-body text-on-surface text-center focus:outline-none focus:border-primary"
                    value={localThickness.slabs.max}
                    onChange={(e) => handleLocalThicknessChange('slabs', 'max', e.target.value)}
                    onBlur={() => applyLocalThickness('slabs', 'max')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        applyLocalThickness('slabs', 'max');
                      }
                    }}
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Right Panel: Context / 3D Preview Container */}
      <div className="flex-1 bg-surface-dim p-8 relative rounded-tl-2xl overflow-hidden flex flex-col min-h-[350px]">
        <div className="absolute top-8 left-8 z-10 pointer-events-none">
          <h2 className="font-headline text-2xl font-bold text-on-surface mb-1">
            {fileDetails ? fileDetails.name : 'Modelo.json'}
          </h2>
          <p className="font-body text-sm text-on-surface-variant">Vista previa geométrica</p>
        </div>

        {/* Three.js 3D Viewport Area */}
        <div className="flex-1 relative w-full mt-12" style={{ minHeight: '280px' }}>
          <ThreeViewport 
            modelData={modelData}
            filters={filters}
            showGrids={filters.elements.grillas}
            activeStep="filters"
          />
        </div>
      </div>
    </main>
  );
};
