import React, { useState, useMemo, useEffect, useRef } from 'react';
import { FACTORY_PRESETS, HeraPreset } from '../presets/factoryPresets';
import { HeraParameters, DEFAULT_PARAMETERS } from '../types/synth';
import { MidiLearnBadge } from './MidiLearnBadge';
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
  Check,
  X,
  Trash2,
} from 'lucide-react';

declare global {
  interface Window {
    AndroidHost?: {
      saveTextFile?: (filename: string, content: string, mimeType: string) => boolean;
      refreshMidiDevices?: () => void;
    };
  }
}

interface PresetManagerProps {
  currentParams: HeraParameters;
  onSelectPreset: (params: HeraParameters, name: string) => void;
  className?: string;

  // Collapsible ARP & Keyboard sections
  isArpSectionOpen?: boolean;
  isArpEnabled?: boolean;
  onToggleArpSection?: () => void;
  isKeyboardOpen?: boolean;
  onToggleKeyboard?: () => void;

  // MIDI Learn Integration for Preset navigation & Custom Program
  isMidiLearnActive?: boolean;
  selectedLearnAction?: string | null;
  mappedCCPrev?: number | null;
  mappedCCNext?: number | null;
  mappedCCSelect?: number | null;
  channelLabel?: string;
  channelLabelPrev?: string;
  channelLabelNext?: string;
  channelLabelSelect?: string;
  onSelectActionForLearn?: (action: 'prevPreset' | 'nextPreset' | 'selectPreset') => void;
  onUnmapAction?: (action: 'prevPreset' | 'nextPreset' | 'selectPreset') => void;
  onRegisterLoadByIndex?: (fn: (index: number) => void) => void;
  onRegisterPresetNav?: (nav: {
    prev: () => void;
    next: () => void;
    loadByIndex: (index: number) => void;
  }) => void;
}

const LOCAL_STORAGE_KEY = 'hera_custom_presets_v1';

export const PresetManager: React.FC<PresetManagerProps> = ({
  currentParams,
  onSelectPreset,
  className = '',
  isArpSectionOpen = false,
  isArpEnabled = false,
  onToggleArpSection,
  isKeyboardOpen = true,
  onToggleKeyboard,
  isMidiLearnActive = false,
  selectedLearnAction = null,
  mappedCCPrev = null,
  mappedCCNext = null,
  mappedCCSelect = null,
  channelLabel,
  channelLabelPrev,
  channelLabelNext,
  channelLabelSelect,
  onSelectActionForLearn,
  onUnmapAction,
  onRegisterLoadByIndex,
  onRegisterPresetNav,
}) => {
  const [selectedId, setSelectedId] = useState<number>(0);
  const [presetName, setPresetName] = useState<string>(FACTORY_PRESETS[0]?.name || 'Strings 1');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  // Inline Save Preset state (no window.prompt needed)
  const [isSavingCustom, setIsSavingCustom] = useState<boolean>(false);
  const [customSaveName, setCustomSaveName] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [customPresets, setCustomPresets] = useState<HeraPreset[]>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const showTransientStatus = (msg: string) => {
    setStatusMessage(msg);
    window.setTimeout(() => {
      setStatusMessage((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

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
      if (filterCategory === 'user') return p.id >= 56;
      return true;
    });
  }, [allPresets, searchQuery, filterCategory]);

  const loadPreset = (preset: HeraPreset) => {
    setSelectedId(preset.id);
    setPresetName(preset.name);
    onSelectPreset(preset.params as HeraParameters, preset.name);
  };

  const latestPresetStateRef = useRef<{
    selectedId: number;
    allPresets: HeraPreset[];
  }>({
    selectedId,
    allPresets,
  });
  latestPresetStateRef.current = { selectedId, allPresets };

  const handlePrev = () => {
    const { selectedId: curId, allPresets: list } = latestPresetStateRef.current;
    if (list.length === 0) return;
    const currentIndex = list.findIndex((p) => p.id === curId);
    const baseIdx = currentIndex >= 0 ? currentIndex : 0;
    const prevIndex = (baseIdx - 1 + list.length) % list.length;
    loadPreset(list[prevIndex]);
  };

  const handleNext = () => {
    const { selectedId: curId, allPresets: list } = latestPresetStateRef.current;
    if (list.length === 0) return;
    const currentIndex = list.findIndex((p) => p.id === curId);
    const baseIdx = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIdx + 1) % list.length;
    loadPreset(list[nextIndex]);
  };

  const handleLoadByIndex = (programNumber: number) => {
    const { allPresets: list } = latestPresetStateRef.current;
    if (list.length === 0) return;
    const targetIndex = ((programNumber % list.length) + list.length) % list.length;
    if (list[targetIndex]) {
      loadPreset(list[targetIndex]);
    }
  };

  // Register external Program Change & MIDI Action navigation loaders
  useEffect(() => {
    if (onRegisterLoadByIndex) {
      onRegisterLoadByIndex(handleLoadByIndex);
    }
    if (onRegisterPresetNav) {
      onRegisterPresetNav({
        prev: handlePrev,
        next: handleNext,
        loadByIndex: handleLoadByIndex,
      });
    }
  }, [allPresets, onRegisterLoadByIndex, onRegisterPresetNav]);

  const handleOpenSaveCustom = () => {
    setCustomSaveName(`${presetName.replace(/\s*\(Custom\)$/i, '')} (Custom)`);
    setIsSavingCustom(true);
  };

  const handleConfirmSaveCustom = () => {
    const name = customSaveName.trim() || `${presetName} (Custom)`;

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
    setIsSavingCustom(false);
    loadPreset(newPreset);
    showTransientStatus(`Salvo: ${name}`);
  };

  const handleDeleteCustomPreset = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const updated = customPresets.filter((p) => p.id !== id);
    setCustomPresets(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    if (selectedId === id && FACTORY_PRESETS[0]) {
      loadPreset(FACTORY_PRESETS[0]);
    }
  };

  const handleExportXML = () => {
    const safePresetName = presetName.replace(/["<>]/g, '');
    let xml = `<?xml version="1.0" encoding="utf-8"?>\n<PARAMETERS>\n  <PROGRAM name="${safePresetName}"/>\n`;
    for (const [k, v] of Object.entries(currentParams)) {
      xml += `  <PARAM id="${k}" value="${v}"/>\n`;
    }
    xml += `</PARAMETERS>\n`;

    const safeFileName = `${presetName.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Hera_Preset'}.xml`;

    // 1. Native Android Bridge (opens system Save dialog or writes to Downloads)
    if (typeof window !== 'undefined' && window.AndroidHost?.saveTextFile) {
      try {
        const ok = window.AndroidHost.saveTextFile(safeFileName, xml, 'application/xml');
        if (ok) {
          showTransientStatus(`Exportado: ${safeFileName}`);
          return;
        }
      } catch (err) {
        console.warn('AndroidHost.saveTextFile fallback:', err);
      }
    }

    // 2. Standard DOM Blob download (with delayed URL revocation so download completes reliably)
    try {
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = safeFileName;
      document.body.appendChild(a);
      a.click();
      window.setTimeout(() => {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
      }, 2500);
      showTransientStatus(`Download: ${safeFileName}`);
    } catch (err) {
      console.error('Export XML error:', err);
      showTransientStatus('Erro ao exportar XML');
    }
  };

  const parseAndImportPresetContent = (content: string, fallbackFileName: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      showTransientStatus('Arquivo vazio');
      return;
    }

    let extractedName = fallbackFileName.replace(/\.[^/.]+$/, '');
    const parsedParams: Partial<HeraParameters> = {};

    // Support JSON format if user loads a .json preset
    if (trimmed.startsWith('{')) {
      try {
        const jsonObj = JSON.parse(trimmed);
        if (typeof jsonObj.name === 'string' && jsonObj.name.trim()) {
          extractedName = jsonObj.name.trim();
        }
        const sourceParams = jsonObj.params && typeof jsonObj.params === 'object' ? jsonObj.params : jsonObj;
        for (const [k, v] of Object.entries(sourceParams)) {
          if (k in DEFAULT_PARAMETERS) {
            const num = Number(v);
            if (!isNaN(num)) {
              (parsedParams as Record<string, number>)[k] = num;
            }
          }
        }
      } catch {
        showTransientStatus('Arquivo JSON inválido');
        return;
      }
    } else {
      // Parse Roland/Hera XML Preset (<PROGRAM name="..."/> and <PARAM id="..." value="..."/>)
      const nameMatch = trimmed.match(/<PROGRAM[^>]*\bname\s*=\s*["']([^"']*)["']/i);
      if (nameMatch && nameMatch[1].trim()) {
        extractedName = nameMatch[1].trim();
      }

      const paramTagRegex = /<PARAM\b([^>]*)\/?>/gi;
      let tagMatch: RegExpExecArray | null;
      while ((tagMatch = paramTagRegex.exec(trimmed)) !== null) {
        const attrs = tagMatch[1];
        const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
        const valMatch = attrs.match(/\bvalue\s*=\s*["']([^"']+)["']/i);
        if (idMatch && valMatch) {
          const paramKey = idMatch[1];
          const numVal = parseFloat(valMatch[1]);
          if (paramKey in DEFAULT_PARAMETERS && !isNaN(numVal)) {
            (parsedParams as Record<string, number>)[paramKey] = numVal;
          }
        }
      }
    }

    if (Object.keys(parsedParams).length === 0) {
      showTransientStatus('Nenhum parâmetro válido no arquivo');
      return;
    }

    const finalName = extractedName.includes('(Import')
      ? extractedName
      : `${extractedName}`;

    const importedPreset: HeraPreset = {
      id: Date.now(),
      name: finalName,
      params: { ...DEFAULT_PARAMETERS, ...currentParams, ...parsedParams },
    };

    const updated = [...customPresets, importedPreset];
    setCustomPresets(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
    loadPreset(importedPreset);
    showTransientStatus(`Carregado: ${finalName}`);
  };

  const handleImportXML = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        parseAndImportPresetContent(content, file.name);
      }
    };
    reader.onerror = () => {
      showTransientStatus('Erro ao ler arquivo');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Juno-60 Bank and Patch number computation (1-8, 1-7/8)
  const bankNumber = Math.floor(selectedId / 7) + 1;
  const patchNumber = (selectedId % 7) + 1;

  return (
    <div
      className={`flex flex-col bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2.5 shadow-md transition-all ${className}`}
    >
      {/* Top Header Row (Comfortable thickness, BANK/PATCH/PRESET NAME titles above, centered LED digits) */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Authentic Roland 7-Segment LED Bezel Slot Display (Also mappable as Custom Program in MIDI Learn) */}
        <div className="relative flex items-center">
          <MidiLearnBadge
            isMidiLearnActive={isMidiLearnActive}
            isSelectedForLearn={selectedLearnAction === 'selectPreset'}
            mappedCC={mappedCCSelect}
            channelLabel={channelLabelSelect ?? channelLabel}
            onUnmap={() => onUnmapAction?.('selectPreset')}
            positionClass="-top-4 left-1/2 -translate-x-1/2"
          />
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (isMidiLearnActive) {
                onSelectActionForLearn?.('selectPreset');
              } else {
                setIsExpanded(!isExpanded);
              }
            }}
            title={
              isMidiLearnActive
                ? 'Clique para mapear Seleção de Preset Customizada (Custom Program / CC / PC)'
                : 'Clique para expandir/recolher a lista de Presets'
            }
            className={`flex items-center gap-3.5 bg-zinc-950 px-3.5 py-2 rounded-md border shadow-inner cursor-pointer transition-shadow ${
              selectedLearnAction === 'selectPreset'
                ? 'border-sky-400 ring-2 ring-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.65)]'
                : isMidiLearnActive
                ? 'border-zinc-800 ring-1 ring-sky-400/25 hover:ring-sky-400/70'
                : 'border-zinc-800'
            }`}
          >
            {/* BANK Slot */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] font-mono font-bold text-zinc-400 uppercase tracking-widest leading-none">
              BANK
            </span>
            <div className="w-8 h-8 sm:w-9 sm:h-8 flex items-center justify-center bg-[#140204] border border-red-950/90 rounded shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)]">
              <span className="inline-flex items-center justify-center w-full h-full font-mono text-base sm:text-lg font-black text-red-500 leading-none text-center tabular-nums drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]">
                {selectedId < 56 ? String(bankNumber) : 'U'}
              </span>
            </div>
          </div>

          {/* PATCH Slot */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] font-mono font-bold text-zinc-400 uppercase tracking-widest leading-none">
              PATCH
            </span>
            <div className="w-8 h-8 sm:w-9 sm:h-8 flex items-center justify-center bg-[#140204] border border-red-950/90 rounded shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)]">
              <span className="inline-flex items-center justify-center w-full h-full font-mono text-base sm:text-lg font-black text-red-500 leading-none text-center tabular-nums drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]">
                {selectedId < 56 ? String(patchNumber) : String((selectedId % 9) + 1)}
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-9 bg-zinc-800 self-center" />

          {/* PRESET NAME */}
          <div className="flex flex-col justify-center gap-1 pl-0.5 min-w-[130px] sm:min-w-[165px]">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-mono font-bold text-zinc-400 uppercase tracking-wider leading-none">
                PRESET NAME
              </span>
              {statusMessage && (
                <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/50 animate-pulse">
                  {statusMessage}
                </span>
              )}
            </div>
            <div className="h-8 flex items-center">
              <span className="text-sm sm:text-base font-mono font-extrabold text-amber-400 tracking-wide truncate max-w-[160px] sm:max-w-[220px] leading-none drop-shadow-[0_0_6px_rgba(245,158,11,0.35)]">
                {presetName}
              </span>
            </div>
          </div>
          </div>
        </div>

        {/* Inline Save Input Bar when saving a custom preset */}
        {isSavingCustom && (
          <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-amber-500/60 shadow-inner">
            <input
              type="text"
              autoFocus
              value={customSaveName}
              onChange={(e) => setCustomSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirmSaveCustom();
                } else if (e.key === 'Escape') {
                  setIsSavingCustom(false);
                }
              }}
              placeholder="Nome do preset..."
              className="w-32 sm:w-40 bg-zinc-900 text-amber-300 px-2 py-0.5 rounded border border-zinc-700 text-xs font-mono focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={handleConfirmSaveCustom}
              className="p-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded cursor-pointer"
              title="Confirmar salvamento"
            >
              <Check size={13} />
            </button>
            <button
              type="button"
              onClick={() => setIsSavingCustom(false)}
              className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded cursor-pointer"
              title="Cancelar"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Action Controls & Navigation */}
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {/* Previous Preset Button (Mappable via MIDI) */}
          <div className="relative flex flex-col items-center">
            <MidiLearnBadge
              isMidiLearnActive={isMidiLearnActive}
              isSelectedForLearn={selectedLearnAction === 'prevPreset'}
              mappedCC={mappedCCPrev}
              channelLabel={channelLabelPrev ?? channelLabel}
              onUnmap={() => onUnmapAction?.('prevPreset')}
              positionClass="-top-5 left-1/2 -translate-x-1/2"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isMidiLearnActive) {
                  onSelectActionForLearn?.('prevPreset');
                } else {
                  handlePrev();
                }
              }}
              className={`p-1.5 rounded border transition-shadow cursor-pointer shadow-sm ${
                selectedLearnAction === 'prevPreset'
                  ? 'bg-sky-600/30 text-white border-sky-400 ring-2 ring-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.65)]'
                  : isMidiLearnActive
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700 ring-1 ring-sky-400/25 hover:ring-sky-400/70'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700 active:bg-zinc-900'
              }`}
              title="Preset Anterior (Program Change / MIDI CC)"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Next Preset Button (Mappable via MIDI) */}
          <div className="relative flex flex-col items-center">
            <MidiLearnBadge
              isMidiLearnActive={isMidiLearnActive}
              isSelectedForLearn={selectedLearnAction === 'nextPreset'}
              mappedCC={mappedCCNext}
              channelLabel={channelLabelNext ?? channelLabel}
              onUnmap={() => onUnmapAction?.('nextPreset')}
              positionClass="-top-5 left-1/2 -translate-x-1/2"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isMidiLearnActive) {
                  onSelectActionForLearn?.('nextPreset');
                } else {
                  handleNext();
                }
              }}
              className={`p-1.5 rounded border transition-shadow cursor-pointer shadow-sm ${
                selectedLearnAction === 'nextPreset'
                  ? 'bg-sky-600/30 text-white border-sky-400 ring-2 ring-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.65)]'
                  : isMidiLearnActive
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700 ring-1 ring-sky-400/25 hover:ring-sky-400/70'
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
            onClick={handleOpenSaveCustom}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-amber-400 rounded border border-zinc-700 shadow-sm cursor-pointer"
            title="Salvar Preset Customizado"
          >
            <Save size={13} />
            <span className="hidden sm:inline">Save</span>
          </button>

          {/* XML Export (Download) */}
          <button
            type="button"
            onClick={handleExportXML}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-xs font-mono text-zinc-200 rounded border border-zinc-700 shadow-sm cursor-pointer"
            title="Baixar / Exportar Preset atual em arquivo .XML"
          >
            <Download size={13} className="text-emerald-400" />
            <span className="hidden sm:inline">XML</span>
          </button>

          {/* XML Import (Upload) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-xs font-mono text-zinc-200 rounded border border-zinc-700 shadow-sm cursor-pointer"
            title="Carregar / Importar Preset de arquivo .XML"
          >
            <Upload size={13} className="text-sky-400" />
            <span className="hidden sm:inline">Load</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,text/xml,application/xml,.json,*/*"
            className="hidden"
            onChange={handleImportXML}
          />

          {/* Expand / Collapse Preset Grid Button */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded text-xs font-mono font-bold cursor-pointer transition-colors shadow-sm"
            title={isExpanded ? 'Recolher grade de presets' : 'Expandir todos os presets e busca'}
          >
            <ListFilter size={13} />
            <span>{isExpanded ? 'RECOLHER' : `PRESETS (${allPresets.length})`}</span>
            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {/* Expand / Collapse ARP Section Button */}
          {onToggleArpSection && (
            <button
              type="button"
              onClick={onToggleArpSection}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono font-bold cursor-pointer transition-colors border shadow-sm ${
                isArpEnabled || isArpSectionOpen
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/50'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              }`}
              title={isArpSectionOpen ? 'Recolher seção Arpejador' : 'Abrir seção Arpejador'}
            >
              {isArpEnabled && (
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
              )}
              <span>ARP</span>
              {isArpSectionOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {/* Expand / Collapse Keyboard Section Button */}
          {onToggleKeyboard && (
            <button
              type="button"
              onClick={onToggleKeyboard}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-mono font-bold cursor-pointer transition-colors border shadow-sm ${
                isKeyboardOpen
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border-amber-500/50'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              }`}
              title={isKeyboardOpen ? 'Recolher teclado virtual' : 'Abrir teclado virtual'}
            >
              <span>TECLADO</span>
              {isKeyboardOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Presets Drawer (Search + Category Filter + Preset Grid) */}
      {isExpanded && (
        <div className="mt-2.5 pt-2 border-t border-zinc-800 flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Search bar & Category filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative flex-1 min-w-[130px]">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar entre os presets do Juno-60..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700/80 rounded pl-6 pr-2 py-1 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto text-[9px] font-mono">
              {['all', 'user', 'strings', 'organ', 'brass', 'bass', 'piano'].map((cat) => (
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
                  {cat === 'user' ? `USER (${customPresets.length})` : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Select Grid */}
          <div className="max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-1 p-1.5 bg-zinc-950 rounded border border-zinc-800 scrollbar-thin">
            {filteredPresets.map((preset) => {
              const isCustom = preset.id >= 56;
              return (
                <div
                  key={preset.id}
                  onClick={() => loadPreset(preset)}
                  className={`group flex items-center justify-between px-2 py-1.5 text-left text-[10px] font-mono rounded border transition-colors cursor-pointer ${
                    selectedId === preset.id
                      ? 'bg-amber-400/20 border-amber-400 text-amber-300 font-bold shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <span className="truncate">{preset.name}</span>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCustomPreset(e, preset.id)}
                      className="text-zinc-500 hover:text-red-400 ml-1 flex-shrink-0 cursor-pointer"
                      title="Excluir preset customizado"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
