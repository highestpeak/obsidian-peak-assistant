import React from 'react';

interface ThinkingIndicatorProps {
  text?: string;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ text = 'Thinking...' }) => (
  <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-2 pktw-px-3">
    <div className="pktw-flex pktw-gap-[3px]">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="pktw-w-[5px] pktw-h-[5px] pktw-rounded-full pktw-bg-[var(--pk-accent,#6d28d9)]"
          style={{
            opacity: 0.25,
            animation: `pktw-gentle-pulse 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
    <span className="pktw-text-xs pktw-italic pktw-text-muted-foreground">{text}</span>
  </div>
);
