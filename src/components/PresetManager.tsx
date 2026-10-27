import React, { useState, useMemo } from 'react';
import { FACTORY_PRESETS, HeraPreset } from '../presets/factoryPresets';
import { HeraParameters } from '../types/synth';
import { ChevronLeft, ChevronRight, Save, Download, Upload, RotateCcw, Search } from 'lucide-react';

interface PresetManagerProps {
  currentParams: HeraParameters;
  onSelectPreset: (params: HeraParameters, name: string) => void;
  className?: string;
}

const LOCAL_STORAGE_KEY = 'hera_custom_presets_v1';

export const PresetManager: React.FC<PresetManagerProps> = ({
  currentParams,
  onSelectPreset,
  className = '',
}) => {
  const [selectedId, setSelectedId] = useState<number>(0);
  const [presetName, setPresetName] = useState<string>(FACTORY_PRESETS[0]?.name || 'Strings 1');
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
      if (filterCategory === 'piano') return lower.includes('piano') || lower.includes('clav') || lower.includes('harp');
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

  const handleSaveCustom = () => {
    const name = window.prompt('Enter preset name:', `${presetName} (Custom)`);
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
      // storage full or disabled
    }
    loadPreset(newPreset);
  };

  const handleExportXML = () => {
    // Generate authentic Hera XML preset format
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
    <div className={`flex flex-col gap-2 bg-zinc-900 border border-zinc-700/80 rounded p-2.5 shadow-md ${className}`}>
      {/* Top Bar: Juno Digital LED Display & Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* LED Digital Display */}
        <div className="flex items-center gap-2 bg-black px-3 py-1.5 rounded border border-red-950 shadow-inner">
          <div className="flex flex-col items-center">
            <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest">Bank</span>
            <span className="text-xl font-mono font-black text-red-500 tracking-wider shadow-[0_0_8px_#ef4444]">
              {selectedId < 56 ? String(bankNumber) : 'U'}
            </span>
          </div>
          <div className="w-[1px] h-6 bg-red-900/40" />
          <div className="flex flex-col items-center">
            <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest">Patch</span>
            <span className="text-xl font-mono font-black text-red-500 tracking-wider shadow-[0_0_8px_#ef4444]">
              {selectedId < 56 ? String(patchNumber) : String((selectedId % 9) + 1)}
            </span>
          </div>
          <div className="w-[1px] h-6 bg-red-900/40" />
          <div className="flex flex-col pl-1">
            <span className="text-[7px] font-mono text-zinc-500 uppercase tracking-widest">Preset Name</span>
            <span className="text-sm font-mono font-bold text-amber-400 tracking-wide truncate max-w-[170px]">
              {presetName}
            </span>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrev}
            className="flex items-center justify-center p-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-200 rounded border border-zinc-600 shadow cursor-pointer transition-colors"
            title="Previous Preset"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="flex items-center justify-center p-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 text-zinc-200 rounded border border-zinc-600 shadow cursor-pointer transition-colors"
            title="Next Preset"
          >
            <ChevronRight size={16} />
          </button>

          {/* Action buttons */}
          <button
            type="button"
            onClick={handleSaveCustom}
            className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-amber-400 rounded border border-zinc-600 shadow cursor-pointer"
            title="Save custom preset"
          >
            <Save size={13} />
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            type="button"
            onClick={handleExportXML}
            className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 rounded border border-zinc-600 shadow cursor-pointer"
            title="Export preset to XML"
          >
            <Download size={13} />
            <span className="hidden sm:inline">XML</span>
          </button>
          <label className="flex items-center gap-1 px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-300 rounded border border-zinc-600 shadow cursor-pointer">
            <Upload size={13} />
            <span className="hidden sm:inline">Load</span>
            <input
              type="file"
              accept=".xml"
              className="hidden"
              onChange={handleImportXML}
            />
          </label>
        </div>
      </div>

      {/* Preset Category Filters & Search */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-zinc-800">
        <div className="relative flex-1 min-w-[130px]">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search 56 presets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700/80 rounded pl-6 pr-2 py-0.5 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto text-[9px] font-mono">
          {['all', 'strings', 'organ', 'brass', 'bass', 'piano'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`px-1.5 py-0.5 rounded uppercase font-bold cursor-pointer transition-colors ${
                filterCategory === cat
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Quick Select Grid (Scrollable preset picker) */}
      <div className="max-h-24 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1 p-1 bg-zinc-950/70 rounded border border-zinc-800">
        {filteredPresets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => loadPreset(preset)}
            className={`px-1.5 py-1 text-left text-[10px] font-mono truncate rounded border transition-colors cursor-pointer ${
              selectedId === preset.id
                ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold'
                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
};
