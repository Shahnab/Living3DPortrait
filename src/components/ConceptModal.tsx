import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Cpu, Eye, Waves } from 'lucide-react';

interface ConceptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConceptModal: React.FC<ConceptModalProps> = ({ isOpen, onClose }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />

          {/* Modal Card - Pure Monochrome */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[#0E0E10] border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-zinc-200 shadow-black"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 rounded-full text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-750 text-white">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
                  Concept &amp; Architecture
                </span>
                <h2 className="text-2xl font-black tracking-tight text-white">
                  Living 3D Portrait
                </h2>
              </div>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed mb-6">
              Conceived by <span className="font-bold text-white">Shahnab</span>, this next-generation interactive portrait marries real-time continuum physics with generative artificial intelligence to turn still 3D character renders into an organic, breathing persona that responds directly to you.
            </p>

            {/* Architecture Highlights */}
            <div className="space-y-4 mb-6">
              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex gap-3.5 items-start">
                <div className="p-2 rounded-xl bg-zinc-850 text-white border border-zinc-750 mt-0.5">
                  <Waves className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">
                    Elastic Wave Tissue Simulation
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Custom WebGL 73×73 node lattice driven by a 2D damped wave equation with pairwise constraints. Click and pull the skin, ears, or cheeks to feel physically elastic dough deformation that rebounds naturally.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex gap-3.5 items-start">
                <div className="p-2 rounded-xl bg-zinc-850 text-white border border-zinc-750 mt-0.5">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">
                    Autonomous Eye Gaze &amp; Idle Acts
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Tracks your cursor smoothly in 16 discrete gaze vectors. If idle for 4 seconds, her gaze naturally re-centers forward to establish eye contact, interspersed with spontaneous idle behaviors (bubble gum, yawning, winking, fly reaction).
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 flex gap-3.5 items-start">
                <div className="p-2 rounded-xl bg-zinc-850 text-white border border-zinc-750 mt-0.5">
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white mb-0.5">
                    AI Expression Pack Synthesis (Gemini Nano Banana 2.1)
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Upload your own photo in the Gear Settings! Gemini generates a custom 3D Pixar or realistic character, precisely preserves your skin color, and synthesizes a full gaze &amp; expression set that instantly mounts into the physics engine.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono text-zinc-500">Created with Google AI Studio</span>
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-bold uppercase tracking-wider text-xs transition-colors shadow-lg shadow-white/5 active:scale-95"
              >
                Explore Portrait
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
