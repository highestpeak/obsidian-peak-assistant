import React, { useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface ProgressBarSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}

export const ProgressBarSlider: React.FC<ProgressBarSliderProps> = ({
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const lastValueRef = useRef<number>(value);

  // Calculate slider position as percentage
  const getSliderPosition = (val: number) => {
    return ((val - min) / (max - min)) * 100;
  };

  // Convert percentage back to value
  const getValueFromPosition = (percentage: number, allowContinuous: boolean = false) => {
    const rawValue = min + (percentage / 100) * (max - min);

    if (allowContinuous) {
      // During dragging, allow more fluid movement
      return Math.max(min, Math.min(max, rawValue));
    }

    // For clicks and final positioning, snap to step
    const rounded = Math.round(rawValue / step) * step;
    return Math.max(min, Math.min(max, rounded));
  };

  // Handle pointer events
  const handlePointerDown = useCallback((event: React.PointerEvent) => {
    if (disabled) return;
    event.preventDefault();
    setIsDragging(true);
    lastValueRef.current = value; // Store initial value
  }, [disabled, value]);

  // Debounced update function
  const debouncedUpdate = useCallback((newValue: number) => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout - only update after 150ms of no changes
    debounceTimeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, 150);
  }, [onChange]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!isDragging || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newValue = getValueFromPosition(percentage, true); // Allow continuous during drag

    // Only trigger update if value changed significantly
    if (Math.abs(newValue - lastValueRef.current) >= step * 0.1) {
      lastValueRef.current = newValue;
      debouncedUpdate(newValue);
    }
  }, [isDragging, min, max, step, debouncedUpdate]);

  const handlePointerUp = useCallback(() => {
    // Clear any pending debounced update
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Snap to nearest step when releasing and apply immediately
    const snappedValue = getValueFromPosition(getSliderPosition(lastValueRef.current), false);
    onChange(snappedValue);

    setIsDragging(false);
  }, [onChange, getSliderPosition, getValueFromPosition]);

  // Add global event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
      return () => {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        // Clear any pending timeout
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
        }
      };
    }
  }, [isDragging, handlePointerMove, handlePointerUp]);

  // Handle click on progress bar
  const handleBarClick = useCallback((event: React.MouseEvent) => {
    if (disabled || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    const newValue = getValueFromPosition(percentage, false); // Snap to step on click
    onChange(newValue); // Immediate update on click
    onChange(newValue);
  }, [disabled, onChange]);

  const position = getSliderPosition(value);

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
        onClick={handleBarClick}
      >
        {/* Active Progress Fill */}
        <div
          className="pktw-absolute pktw-left-0 pktw-top-0 pktw-h-full pktw-bg-primary pktw-rounded-full pktw-transition-all"
          style={{
            width: `${position}%`,
          }}
        />

        {/* Slider Handle */}
        <div
          className={cn(
            "pktw-absolute pktw-top-1/2 pktw-transform pktw--translate-y-1/2 pktw-w-4 pktw-h-4 pktw-rounded-full pktw-border-2 pktw-transition-all pktw-duration-200",
            "pktw-cursor-pointer pktw-select-none",
            isDragging
              ? "pktw-scale-125 pktw-shadow-lg pktw-bg-primary pktw-border-primary"
              : "pktw-bg-primary pktw-border-primary pktw-scale-110 pktw-shadow-md",
            disabled && "pktw-cursor-not-allowed pktw-pointer-events-none"
          )}
          style={{
            left: `calc(${position}% - 8px)`,
          }}
          onPointerDown={handlePointerDown}
        >
          {/* Current value tooltip */}
          <div className={cn(
            "pktw-absolute pktw-bottom-full pktw-left-1/2 pktw-transform pktw--translate-x-1/2 pktw-mb-2",
            "pktw-px-2 pktw-py-1 pktw-bg-popover pktw-text-popover-foreground pktw-text-xs pktw-rounded-md",
            "pktw-border pktw-shadow-md pktw-whitespace-nowrap pktw-pointer-events-none pktw-opacity-100",
            "pktw-transition-opacity pktw-duration-200"
          )}>
            {value.toFixed(step < 0.1 ? 2 : 1)}
            <div className="pktw-absolute pktw-top-full pktw-left-1/2 pktw-transform pktw--translate-x-1/2 pktw-border-4 pktw-border-transparent pktw-border-t-popover" />
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="pktw-flex pktw-justify-between pktw-mt-2 pktw-text-xs pktw-text-muted-foreground">
        <span>{min.toFixed(step < 0.1 ? 2 : 1)}</span>
        <span>{max.toFixed(step < 0.1 ? 2 : 1)}</span>
      </div>
    </div>
  );
};
