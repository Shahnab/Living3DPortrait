import React, { useState } from 'react';
import { HeroSection } from './sections/HeroSection';
import { ConceptModal } from './components/ConceptModal';
import { SettingsModal } from './components/SettingsModal';
import { ExpressionMap, LAYOUT_KEY } from './utils/expressionSynthesizer';
import { loadImage } from './utils/faceIsolation';

declare global {
  interface Window {
    applyCustomTexturePack?: (pack: Record<string, HTMLImageElement | HTMLCanvasElement>, layout?: unknown) => void;
    resetToDefaultMina?: () => void;
    toggleLivingShow?: () => boolean;
  }
}

export default function App() {
  const [characterName, setCharacterName] = useState<string>(() => {
    return localStorage.getItem('character_name') || 'Mina';
  });
  const [isConceptOpen, setIsConceptOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Keep localStorage in sync with characterName
  const handleUpdateCharacterName = (newName: string) => {
    setCharacterName(newName);
    localStorage.setItem('character_name', newName);
  };

  // Apply custom generated texture pack to the live WebGL engine
  const handleApplyCustomPack = async (pack: ExpressionMap) => {
    try {
      const loadedPack: Record<string, HTMLImageElement> = {};
      const entries = Object.entries(pack).filter(([key]) => key !== LAYOUT_KEY);
      let layout: unknown;
      try {
        layout = pack[LAYOUT_KEY] ? JSON.parse(pack[LAYOUT_KEY]) : undefined;
      } catch {
        layout = undefined;
      }

      await Promise.all(
        entries.map(async ([key, dataUrl]) => {
          if (dataUrl) {
            const img = await loadImage(dataUrl);
            loadedPack[key] = img;
          }
        })
      );

      if (typeof window.applyCustomTexturePack === 'function') {
        window.applyCustomTexturePack(loadedPack, layout);
      }
    } catch (err) {
      console.error('Failed to load custom textures into WebGL:', err);
    }
  };

  // Reset character to default Mina
  const handleResetDefault = () => {
    if (typeof window.resetToDefaultMina === 'function') {
      window.resetToDefaultMina();
    }
    handleUpdateCharacterName('Mina');
  };

  return (
    <main className="relative w-screen h-screen h-[100dvh] bg-[#0C0C0C] text-[#D7E2EA] overflow-hidden select-none">
      {/* Above-the-fold Hero Section with centered Living Portrait */}
      <HeroSection
        characterName={characterName}
        onConceptClick={() => setIsConceptOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Concept by Shahnab Modal */}
      <ConceptModal
        isOpen={isConceptOpen}
        onClose={() => setIsConceptOpen(false)}
      />

      {/* Character Studio & Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        characterName={characterName}
        onUpdateCharacterName={handleUpdateCharacterName}
        onApplyCustomPack={handleApplyCustomPack}
        onResetDefault={handleResetDefault}
      />
    </main>
  );
}
