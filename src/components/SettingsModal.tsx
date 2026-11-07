import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Key,
  Upload,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Eye,
  EyeOff,
  User,
  Palette,
  Sliders,
  Check,
  Zap,
  Grid,
} from 'lucide-react';
import {
  processPortraitImage,
  readFileAsDataUrl,
  ProcessedPortrait,
} from '../utils/faceIsolation';
import {
  generateFull3DCharacterPack,
  buildCompleteCharacterPack,
  ExpressionMap,
} from '../utils/expressionSynthesizer';
import { PROVIDER_NAMES, type ImageProvider } from '../utils/aiCharacterPack';
import { DEFAULT_CHARACTER_NAME } from '../utils/character';

// Latest OpenAI image models (Image API, /v1/images/edits). Sunburst favours precise edits, Flare is faster.
const DEFAULT_OPENAI_MODEL = 'gpt-image-2.6-sunburst';
const isStaticPages = import.meta.env.VITE_STATIC_PAGES === 'true';
const OPENAI_MODEL_SUGGESTIONS = [
  'gpt-image-2.6-sunburst',
  'gpt-image-2.6-flare',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-flare',
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  characterName: string;
  onUpdateCharacterName: (name: string) => void;
  onApplyCustomPack: (pack: ExpressionMap) => Promise<void> | void;
  onResetDefault: () => void;
}

const PROCESSING_STAGES = [
  { threshold: 15, label: 'Synthesizing Master 3D Floating Head (Zero Neck/Shoulders, Exact Identity)' },
  { threshold: 45, label: 'Isolating the head & registering it as the master frame' },
  { threshold: 56, label: 'Generating 16 far + 16 near gaze directions and 4-step blinks (consistent with the master head)' },
  { threshold: 72, label: 'Generating ~36 reactions: laugh, shock, wink, yawn, bubblegum...' },
  { threshold: 92, label: 'Locking hair & outline to the master head and mounting into the live portrait' },
];

const PREVIEW_EXPRESSIONS = [
  { id: 'rest', label: 'Rest' },
  { id: 'half', label: 'Blink 50%' },
  { id: 'closed', label: 'Blink 100%' },
  { id: 'left', label: 'Gaze L' },
  { id: 'right', label: 'Gaze R' },
  { id: 'up', label: 'Gaze Up' },
  { id: 'down', label: 'Gaze Dn' },
  { id: 'upright', label: 'Gaze Up-R' },
  { id: 'downleft', label: 'Gaze Dn-L' },
  { id: 'laugh', label: 'Laugh' },
  { id: 'shock', label: 'Shock' },
  { id: 'ouch', label: 'Ouch' },
  { id: 'cross', label: 'Cross-Eye' },
  { id: 'angry', label: 'Angry' },
  { id: 'smug', label: 'Smug' },
  { id: 'kiss', label: 'Kiss' },
  { id: 'hearts', label: 'Hearts' },
  { id: 'stars', label: 'Stars' },
  { id: 'winkl', label: 'Wink' },
  { id: 'tongue', label: 'Tongue' },
  { id: 'gum3', label: 'Gum Blow' },
  { id: 'gumpop', label: 'Gum Pop!' },
  { id: 'yawn', label: 'Yawn' },
  { id: 'cry', label: 'Cry' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  characterName,
  onUpdateCharacterName,
  onApplyCustomPack,
  onResetDefault,
}) => {
  // 1. Image provider + API key state (each provider keeps its own key, saved locally in the browser)
  const [provider, setProvider] = useState<ImageProvider>(() =>
    localStorage.getItem('image_provider') === 'openai' ? 'openai' : 'gemini'
  );
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [openaiKey, setOpenaiKey] = useState<string>('');
  const [openaiModel, setOpenaiModel] = useState<string>(
    () => localStorage.getItem('openai_image_model') || DEFAULT_OPENAI_MODEL
  );
  const apiKey = provider === 'openai' ? openaiKey : geminiKey;
  const providerName = PROVIDER_NAMES[provider];
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [keySaved, setKeySaved] = useState<boolean>(false);

  // 2. Character Name State
  const [nameInput, setNameInput] = useState<string>(characterName);

  // 3. Style Selection
  const [style, setStyle] = useState<'pixar' | 'realistic'>('pixar');

  // 4. Upload & Framing State
  const [uploadedRawUrl, setUploadedRawUrl] = useState<string | null>(null);
  const [processedPortrait, setProcessedPortrait] = useState<ProcessedPortrait | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadStep, setUploadStep] = useState<string>('');

  // 5. Generation State
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [generatedPack, setGeneratedPack] = useState<ExpressionMap | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationNote, setGenerationNote] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved API keys from localStorage on mount
  useEffect(() => {
    setGeminiKey(localStorage.getItem('gemini_api_key') || '');
    setOpenaiKey(localStorage.getItem('openai_api_key') || '');
  }, []);

  // Sync nameInput when modal opens
  useEffect(() => {
    if (isOpen) {
      setNameInput(characterName);
    }
  }, [isOpen, characterName]);

  const handleSaveApiKey = (value: string) => {
    if (provider === 'openai') {
      setOpenaiKey(value);
      localStorage.setItem('openai_api_key', value.trim());
    } else {
      setGeminiKey(value);
      localStorage.setItem('gemini_api_key', value.trim());
    }
    if (value.trim()) {
      setGenerationError(null);
    }
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  };

  const handleProviderChange = (next: ImageProvider) => {
    setProvider(next);
    localStorage.setItem('image_provider', next);
    setShowApiKey(false);
    setGenerationError(null);
  };

  const handleOpenaiModelChange = (value: string) => {
    setOpenaiModel(value);
    localStorage.setItem('openai_image_model', value.trim());
  };

  const handleNameChange = (val: string) => {
    setNameInput(val);
    onUpdateCharacterName(val);
  };

  // Run the full sprite sheet character generation with the selected image provider
  const runSpriteSheetPipeline = async (
    portrait: ProcessedPortrait,
    selectedStyle: 'pixar' | 'realistic' = style
  ) => {
    if (isStaticPages) {
      setGenerationError('AI character generation requires the Express server and is unavailable on GitHub Pages.');
      return;
    }
    if (!apiKey.trim()) {
      setGenerationError(
        `Warning: Please enter your ${providerName} API key above to generate your 3D character and expression sprite sheets based on the uploaded image.`
      );
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setGenerationNote(null);
    setGenerationProgress(12);
    setGenerationStep('Analyzing facial structure, hairstyle & natural skin complexion...');
    let partialNote = '';

    try {
      const fullPack = await generateFull3DCharacterPack({
        provider: {
          provider,
          apiKey: apiKey.trim(),
          model: provider === 'openai' ? openaiModel.trim() || DEFAULT_OPENAI_MODEL : undefined,
        },
        referenceImageUrl: portrait.framedReferenceUrl,
        style: selectedStyle,
        skinColorDescription: portrait.skinColorDescription,
        characterName: nameInput.trim() || DEFAULT_CHARACTER_NAME,
        targetSkinRgb: portrait.skinRgb,
        onNote: (note) => {
          partialNote = note;
        },
        onProgress: (pct, stepLabel) => {
          setGenerationProgress(pct);
          setGenerationStep(stepLabel);
        },
      });

      setGenerationProgress(100);
      setGeneratedPack(fullPack);
      await onApplyCustomPack(fullPack);
      setGenerationNote(
        partialNote ||
          `Every gaze, blink and expression frame was generated by ${providerName} from your photo and mounted into the live portrait!`
      );
    } catch (err: any) {
      console.error(`${providerName} sprite sheet generation error:`, err);
      // Graceful fallback using isolated portrait if API fails
      try {
        const fallbackPack = await buildCompleteCharacterPack(portrait.isolatedDataUrl, {});
        setGeneratedPack(fallbackPack);
        await onApplyCustomPack(fallbackPack);
        setGenerationError(
          `${providerName} API error (${err.message || 'Check API key'}). Mounted fallback portrait rig.`
        );
      } catch {
        setGenerationError(
          err.message || `Failed to generate character. Please check your ${providerName} API key.`
        );
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Photo Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessingImage(true);
      setUploadProgress(25);
      setUploadStep('Reading high-resolution portrait...');
      setGenerationError(null);
      setGenerationNote(null);
      setGeneratedPack(null);

      const rawDataUrl = await readFileAsDataUrl(file);
      setUploadedRawUrl(rawDataUrl);

      setUploadProgress(65);
      setUploadStep('Framing head & calibrating natural skin tone...');
      await new Promise((r) => setTimeout(r, 30));

      const processed = await processPortraitImage(rawDataUrl);
      setProcessedPortrait(processed);
      setUploadProgress(100);
      setUploadStep('Reference portrait locked!');
      setIsProcessingImage(false);

      // If API key is already provided, immediately start generating the 3D character + 3x3 sprite sheets
      if (isStaticPages) {
        setGenerationError('AI character generation requires the Express server and is unavailable on GitHub Pages.');
      } else if (apiKey.trim()) {
        await runSpriteSheetPipeline(processed, style);
      } else {
        setGenerationError(
          `Warning: No ${providerName} API key entered. Please enter your ${providerName} API key above and click "Generate 3D Character & Sprite Sheets" to create your animated character!`
        );
      }
    } catch (err: any) {
      setGenerationError('Failed to process uploaded photo: ' + err.message);
      setIsProcessingImage(false);
    }
  };

  const handleGenerateClick = async () => {
    if (!processedPortrait) {
      setGenerationError('Please upload a portrait photo of yourself first.');
      return;
    }
    await runSpriteSheetPipeline(processedPortrait, style);
  };

  const handleApplyAndClose = async () => {
    if (generatedPack) {
      await onApplyCustomPack(generatedPack);
    }
    onClose();
  };

  const handleResetToDefault = () => {
    setNameInput(DEFAULT_CHARACTER_NAME);
    setGeneratedPack(null);
    setGenerationError(null);
    setGenerationNote(null);
    onResetDefault();
  };

  const previewName = (nameInput.trim() || DEFAULT_CHARACTER_NAME).toUpperCase();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/90 backdrop-blur-md"
          />

          {/* Modal Container - Pure Monochrome Black & White Theme */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-[#0E0E10] border border-zinc-800 rounded-3xl p-5 sm:p-7 shadow-2xl text-zinc-200 shadow-black custom-scrollbar"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-zinc-900 border border-zinc-700 text-white">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                    Character Studio
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-700">
                      {providerName} image models
                    </span>
                  </h2>
                  <p className="text-xs text-zinc-400">
                    AI Gaze &amp; Emotion Sprite-Sheet Pipeline for fluid, natural 3D character animation
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors cursor-pointer"
                aria-label="Close settings"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {isStaticPages && (
                <div role="status" className="p-3 rounded-xl bg-zinc-950 border border-zinc-700 text-sm text-zinc-300">
                  AI character generation is unavailable on GitHub Pages because it requires the Express server.
                  Run the app locally to use Character Studio generation.
                </div>
              )}
              {/* 1. Image provider + API key */}
              {!isStaticPages && <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                    Image Generation Model
                  </label>
                  <div className="flex p-0.5 rounded-xl bg-black border border-zinc-700" role="tablist" aria-label="Image provider">
                    {(['gemini', 'openai'] as ImageProvider[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="tab"
                        aria-selected={provider === p}
                        onClick={() => handleProviderChange(p)}
                        disabled={isGenerating}
                        className={`px-3.5 py-1.5 rounded-[10px] text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed ${
                          provider === p ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {PROVIDER_NAMES[p]}
                      </button>
                    ))}
                  </div>
                </div>

                {provider === 'openai' && (
                  <div className="mb-3">
                    <label className="text-[11px] font-medium text-zinc-400 block mb-1.5" htmlFor="openai-model">
                      OpenAI image model ID
                    </label>
                    <input
                      id="openai-model"
                      list="openai-image-models"
                      type="text"
                      value={openaiModel}
                      onChange={(e) => handleOpenaiModelChange(e.target.value)}
                      placeholder={DEFAULT_OPENAI_MODEL}
                      spellCheck={false}
                      className="w-full px-3 py-2 rounded-xl bg-black border border-zinc-700 text-sm font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
                    />
                    <datalist id="openai-image-models">
                      {OPENAI_MODEL_SUGGESTIONS.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                    <p className="text-[11px] text-zinc-500 mt-1.5">
                      Sunburst is built for precise, consistent edits (recommended). Flare is faster. You can paste any newer
                      image model ID.
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-zinc-300" />
                    {providerName} API Key
                  </label>
                  <span className="text-[11px] text-zinc-400">
                    {apiKey ? (
                      <span className="text-white flex items-center gap-1 font-medium">
                        <Check className="w-3 h-3 text-white" /> {keySaved ? 'Saved!' : 'Saved Locally'}
                      </span>
                    ) : (
                      <span className="text-zinc-400">Required for AI 3D Sprite Sheet Generation</span>
                    )}
                  </span>
                </div>

                <div className="relative flex items-center">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => handleSaveApiKey(e.target.value)}
                    placeholder={
                      provider === 'openai'
                        ? 'Enter your OpenAI API Key (e.g. sk-...)'
                        : 'Enter your Gemini API Key (e.g. AIzaSy...)'
                    }
                    autoComplete="off"
                    className="w-full pl-3 pr-20 py-2.5 rounded-xl bg-black border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                      title={showApiKey ? 'Hide Key' : 'Show Key'}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {!apiKey.trim() && (
                  <div className="mt-2.5 p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start gap-2.5 text-xs text-zinc-300">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-white" />
                    <span>
                      Please enter your {providerName} API key to generate a custom 3D character and expression sprite sheets
                      with <strong>{providerName}</strong> image models. Saved locally in your browser and sent only to this
                      app&apos;s own server, which forwards it to {providerName}.
                    </span>
                  </div>
                )}
              </div>}

              {/* 2. Character Name & Style */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Character Name */}
                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800">
                  <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5 mb-2">
                    <User className="w-3.5 h-3.5 text-zinc-300" />
                    Character Name in UI
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Type any name (e.g. AI Character)"
                    maxLength={28}
                    className="w-full px-3 py-2 rounded-xl bg-black border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
                  />
                  <span className="text-[11px] text-zinc-400 mt-1.5 block">
                    Displays on 1 line: <strong className="text-white font-bold">HI, I&apos;M {previewName}</strong>
                  </span>
                </div>

                {/* Style Selector */}
                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800">
                  <label className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5 mb-2">
                    <Palette className="w-3.5 h-3.5 text-zinc-300" />
                    3D Generation Style
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStyle('pixar')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        style === 'pixar'
                          ? 'bg-white text-black border-white shadow-sm'
                          : 'bg-black border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      3D Pixar / Anime
                    </button>
                    <button
                      type="button"
                      onClick={() => setStyle('realistic')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                        style === 'realistic'
                          ? 'bg-white text-black border-white shadow-sm'
                          : 'bg-black border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      Realistic Human 3D
                    </button>
                  </div>
                  <span className="text-[10px] text-zinc-400 mt-1.5 block">
                    Generates a floating 3D head avatar (zero neck) + 72 AI-generated gaze, blink &amp; expression frames (18 sheets, takes a few minutes)
                  </span>
                </div>
              </div>

              {/* 3. Photo Upload & 3D Floating Head Preview */}
              <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-zinc-300" />
                    Reference Portrait &amp; Master 3D Floating Head
                  </span>
                  {processedPortrait && (
                    <div className="flex items-center gap-2 text-[11px] text-zinc-200 font-medium">
                      <span
                        className="w-3 h-3 rounded-full inline-block border border-white/60"
                        style={{ backgroundColor: processedPortrait.detectedSkinHex }}
                      />
                      <span>Skin Tone ({processedPortrait.detectedSkinHex})</span>
                    </div>
                  )}
                </div>

                {/* Live Progress Bar for Photo Upload */}
                {isProcessingImage && (
                  <div className="mb-4 p-3.5 rounded-xl bg-black border border-zinc-700 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white font-medium flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                        {uploadStep || 'Framing portrait...'}
                      </span>
                      <span className="font-mono text-white font-bold">{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-zinc-900 overflow-hidden">
                      <div
                        className="h-full bg-white transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {!uploadedRawUrl ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-700 hover:border-white rounded-2xl p-6 text-center cursor-pointer transition-colors bg-black/60"
                  >
                    <Upload className="w-8 h-8 text-zinc-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-white">Click or drag a photo of yourself here</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Synthesizes a floating 3D head avatar + 72 gaze, blink &amp; emotion frames
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-400">
                          1. Uploaded Reference Portrait
                        </span>
                        <div className="w-full aspect-square rounded-xl overflow-hidden border border-zinc-800 bg-black flex items-center justify-center">
                          <img
                            src={processedPortrait ? processedPortrait.framedReferenceUrl : uploadedRawUrl}
                            alt="Uploaded reference portrait"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-white" />
                          2. Master 3D Floating Head (Transparent PNG)
                        </span>
                        <div className="w-full aspect-square rounded-xl overflow-hidden border border-zinc-700 bg-[#0C0C0C] flex items-center justify-center relative p-2">
                          {isGenerating ? (
                            <div className="flex flex-col items-center gap-2 text-center px-3">
                              <RefreshCw className="w-6 h-6 text-white animate-spin" />
                              <span className="text-[11px] text-zinc-300 font-medium">
                                Generating 3D head &amp; expression sheets with {providerName}...
                              </span>
                            </div>
                          ) : generatedPack?.rest ? (
                            <img
                              src={generatedPack.rest}
                              alt="Generated 3D character"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="text-center px-3 space-y-2">
                              <Sparkles className="w-6 h-6 text-zinc-400 mx-auto" />
                              <p className="text-[11px] text-zinc-400">
                                Click <strong>Generate 3D Character</strong> below to create your floating 3D head &amp; expression sheets
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-zinc-400">
                        Want to try a different photo?
                      </span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 rounded-xl bg-black hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700 text-xs font-medium transition-colors cursor-pointer"
                      >
                        Change Photo
                      </button>
                    </div>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* 4. Generation Warnings & Multi-Stage Progress Bar */}
              {generationError && (
                <div className="p-3.5 rounded-xl bg-zinc-950 border border-white/40 flex items-start gap-2.5 text-xs text-zinc-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-white mt-0.5" />
                  <span>{generationError}</span>
                </div>
              )}

              {generationNote && !isGenerating && (
                <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                  <span>{generationNote}</span>
                </div>
              )}

              {isGenerating && (
                <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900 border border-white/30 space-y-3.5 shadow-lg">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white font-bold flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      {generationStep}
                    </span>
                    <span className="font-mono text-sm text-white font-black px-2 py-0.5 rounded bg-black border border-zinc-700">
                      {generationProgress}%
                    </span>
                  </div>

                  {/* Main Progress Bar */}
                  <div className="w-full h-3 rounded-full bg-black border border-zinc-800 overflow-hidden p-0.5">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-300"
                      style={{ width: `${generationProgress}%` }}
                    />
                  </div>

                  {/* 5-Stage Processing Checklist */}
                  <div className="grid grid-cols-1 gap-1.5 pt-1">
                    {PROCESSING_STAGES.map((stage, idx) => {
                      const isDone = generationProgress > stage.threshold + 14 || generationProgress === 100;
                      const isCurrent = !isDone && generationProgress >= stage.threshold;
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-2 text-[11px] transition-colors ${
                            isDone
                              ? 'text-white font-medium'
                              : isCurrent
                              ? 'text-zinc-200 font-semibold'
                              : 'text-zinc-500'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white shrink-0" />
                          ) : isCurrent ? (
                            <RefreshCw className="w-3.5 h-3.5 text-white animate-spin shrink-0" />
                          ) : (
                            <span className="w-3.5 h-3.5 rounded-full border border-zinc-700 inline-block shrink-0" />
                          )}
                          <span>{stage.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. Sliced 3x3 Sprite Sheet Expression Pack Preview */}
              {generatedPack && !isGenerating && (
                <div className="p-4 rounded-2xl bg-zinc-900/90 border border-zinc-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                      <Grid className="w-4 h-4 text-white" />
                      Sliced &amp; Aligned 3D Sprite-Sheet Expressions Active
                    </span>
                    <span className="text-[11px] text-zinc-400 font-mono">
                      {Object.keys(generatedPack).filter((k) => !k.startsWith('__')).length} interactive states ready
                    </span>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {PREVIEW_EXPRESSIONS.map(({ id, label }) => (
                      <div key={id} className="text-center space-y-1">
                        <div className="w-full aspect-square rounded-lg overflow-hidden border border-zinc-700 bg-[#0C0C0C] p-1">
                          {generatedPack[id] ? (
                            <img
                              src={generatedPack[id]}
                              alt={label}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-600">
                              N/A
                            </div>
                          )}
                        </div>
                        <span className="text-[9px] uppercase font-mono text-zinc-400 block truncate">
                          {label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Reset to AI Character (Default)
                </button>

                <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    disabled={isStaticPages || isGenerating || !processedPortrait}
                    onClick={handleGenerateClick}
                    className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                      generatedPack
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600'
                        : 'bg-white hover:bg-zinc-200 text-black shadow-lg shadow-white/5'
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Sparkles className="w-4 h-4" />
                    {generatedPack ? 'Regenerate 3D Sprite Sheets' : 'Generate 3D Character & Sprite Sheets'}
                  </button>

                  {generatedPack && !isGenerating && (
                    <button
                      type="button"
                      onClick={handleApplyAndClose}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black text-xs font-bold uppercase tracking-wider transition-all shadow-lg shadow-white/10 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                      <Zap className="w-4 h-4 text-black" />
                      Apply &amp; Interact Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
