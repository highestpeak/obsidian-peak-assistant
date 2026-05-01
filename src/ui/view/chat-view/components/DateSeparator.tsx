import React from 'react';

interface DateSeparatorProps {
  date: Date;
}

export const DateSeparator: React.FC<DateSeparatorProps> = ({ date }) => {
  const label = formatDateLabel(date);
  return (
    <div className="pktw-flex pktw-items-center pktw-gap-3 pktw-my-4">
      <div className="pktw-flex-1 pktw-h-px pktw-bg-border" />
      <span className="pktw-text-[9px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">{label}</span>
      <div className="pktw-flex-1 pktw-h-px pktw-bg-border" />
    </div>
  );
};

function formatDateLabel(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
