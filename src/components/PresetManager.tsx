import React, { useState, useMemo, useEffect } from 'react';
import { FACTORY_PRESETS, HeraPreset } from '../presets/factoryPresets';
import { HeraParameters } from '../types/synth';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Download,
  Upload,
  Search,
  ListFilter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface PresetManagerProps {
  currentParams: HeraParameters;
  onSelectPreset: (params: HeraParameters, name: string) => void;
  className?: string;

  // MIDI Learn Integration for Preset navigation
  isMidiLearnActive?: boolean;
  selectedLearnAction?: string | null;
  mappedCCPrev?: number | null;
  mappedCCNext?: number | null;
  onSelectActionForLearn?: (action: 'prevPreset' | 'nextPreset') => void;
  onUnmapAction?: (action: 'prevPreset' | 'nextPreset') => void;
  onRegisterLoadByIndex?: (fn: (index: number) => void) => void;
}

const LOCAL_STORAGE_KEY = 'hera_custom_presets_v1';

export const PresetManager: React.FC<PresetManagerProps> = ({
  currentParams,
  onSelectPreset,
  className = '',
  isMidiLearnActive = false,
  selectedLearnAction = null,
  mappedCCPrev = null,
  mappedCCNext = null,
  onSelectActionForLearn,
  onUnmapAction,
  onRegisterLoadByIndex,
}) => {
  const [selectedId, setSelectedId] = useState<number>(0);
  const [presetName, setPresetName] = useState<string>(FACTORY_PRESETS[0]?.name || 'Strings 1');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [customPresets, setCustomPresets] = useState<HeraPreset[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const allPresets = useMemo(() => {
    return [...FACTORY_PRESETS, ...customPresets];
  }, [customPresets]);

  const filteredPresets = useMemo(() => {
    return allPresets.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (filterCategory === 'all') return true;
      const lower = p.name.toLowerCase();
      if (filterCategory === 'strings') return lower.includes('string');
      if (filterCategory === 'organ') return lower.includes('organ');
      if (filterCategory === 'brass') return lower.includes('brass');
      if (filterCategory === 'bass') return lower.includes('bass');
      if (filterCategory === 'piano')
        return lower.includes('piano') || lower.includes('clav') || lower.includes('harp');
      return true;
    });
  }, [allPresets, searchQuery, filterCategory]);

  const loadPreset = (preset: HeraPreset) => {
    setSelectedId(preset.id);
    setPresetName(preset.name);
    onSelectPreset(preset.params as HeraParameters, preset.name);
  };

  const handlePrev = () => {
    const currentIndex = allPresets.findIndex((p) => p.id === selectedId);
    const prevIndex = (currentIndex - 1 + allPresets.length) % allPresets.length;
    loadPreset(allPresets[prevIndex]);
  };

  const handleNext = () => {
    const currentIndex = allPresets.findIndex((p) => p.id === selectedId);
    const nextIndex = (currentIndex + 1) % allPresets.length;
    loadPreset(allPresets[nextIndex]);
  };

  // Register external Program Change loader
  useEffect(() => {
    if (onRegisterLoadByIndex) {
      onRegisterLoadByIndex((programNumber: number) => {
        const targetIndex = programNumber % allPresets.length;
        if (allPresets[targetIndex]) {
          loadPreset(allPresets[targetIndex]);
        }
      });
    }
  }, [allPresets, onRegisterLoadByIndex]);

  const handleSaveCustom = () => {
    const name = window.prompt('Nome do novo Preset:', `${presetName} (Custom)`);
    if (!name) return;

    const newPreset: HeraPreset = {
      id: Date.now(),
      name,
      params: { ...currentParams },
    };

    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // storage full
    }
    loadPreset(newPreset);
  };

  const handleExportXML = () => {
    let xml = `<?xml version='1.0' encoding='utf-8'?>\n<PARAMETERS><PROGRAM name="${presetName}"/>`;
    for (const [k, v] of Object.entries(currentParams)) {
      xml += `<PARAM id="${k}" value="${v}"/>`;
    }
    xml += `</PARAMETERS>\n`;

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presetName.replace(/\s+/g, '_')}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportXML = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const nameMatch = content.match(/<PROGRAM name="([^"]*)"\/>/);
      const name = nameMatch ? nameMatch[1] : file.name.replace(/\.[^/.]+$/, '');
      const params: Partial<HeraParameters> = {};
      const regex = /<PARAM id="([^"]+)" value="([^"]+)"\/>/g;
      let m;
      while ((m = regex.exec(content)) !== null) {
        (params as Record<string, number>)[m[1]] = parseFloat(m[2]);
      }

      const importedPreset: HeraPreset = {
        id: Date.now(),
        name: `${name} (Imported)`,
        params: { ...currentParams, ...params },
      };

      const updated = [...customPresets, importedPreset];
      setCustomPresets(updated);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      loadPreset(importedPreset);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Juno-60 Bank and Patch number computation (1-8, 1-7/8)
  const bankNumber = Math.floor(selectedId / 7) + 1;
  const patchNumber = (selectedId % 7) + 1;

  return (
    <div
      className={`flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-lg p-2 shadow-md transition-all ${className}`}
    >
      {/* Top Header Row (Always visible, ultra-compact) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Retrworked Authentic Roland 7-Segment LED Bezel Slot Display */}
        <div className="flex items-center gap-2.5 bg-zinc-950 px-2.5 py-1 rounded-md border border-zinc-800 shadow-inner">
          {/* BANK Slot */}
          <div className="flex flex-col items-center">
            <span className="text-[7.5px] font-mono font-bold text-zinc-400 uppercase tracking-widest leading-none mb-0.5">
              BANK
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-[#100103] border border-red-950/80 rounded shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)]">
              <span className="font-mono text-lg sm:text-xl font-black text-red-500 tracking-tight drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]">
                {selectedId < 56 ? String(bankNumber) : 'U'}
              </span>
            </div>
          </div>

          {/* PATCH Slot */}
          <div className="flex flex-col items-center">
            <span className="text-[7.5px] font-mono font-bold text-zinc-400 uppercase tracking-widest leading-none mb-0.5">
              PATCH
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-[#100103] border border-red-950/80 rounded shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)]">
              <span className="font-mono text-lg sm:text-xl font-black text-red-500 tracking-tight drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]">
                {selectedId < 56 ? String(patchNumber) : String((selectedId % 9) + 1)}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-7 bg-zinc-800 self-center" />

          {/* PRESET NAME */}
          <div className="flex flex-col justify-center pl-0.5">
            <span className="text-[7.5px] font-mono font-bold text-zinc-400 uppercase tracking-wider leading-none mb-0.5">
              PRESET NAME
            </span>
            <span className="text-xs sm:text-sm font-mono font-bold text-amber-400 tracking-wide truncate max-w-[150px] sm:max-w-[200px] drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]">
              {presetName}
            </span>
          </div>
        </div>

        {/* Action Controls & Navigation */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Previous Preset Button (Mappable via MIDI) */}
          <div className="relative flex flex-col items-center">
            {isMidiLearnActive && (
              <div className="absolute -top-6 flex items-center justify-center min-h-[16px] z-30">
                {mappedCCPrev !== null && mappedCCPrev !== undefined ? (
                  <div className="inline-flex items-center gap-1 bg-[#0284c7] text-white text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full border border-[#38bdf8] shadow select-none">
                    <span>CC {mappedCCPrev}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnmapAction?.('prevPreset');
                      }}
                      className="text-white hover:text-red-300 font-bold text-[9px] cursor-pointer"
                      title="Desmapear CC Prev"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectActionForLearn?.('prevPreset');
                    }}
                    className={`rounded-full px-1.5 py-0.2 text-[7.5px] font-mono font-bold cursor-pointer transition-all ${
                      selectedLearnAction === 'prevPreset'
                        ? 'bg-[#0284c7] text-white border border-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.7)]'
                        : 'bg-zinc-950 text-sky-400 border border-sky-400/40 hover:text-white'
                    }`}
                  >
                    {selectedLearnAction === 'prevPreset' ? 'AURÉOLA' : '+ LEARN'}
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (isMidiLearnActive) {
                  onSelectActionForLearn?.('prevPreset');
                } else {
                  handlePrev();
                }
              }}
              className={`p-1.5 rounded border transition-colors cursor-pointer shadow-sm ${
                selectedLearnAction === 'prevPreset'
                  ? 'bg-sky-600 text-white border-sky-400 ring-2 ring-sky-400'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700 active:bg-zinc-900'
              }`}
              title="Preset Anterior (Program Change / MIDI CC)"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Next Preset Button (Mappable via MIDI) */}
          <div className="relative flex flex-col items-center">
            {isMidiLearnActive && (
              <div className="absolute -top-6 flex items-center justify-center min-h-[16px] z-30">
                {mappedCCNext !== null && mappedCCNext !== undefined ? (
                  <div className="inline-flex items-center gap-1 bg-[#0284c7] text-white text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full border border-[#38bdf8] shadow select-none">
                    <span>CC {mappedCCNext}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnmapAction?.('nextPreset');
                      }}
                      className="text-white hover:text-red-300 font-bold text-[9px] cursor-pointer"
                      title="Desmapear CC Next"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectActionForLearn?.('nextPreset');
                    }}
                    className={`rounded-full px-1.5 py-0.2 text-[7.5px] font-mono font-bold cursor-pointer transition-all ${
                      selectedLearnAction === 'nextPreset'
                        ? 'bg-[#0284c7] text-white border border-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.7)]'
                        : 'bg-zinc-950 text-sky-400 border border-sky-400/40 hover:text-white'
                    }`}
                  >
                    {selectedLearnAction === 'nextPreset' ? 'AURÉOLA' : '+ LEARN'}
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                if (isMidiLearnActive) {
                  onSelectActionForLearn?.('nextPreset');
                } else {
                  handleNext();
                }
              }}
              className={`p-1.5 rounded border transition-colors cursor-pointer shadow-sm ${
                selectedLearnAction === 'nextPreset'
                  ? 'bg-sky-600 text-white border-sky-400 ring-2 ring-sky-400'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700 active:bg-zinc-900'
              }`}
              title="Próximo Preset (Program Change / MIDI CC)"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSaveCustom}
            className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-amber-400 rounded border border-zinc-700 shadow-sm cursor-pointer"
            title="Salvar Preset Customizado"
          >
            <Save size={13} />
            <span className="hidden sm:inline">Save</span>
          </button>

          {/* XML Export */}
          <button
            type="button"
            onClick={handleExportXML}
            className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 rounded border border-zinc-700 shadow-sm cursor-pointer"
            title="Exportar Preset em XML Roland"
          >
            <Download size={13} />
            <span className="hidden sm:inline">XML</span>
          </button>

          {/* XML Import */}
          <label className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 rounded border border-zinc-700 shadow-sm cursor-pointer">
            <Upload size={13} />
            <span className="hidden sm:inline">Load</span>
            <input type="file" accept=".xml" className="hidden" onChange={handleImportXML} />
          </label>

          {/* Expand / Collapse Preset Grid Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded text-xs font-mono font-bold cursor-pointer transition-colors shadow-sm"
            title={isExpanded ? 'Recolher grade de presets' : 'Expandir todos os 56 presets e busca'}
          >
            <ListFilter size={13} />
            <span>{isExpanded ? 'RECOLHER' : 'PRESETS (56)'}</span>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {/* Collapsible Presets Drawer (Search + Category Filter + 56-Preset Grid) */}
      {isExpanded && (
        <div className="mt-2.5 pt-2 border-t border-zinc-800 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search bar & Category filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative flex-1 min-w-[130px]">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar entre os 56 presets do Juno-60..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded pl-6 pr-2 py-1 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto text-[9px] font-mono">
              {['all', 'strings', 'organ', 'brass', 'bass', 'piano'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`px-2 py-1 rounded uppercase font-bold cursor-pointer transition-colors ${
                    filterCategory === cat
                      ? 'bg-amber-400 text-black shadow-sm font-black'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Select Grid (56 presets) */}
          <div className="max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1 p-1.5 bg-zinc-950 rounded border border-zinc-800 scrollbar-thin">
            {filteredPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => loadPreset(preset)}
                className={`px-2 py-1.5 text-left text-[10px] font-mono truncate rounded border transition-colors cursor-pointer ${
                  selectedId === preset.id
                    ? 'bg-amber-400/20 border-amber-400 text-amber-300 font-bold shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
