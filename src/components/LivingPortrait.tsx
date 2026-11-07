import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

export const LivingPortrait: React.FC<{ characterName: string }> = ({ characterName }) => {
  useEffect(() => {
    const win = window as Window & { initLivingPortrait?: () => void };
    if (typeof win.initLivingPortrait === 'function') {
      win.initLivingPortrait();
    }
  }, []);

  return (
    <div
      className="hero-portrait-wrap pointer-events-auto"
      id="magnetWrap"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: 0.8,
          delay: 0.3,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        className="hero-portrait-inner"
        id="magnetInner"
      >
        <img
          id="faceFallback"
          src="https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261031_040619_2f6f349e-a4a7-40db-8e9b-03b6acd8b99a.png&w=1024&q=92"
          alt={`Portrait of ${characterName}`}
        />
        <canvas id="faceGl" aria-hidden="true" />
        <div id="faceProps" aria-hidden="true">
          {/* 1. Fly Prop */}
          <svg id="faceFly" viewBox="0 0 32 32">
            <path
              className="wing"
              d="M15 15C12 9.500 4.500 8.500 2 13c2.500 4.500 10 4.500 13 2z"
            />
            <path
              className="wing r"
              d="M17 15c3-5.500 10.500-6.500 13-2-2.500 4.500-10 4.500-13 2z"
            />
            <ellipse cx="16" cy="19.500" rx="4" ry="6.500" />
            <circle cx="16" cy="11.500" r="3.300" />
          </svg>

          {/* 2. Cheek Tug Hand Prop */}
          <svg id="faceHand" viewBox="0 0 32 32">
            <path
              className="open"
              d="M10.500 16.500V8.200a1.800 1.800 0 0 1 3.600 0V14v-8a1.800 1.800 0 0 1 3.600 0V14 7a1.800 1.800 0 0 1 3.600 0v8-5a1.800 1.800 0 0 1 3.600 0v10.500c0 5-3.400 8.500-8.400 8.500-3.600 0-5.700-1.600-7.600-4.600l-3.500-5.600c-.6-1 .1-2.200 1.200-2.400 1-.2 1.900.2 2.600 1z"
            />
            <path
              className="grab"
              d="M10.500 17v-3.300a1.800 1.800 0 0 1 3.600 0V14v-1.800a1.800 1.800 0 0 1 3.600 0V14v-1.300a1.800 1.800 0 0 1 3.600 0V14v-.3a1.800 1.800 0 0 1 3.600 0v6.800c0 5-3.400 8.500-8.400 8.500-3.600 0-5.700-1.600-7.600-4.600l-2.300-3.700c-.6-1 .1-2.200 1.200-2.400 1-.2 1.900.2 2.700 1z"
            />
          </svg>

          {/* 3. Deal With It Cool Shades Prop */}
          <svg id="faceGlasses" viewBox="0 0 120 40">
            {/* Frame bridge & arms */}
            <rect x="4" y="8" width="112" height="5" fill="#111" stroke="#fff" strokeWidth="1.2" rx="1" />
            {/* Left Lens */}
            <path d="M10 10 H54 V28 C54 33 49 36 44 36 H20 C14 36 10 32 10 26 Z" fill="#09090B" stroke="#fff" strokeWidth="1.5" />
            {/* Right Lens */}
            <path d="M66 10 H110 V26 C110 32 106 36 100 36 H76 C71 36 66 33 66 28 Z" fill="#09090B" stroke="#fff" strokeWidth="1.5" />
            {/* Pixel Glare Bars */}
            <polygon points="18,14 25,14 19,30 12,30" fill="rgba(255,255,255,0.85)" />
            <polygon points="28,14 32,14 26,30 22,30" fill="rgba(255,255,255,0.6)" />
            <polygon points="74,14 81,14 75,30 68,30" fill="rgba(255,255,255,0.85)" />
            <polygon points="84,14 88,14 82,30 78,30" fill="rgba(255,255,255,0.6)" />
          </svg>

          {/* 4. Steaming Espresso Cup Prop */}
          <svg id="faceCoffee" viewBox="0 0 48 48">
            {/* Animated Steam Wisps */}
            <path className="steam s1" d="M16 14 Q14 9 18 5 T16 1" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round" />
            <path className="steam s2" d="M24 13 Q22 8 26 4 T24 0" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
            <path className="steam s3" d="M31 14 Q29 9 33 5 T31 1" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" />
            {/* Cup Handle */}
            <path d="M35 21 H39 A5 5 0 0 1 39 31 H34" fill="none" stroke="#fff" strokeWidth="3.2" />
            {/* Cup Body */}
            <path d="M9 17 H37 L34 34 C33 39 29 42 23 42 C17 42 13 39 12 34 Z" fill="#18181B" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
            {/* Espresso Crema */}
            <ellipse cx="23" cy="17" rx="14" ry="3.2" fill="#8C5230" stroke="#fff" strokeWidth="1.5" />
            {/* Saucer */}
            <ellipse cx="23" cy="43" rx="16" ry="2.5" fill="#fff" />
          </svg>

          {/* 5. Fluttering Butterfly Prop */}
          <svg id="faceButterfly" viewBox="0 0 40 40">
            <path
              className="bwing l"
              d="M19 20 C12 7 2 8 4 18 C5 23 12 24 18 22 C11 25 6 32 12 35 C17 37 19 29 19 23 Z"
              fill="#F4F4F6"
              stroke="#18181B"
              strokeWidth="1.5"
            />
            <path
              className="bwing r"
              d="M21 20 C28 7 38 8 36 18 C35 23 28 24 22 22 C29 25 34 32 28 35 C23 37 21 29 21 23 Z"
              fill="#F4F4F6"
              stroke="#18181B"
              strokeWidth="1.5"
            />
            <ellipse cx="20" cy="21" rx="1.6" ry="7" fill="#111" />
            <path d="M19 14 Q16 9 13 10 M21 14 Q24 9 27 10" fill="none" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
          </svg>

          {/* 6. Pizza Slice Prop */}
          <svg id="facePizza" viewBox="0 0 48 48">
            {/* Crust */}
            <path d="M8 12 Q24 4 40 12 L37 17 Q24 10 11 17 Z" fill="#D99B52" stroke="#111" strokeWidth="1.8" strokeLinejoin="round" />
            {/* Melty Cheese Triangle */}
            <path d="M11 16 Q24 10 37 16 L24 44 Z" fill="#FACC15" stroke="#111" strokeWidth="1.8" strokeLinejoin="round" />
            {/* Pepperonis */}
            <circle cx="21" cy="22" r="3.5" fill="#DC2626" stroke="#7F1D1D" strokeWidth="1" />
            <circle cx="28" cy="25" r="3.2" fill="#DC2626" stroke="#7F1D1D" strokeWidth="1" />
            <circle cx="23" cy="32" r="3" fill="#DC2626" stroke="#7F1D1D" strokeWidth="1" />
          </svg>

          {/* 7. Paparazzi Camera & Flash Prop */}
          <svg id="faceCamera" viewBox="0 0 48 48">
            <rect x="14" y="10" width="10" height="5" rx="1.5" fill="#e4e4e7" stroke="#111" strokeWidth="1.5" />
            <rect x="6" y="14" width="36" height="24" rx="4" fill="#18181b" stroke="#fff" strokeWidth="2" />
            <circle cx="24" cy="26" r="8" fill="#27272a" stroke="#fff" strokeWidth="2" />
            <circle cx="24" cy="26" r="3.5" fill="#fff" />
            <circle cx="35" cy="19" r="2" fill="#f43f5e" />
          </svg>
          <div id="faceFlash" />
        </div>
      </motion.div>
    </div>
  );
};
