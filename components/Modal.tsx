import React, { useEffect } from 'react';

interface ModalProps {
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  noPadding?: boolean;
  footer?: React.ReactNode;
  fullScreenOnMobile?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen = true, 
  onClose, 
  title, 
  children, 
  maxWidth = 'max-w-2xl',
  noPadding = false,
  footer,
  fullScreenOnMobile = false
}) => {
  // Shield 1: Lock body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    // Cleanup: Restore scroll when closed or unmounted
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Shield 2: Handle "Escape" key to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className={`fixed inset-0 bg-black/60 z-50 flex justify-center backdrop-blur-sm transition-opacity ${
        fullScreenOnMobile ? 'items-stretch sm:items-center p-0 sm:p-4' : 'items-center p-2 sm:p-4'
      }`}
      onClick={onClose} // Close when clicking the backdrop
      aria-modal="true" 
      role="dialog"
      aria-labelledby="modal-title"
    >
      <div 
        className={`modal-content bg-white shadow-2xl w-full ${maxWidth} flex flex-col transform transition-all overflow-hidden ${
          fullScreenOnMobile
            ? 'modal-fullscreen-mobile h-[100dvh] max-h-[100dvh] rounded-none sm:rounded-2xl sm:h-auto sm:max-h-[90vh]'
            : 'rounded-xl sm:rounded-2xl max-h-[90vh]'
        }`}
        onClick={(e) => e.stopPropagation()} // Shield 3: Prevent backdrop click from firing when clicking content
      >
        <header className={`flex items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-200 flex-shrink-0 bg-white z-30 ${
          fullScreenOnMobile
            ? 'rounded-none sm:rounded-t-2xl pt-[max(0.75rem,env(safe-area-inset-top))]'
            : 'rounded-t-xl sm:rounded-t-2xl'
        }`}>
          <h2 id="modal-title" className="text-lg sm:text-xl font-bold text-slate-800 truncate pr-2">
            {title}
          </h2>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0" 
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        
        <div className={`overflow-y-auto flex-1 min-h-0 ${noPadding ? '' : 'p-4 sm:p-6'}`}>
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0 border-t border-indigo-200 bg-white z-40 pb-[max(0px,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};