import React from 'react';
import { Magnet } from './Magnet';
import { Sparkles } from 'lucide-react';

interface ContactButtonProps {
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const ContactButton: React.FC<ContactButtonProps> = ({
  onClick,
  className = '',
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'px-5 py-2.5 text-xs',
    md: 'px-6 py-2.5 sm:px-8 sm:py-3 md:px-10 md:py-3.5 text-xs sm:text-sm font-semibold',
    lg: 'px-8 py-3.5 sm:px-10 sm:py-4 md:px-12 md:py-4.5 text-sm sm:text-base font-semibold',
  }[size];

  return (
    <Magnet strength={3} padding={40}>
      <button
        type="button"
        onClick={onClick}
        aria-label="View Concept by Shahnab"
        className={`contact-btn contact-btn-glow relative inline-flex items-center gap-2 rounded-full text-white font-medium uppercase tracking-wider cursor-pointer select-none transition-all duration-200 active:scale-95 shadow-lg shadow-black/80 ${sizeClasses} ${className}`}
      >
        <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
        <span>Concept by Shahnab</span>
      </button>
    </Magnet>
  );
};
