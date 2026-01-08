import React, { useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface ProgressBarSelectorProps {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export const ProgressBarSelector: React.FC<ProgressBarSelectorProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find current selected index
  const currentIndex = options.findIndex(option => option.value === value);

  // Calculate position for each node
  const getNodePosition = (index: number) => {
    if (options.length <= 1) return 50;
    return (index / (options.length - 1)) * 100;
  };

  // Handle mouse/touch events
  const handlePointerDown = useCallback((index: number, event: React.PointerEvent) => {
    if (disabled) return;
    event.preventDefault();
    setIsDragging(true);
    setDragIndex(index);
    onChange(options[index].value);
  }, [disabled, onChange, options]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!isDragging || dragIndex === null || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

    // Find closest node
    const closestIndex = options.reduce((closest, _, index) => {
      const nodePos = getNodePosition(index);
      const currentPos = getNodePosition(closest);
      return Math.abs(nodePos - percentage) < Math.abs(currentPos - percentage) ? index : closest;
    }, 0);

    if (closestIndex !== currentIndex) {
      onChange(options[closestIndex].value);
      setDragIndex(closestIndex);
    }
  }, [isDragging, dragIndex, currentIndex, onChange, options]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setDragIndex(null);
  }, []);

  // Add global event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      return () => {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  return (
    <div className={cn("pktw-relative pktw-w-full pktw-py-2", className)}>
      {/* Progress Bar Line */}
      <div
        ref={containerRef}
        className={cn(
          "pktw-relative pktw-h-2 pktw-bg-muted pktw-rounded-full pktw-cursor-pointer",
          !disabled && "hover:pktw-bg-muted/80",
          disabled && "pktw-opacity-50 pktw-cursor-not-allowed"
        )}
        onClick={(e) => {
          if (disabled) return;
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const x = e.clientX - rect.left;
          const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
          const closestIndex = options.reduce((closest, _, index) => {
            const nodePos = getNodePosition(index);
            const currentPos = getNodePosition(closest);
            return Math.abs(nodePos - percentage) < Math.abs(currentPos - percentage) ? index : closest;
          }, 0);
          onChange(options[closestIndex].value);
        }}
      >
        {/* Active Progress Fill */}
        <div
          className="pktw-absolute pktw-left-0 pktw-top-0 pktw-h-full pktw-bg-primary pktw-rounded-full pktw-transition-all"
          style={{
            width: currentIndex >= 0 ? `${getNodePosition(currentIndex)}%` : '0%',
          }}
        />

        {/* Nodes */}
        {options.map((option, index) => {
          const position = getNodePosition(index);
          const isSelected = index === currentIndex;
          const isDraggingThis = dragIndex === index;

          return (
            <div
              key={option.value}
              className={cn(
                "pktw-absolute pktw-top-1/2 pktw-transform pktw--translate-y-1/2 pktw-rounded-full pktw-transition-all pktw-duration-200",
                "pktw-cursor-pointer pktw-select-none",
                isSelected
                  ? "pktw-w-4 pktw-h-4 pktw-bg-primary pktw-border-primary pktw-scale-125 pktw-shadow-md"
                  : "pktw-w-3 pktw-h-3 pktw-border-4 pktw-border-black hover:pktw-border-gray-600",
                isDraggingThis && "pktw-scale-150 pktw-shadow-lg",
                disabled && "pktw-cursor-not-allowed pktw-pointer-events-none"
              )}
              style={{
                left: `calc(${position}% - ${isSelected ? 8 : 4}px)`,
              }}
              onPointerDown={(e) => handlePointerDown(index, e)}
              title={option.label}
            >
              {/* Tooltip - only show when dragging */}
              <div className={cn(
                "pktw-absolute pktw-bottom-full pktw-left-1/2 pktw-transform pktw--translate-x-1/2 pktw-mb-2",
                "pktw-px-2 pktw-py-1 pktw-bg-popover pktw-text-popover-foreground pktw-text-xs pktw-rounded-md",
                "pktw-border pktw-shadow-md pktw-whitespace-nowrap pktw-pointer-events-none pktw-opacity-0",
                "pktw-transition-opacity pktw-duration-200",
                isDraggingThis && "pktw-opacity-100"
              )}>
                {option.label}
                <div className="pktw-absolute pktw-top-full pktw-left-1/2 pktw-transform pktw--translate-x-1/2 pktw-border-4 pktw-border-transparent pktw-border-t-popover" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Labels */}
      <div className="pktw-flex pktw-justify-between pktw-mt-2 pktw-text-xs pktw-text-muted-foreground">
        {options.map((option, index) => (
          <span
            key={option.value}
            className={cn(
              "pktw-transition-colors",
              index === currentIndex && "pktw-text-foreground pktw-font-medium"
            )}
          >
            {option.label}
          </span>
        ))}
      </div>
    </div>
  );
};
