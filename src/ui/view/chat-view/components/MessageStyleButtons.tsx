import React from 'react';
import { Minimize2, Maximize2, Feather, GraduationCap, type LucideIcon } from 'lucide-react';

const STYLES: Array<{ icon: LucideIcon; label: string; prompt: string }> = [
  { icon: Minimize2, label: 'Shorter', prompt: 'Rewrite your last response to be more concise.' },
  { icon: Maximize2, label: 'More detail', prompt: 'Expand your last response with more detail and examples.' },
  { icon: Feather, label: 'Simpler', prompt: 'Rewrite your last response using simpler language.' },
  { icon: GraduationCap, label: 'More formal', prompt: 'Rewrite your last response in a more formal tone.' },
];

interface Props {
  onStyleSelect: (prompt: string) => void;
}

export const MessageStyleButtons: React.FC<Props> = ({ onStyleSelect }) => (
  <div className="pktw-flex pktw-gap-1 pktw-mt-1.5 pktw-flex-wrap">
    {STYLES.map(s => (
      <span
        key={s.label}
        className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-0.5 pktw-rounded pktw-border pktw-border-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-text-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/10 pktw-transition-all"
        onClick={() => onStyleSelect(s.prompt)}
      >
        <s.icon className="pktw-w-3 pktw-h-3" />
        {s.label}
      </span>
    ))}
  </div>
);
