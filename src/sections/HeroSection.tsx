import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Sparkles, Square } from 'lucide-react';
import { ContactButton } from '../components/ContactButton';
import { LivingPortrait } from '../components/LivingPortrait';
import { DEFAULT_CHARACTER_NAME } from '../utils/character';

interface HeroSectionProps {
  characterName: string;
  onConceptClick: () => void;
  onOpenSettings: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  characterName,
  onConceptClick,
  onOpenSettings,
}) => {
  const displayName = characterName.trim() || DEFAULT_CHARACTER_NAME;
  const titleText = `HI, I'M ${displayName.toUpperCase()}`;

  // Dynamically calculate font size so ANY name strictly fits in ONE single line
  const charLength = Math.max(titleText.length, 11);
  const dynamicVw = Math.min(17.6, Math.max(7.2, 186 / charLength));

  // The engine plays every idle act back to back while "show mode" is on
  const [showOn, setShowOn] = useState(false);
  useEffect(() => {
    const onShow = (e: Event) => setShowOn(Boolean((e as CustomEvent<{ on: boolean }>).detail?.on));
    window.addEventListener('livingshow', onShow);
    return () => window.removeEventListener('livingshow', onShow);
  }, []);

  return (
    <section className="relative w-full h-screen h-[100dvh] flex flex-col justify-between overflow-hidden bg-[#0C0C0C] select-none">
      {/* Top Left: play every expression and idle act back to back */}
      <div className="absolute top-4 left-4 sm:top-6 sm:left-7 md:top-8 md:left-10 z-40">
        <button
          type="button"
          onClick={() => window.toggleLivingShow?.()}
          aria-pressed={showOn}
          aria-label={showOn ? 'Stop the show' : 'Show me everything'}
          className="group flex items-center gap-2 px-3.5 sm:px-4 py-3 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 hover:border-white text-zinc-300 hover:text-white text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 shadow-xl shadow-black/80 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
        >
          {showOn ? <Square className="w-4 h-4 fill-current" /> : <Sparkles className="w-4 h-4" />}
          <span className="hidden sm:inline">{showOn ? 'Stop the show' : 'Show me everything'}</span>
        </button>
      </div>
      {/* Top Right Gear Button */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-7 md:top-8 md:right-10 z-40">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Character Studio & Settings"
          className="group relative p-3 sm:p-3.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700 hover:border-white text-zinc-300 hover:text-white transition-all duration-200 shadow-xl shadow-black/80 hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
        >
          <Settings className="w-5 h-5 sm:w-5 sm:h-5 text-zinc-300 group-hover:text-white group-hover:rotate-45 transition-transform duration-300" />
          <span className="sr-only">Settings</span>
          {/* Subtle monochrome tooltip */}
          <span className="absolute -bottom-9 right-0 px-2.5 py-1 rounded-md bg-zinc-950 text-[10px] font-medium uppercase tracking-wider text-zinc-300 border border-zinc-800 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 shadow-lg shadow-black">
            Studio &amp; Settings
          </span>
        </button>
      </div>

      {/* 1. Single-Line Guaranteed Hero Heading across the top */}
      <div className="w-full overflow-hidden text-center z-0 pt-3 sm:pt-4 md:pt-6 pointer-events-none px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full flex items-center justify-center overflow-hidden"
        >
          <h1
            style={{
              fontSize: `min(${dynamicVw}vw, 21vh)`,
            }}
            className="hero-heading font-black uppercase tracking-tight leading-none whitespace-nowrap text-center transition-all duration-200"
          >
            {titleText}
          </h1>
        </motion.div>
      </div>

      {/* 2. Hero Portrait (Living Portrait perfectly centered) */}
      <LivingPortrait characterName={displayName} />

      {/* 3. Bottom bar */}
      <div className="w-full flex justify-between items-end px-5 sm:px-8 md:px-12 pb-6 sm:pb-8 md:pb-10 z-20 gap-4">
        {/* Left concept line: Single-line showcase of what this app is about */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="text-[#D7E2EA] font-medium uppercase tracking-wider text-[11px] sm:text-xs md:text-sm whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-2 max-w-[62vw] sm:max-w-none"
        >
          <span className="bg-white text-black px-2 py-0.5 rounded font-bold shadow-sm shrink-0 tracking-wider">
            LIVING 3D PORTRAIT
          </span>
          <span className="hidden sm:inline text-zinc-300 truncate">
            INTERACTIVE AI CHARACTER POWERED BY GENERATIVE EXPRESSIONS &amp; REAL-TIME PHYSICS
          </span>
          <span className="sm:hidden text-zinc-300 truncate">
            AI LIVING PORTRAIT &amp; PHYSICS
          </span>
        </motion.div>

        {/* Right: Concept by Shahnab button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="shrink-0"
        >
          <ContactButton onClick={onConceptClick} />
        </motion.div>
      </div>
    </section>
  );
};
