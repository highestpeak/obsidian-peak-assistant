import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';
import { Input } from '@/ui/component/shared-ui/input';

export interface InputWithOverlayProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'children'> {
  /** Overlay render function that receives the input value */
  renderOverlay: (value: string) => React.ReactNode;
  /** Additional CSS classes for the container */
  containerClassName?: string;
  /** Whether to display transparent text (defaults to true) */
  transparent?: boolean;
  /** Overlay styles to override default styles */
  overlayStyle?: React.CSSProperties;
  /** Whether to use default overlay styles (defaults to true) */
  useDefaultOverlayStyle?: boolean;
}

const InputWithOverlayComponent = React.forwardRef<HTMLInputElement, InputWithOverlayProps>(
  ({
    renderOverlay,
    containerClassName,
    transparent = true,
    overlayStyle,
    useDefaultOverlayStyle = true,
    value,
    ...inputProps
  }, ref) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Merge ref
    React.useImperativeHandle(ref, () => inputRef.current!, []);

    // Default overlay styles
    const defaultOverlayStyle: React.CSSProperties = {
      color: '#2e3338',
      fontSize: '14px',
      fontWeight: '500',
      fontFamily: 'inherit',
      lineHeight: '1.2', // Adjust line height for better text centering
      letterSpacing: 'inherit',
      paddingLeft: '44px', // pktw-pl-11 = 2.75rem = 44px
      paddingRight: '0px',
      paddingTop: '8px',   // Reduce top padding for better text centering
      paddingBottom: '8px', // Reduce bottom padding for better text centering
      boxSizing: 'border-box',
      whiteSpace: 'pre',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      display: 'flex',
      alignItems: 'center', // Vertical center alignment
    };

    // Merge styles: default styles + user provided styles
    const finalOverlayStyle = useDefaultOverlayStyle
      ? { ...defaultOverlayStyle, ...overlayStyle }
      : overlayStyle || {};

    // Process input styles, add default styles
    const inputStyle = React.useMemo(() => {
      const defaultInputStyle: React.CSSProperties = {
        caretColor: '#2e3338', // Ensure cursor is visible
        font: 'inherit',       // Inherit font styles
        boxSizing: 'border-box', // Proper box model
      };

      return inputProps.style
        ? { ...defaultInputStyle, ...inputProps.style }
        : defaultInputStyle;
    }, [inputProps.style]);

    // Process input className, add transparent text if needed
    const inputClassName = React.useMemo(() => {
      const baseClass = inputProps.className || '';
      return transparent && !baseClass.includes('pktw-text-transparent')
        ? `${baseClass} pktw-text-transparent`.trim()
        : baseClass;
    }, [inputProps.className, transparent]);

    return (
      <div className={cn('pktw-relative', containerClassName)}>
        {/* Input field */}
        <Input
          ref={inputRef}
          {...inputProps}
          className={inputClassName}
          style={inputStyle}
        />

        {/* Overlay layer */}
        <div
          className="pktw-absolute pktw-inset-0 pktw-pointer-events-none pktw-select-none"
          style={finalOverlayStyle}
        >
          {renderOverlay(String(value || ''))}
        </div>
      </div>
    );
  }
);

InputWithOverlayComponent.displayName = 'InputWithOverlay';

export const InputWithOverlay = InputWithOverlayComponent;