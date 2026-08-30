import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';

interface ExitFastCaptureDialogProps {
  isOpen: boolean;
  onConfirmExit: () => void;
  onCancel: () => void;
}

export const ExitFastCaptureDialog: React.FC<ExitFastCaptureDialogProps> = ({
  isOpen,
  onConfirmExit,
  onCancel
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus cancel button for safe keyboard navigation
    cancelBtnRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-fast-capture-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 flex flex-col gap-5 animate-in zoom-in-95 duration-150 relative mx-auto my-auto max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs">
              <AlertTriangle size={20} strokeWidth={2.5} />
            </div>
            <div>
              <h3 id="exit-fast-capture-title" className="text-base font-bold text-slate-900">
                Salir de Captura rápida
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Confirmación de descarte de cambios
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          Tienes una captura en curso. Si sales, se descartará la selección y los datos preparados para este lote.
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors cursor-pointer touch-manipulation min-h-[44px]"
          >
            Continuar capturando
          </button>
          <button
            type="button"
            onClick={onConfirmExit}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer touch-manipulation min-h-[44px]"
          >
            Salir y descartar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
