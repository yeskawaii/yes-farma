import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  children: ReactNode;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  zIndexClass?: string;
}

export function Modal({
  children,
  onClose,
  closeOnBackdrop = true,
  closeOnEscape = true,
  zIndexClass = 'z-[100]',
}: ModalProps) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeOnEscape, onClose]);

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) {
      onClose?.();
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClass} overflow-y-auto bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex min-h-[100dvh] w-full items-center justify-center p-4 sm:p-6"
        onMouseDown={handleBackdropMouseDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
