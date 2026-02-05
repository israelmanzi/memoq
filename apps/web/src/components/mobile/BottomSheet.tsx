import { useEffect, useRef, useState, useCallback } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  /** Height preset: 'auto' | 'half' | 'full' */
  height?: 'auto' | 'half' | 'full';
  /** Show tabs at the top for switching between sections */
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

export function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  height = 'half',
  tabs,
  activeTab,
  onTabChange,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [currentTranslate, setCurrentTranslate] = useState(0);

  // Determine height style
  const heightStyles: Record<string, string> = {
    auto: 'max-h-[85vh]',
    half: 'h-[50vh]',
    full: 'h-[85vh]',
  };

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Touch handlers for drag-to-close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    setIsDragging(true);
    setDragStartY(touch.clientY);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    if (!touch) return;
    const currentY = touch.clientY;
    const diff = currentY - dragStartY;
    // Only allow dragging down
    if (diff > 0) {
      setCurrentTranslate(diff);
    }
  }, [isDragging, dragStartY]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    // If dragged more than 100px down, close the sheet
    if (currentTranslate > 100) {
      onClose();
    }
    setCurrentTranslate(0);
  }, [currentTranslate, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`bottom-sheet animate-slide-up ${heightStyles[height]} flex flex-col`}
        style={{
          transform: currentTranslate > 0 ? `translateY(${currentTranslate}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Panel'}
      >
        {/* Drag handle */}
        <div
          className="flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="bottom-sheet-handle" />
        </div>

        {/* Header with title and/or tabs */}
        {(title || tabs) && (
          <div className="flex-shrink-0 px-4 pb-2 border-b border-border">
            {title && !tabs && (
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text">{title}</h2>
                <button
                  onClick={onClose}
                  className="p-2 -mr-2 text-text-muted hover:text-text min-h-touch min-w-touch flex items-center justify-center"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {tabs && (
              <div className="flex gap-1 overflow-x-auto mobile-hide-scrollbar -mx-4 px-4">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange?.(tab.id)}
                    className={`flex-shrink-0 px-3 py-2 text-xs font-medium rounded-t transition-colors min-h-touch ${
                      activeTab === tab.id
                        ? 'bg-accent text-text-inverse'
                        : 'text-text-secondary hover:bg-surface-hover'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </>
  );
}

// Floating Action Button to trigger bottom sheet
interface FABProps {
  onClick: () => void;
  icon?: React.ReactNode;
  label?: string;
  position?: 'right' | 'center';
  badge?: number;
}

export function FloatingActionButton({
  onClick,
  icon,
  label,
  position = 'right',
  badge,
}: FABProps) {
  const positionStyles = {
    right: 'right-4',
    center: 'left-1/2 -translate-x-1/2',
  };

  return (
    <button
      onClick={onClick}
      className={`fab ${positionStyles[position]} active:scale-95`}
      aria-label={label || 'Open panel'}
    >
      {icon || (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      )}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger text-text-inverse text-2xs font-bold rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
