import React from 'react';

export interface SuggestionAction {
  icon: React.ReactNode;
  label: string;
  action: () => void;
}

interface Props {
  actions: SuggestionAction[];
}

export const SuggestionActions: React.FC<Props> = ({ actions }) => {
  if (actions.length === 0) return null;
  return (
    <div className="pktw-flex pktw-gap-1.5 pktw-flex-wrap">
      {actions.map(a => (
        <span
          key={a.label}
          className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-border pktw-border-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-text-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/5 pktw-transition-all"
          onClick={a.action}
        >
          {a.icon}{a.label}
        </span>
      ))}
    </div>
  );
};
