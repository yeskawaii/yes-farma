import { useLayoutEffect, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  children: ReactNode;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
}

// One stack owns scrolling and background interaction, including sibling portals.
const modalStack: HTMLElement[] = [];
const previousInert = new Map<HTMLElement, boolean>();
let restorePage: (() => void) | undefined;
let bodyObserver: MutationObserver | undefined;

function updateLayers() {
  const top = modalStack.at(-1);
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!previousInert.has(child)) previousInert.set(child, child.inert);
    child.inert = child !== top;
  }
  modalStack.forEach((element, index) => {
    element.style.zIndex = String(1000 + index);
  });
}

function lockPage() {
  const body = document.body;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const properties = ['position', 'top', 'left', 'width', 'overflow', 'padding-right'] as const;
  const saved = properties.map(name => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)]);
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
  Object.assign(body.style, {
    position: 'fixed', top: `-${scrollY}px`, left: `-${scrollX}px`, width: '100%', overflow: 'hidden',
    paddingRight: `${padding + scrollbarWidth}px`,
  });
  bodyObserver = new MutationObserver(updateLayers);
  bodyObserver.observe(body, { childList: true });
  restorePage = () => {
    bodyObserver?.disconnect();
    previousInert.forEach((inert, element) => { element.inert = inert; });
    previousInert.clear();
    saved.forEach(([name, value, priority]) => {
      if (value) body.style.setProperty(name, value, priority);
      else body.style.removeProperty(name);
    });
    window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
  };
}

const focusableSelector = 'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"], iframe';
function focusableElements(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[inert]') &&
      node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden',
  );
}

export function Modal({
  children, onClose, closeOnBackdrop = true, closeOnEscape = true,
  'aria-labelledby': labelledBy, 'aria-label': label, initialFocusRef,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const options = useRef({ onClose, closeOnEscape });
  useLayoutEffect(() => { options.current = { onClose, closeOnEscape }; });

  useLayoutEffect(() => {
    const overlay = overlayRef.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (modalStack.length === 0) lockPage();
    modalStack.push(overlay);
    updateLayers();

    // Existing headings provide an accessible name without per-consumer duplication.
    if (!overlay.hasAttribute('aria-label') && !overlay.hasAttribute('aria-labelledby')) {
      overlay.setAttribute('aria-label', overlay.querySelector('h1, h2, h3')?.textContent?.trim() || 'Diálogo');
    }
    const focusInside = () => {
      (initialFocusRef?.current || focusableElements(overlay)[0] || overlay).focus({ preventScroll: true });
    };
    focusInside();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== overlay) return;
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (options.current.closeOnEscape) options.current.onClose?.();
      } else if (event.key === 'Tab') {
        const elements = focusableElements(overlay);
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          overlay.focus({ preventScroll: true });
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === overlay)) {
          event.preventDefault();
          last?.focus({ preventScroll: true });
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === overlay)) {
          event.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };
    const handleFocus = (event: FocusEvent) => {
      if (modalStack.at(-1) === overlay && !overlay.contains(event.target as Node)) focusInside();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', handleFocus);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', handleFocus);
      const wasTop = modalStack.at(-1) === overlay;
      modalStack.splice(modalStack.indexOf(overlay), 1);
      if (modalStack.length === 0) {
        restorePage?.();
        restorePage = undefined;
      } else updateLayers();
      if (wasTop) {
        const top = modalStack.at(-1);
        if (previousFocus?.isConnected && !previousFocus.closest('[inert]') && (!top || top.contains(previousFocus))) {
          previousFocus.focus({ preventScroll: true });
        } else if (top) (focusableElements(top)[0] || top).focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef]);

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (modalStack.at(-1) === overlayRef.current && closeOnBackdrop && event.target === event.currentTarget) onClose?.();
  };

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] overflow-y-auto overscroll-contain bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={label}
      tabIndex={-1}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        className="flex min-h-full w-full items-center justify-center p-4 sm:p-6"
        onMouseDown={handleBackdropMouseDown}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
