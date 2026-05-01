// src/ui/view/copilot/panels/SplitPanel.tsx
import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { SplitPlan } from '@/service/copilot/copilot-schemas';
import { Scissors, Ruler } from 'lucide-react';

interface SplitPanelProps {
  result: SplitPlan;
  file: TFile;
  originalContent: string;
  onClose: () => void;
}

const SPLIT_COLORS = ['pktw-bg-accent', 'pktw-bg-[var(--pk-info,#3b82f6)]', 'pktw-bg-[var(--pk-success,#22c55e)]', 'pktw-bg-[var(--pk-warning,#f59e0b)]', 'pktw-bg-[var(--pk-error,#ef4444)]'];

export const SplitPanel: React.FC<SplitPanelProps> = ({
  result, file, originalContent, onClose,
}) => {
  const lines = originalContent.split('\n');

  const handleSplit = async () => {
    const app = AppContext.getInstance().app;
    const parentFolder = file.parent?.path ?? '';

    try {
      // Create new files in reverse order to preserve line numbers
      const sortedSplits = [...result.splits].sort((a, b) => b.lineRange[0] - a.lineRange[0]);

      for (const split of sortedSplits) {
        const [start, end] = split.lineRange;
        const extractedLines = lines.slice(start - 1, end); // 1-indexed to 0-indexed
        const content = extractedLines.join('\n');
        const newPath = parentFolder ? `${parentFolder}/${split.newTitle}.md` : `${split.newTitle}.md`;

        await app.vault.create(newPath, content);

        // Replace extracted content with a link in the original
        const linkLine = `→ [[${split.newTitle}]]`;
        lines.splice(start - 1, end - start + 1, linkLine);
      }

      // Save modified original
      await app.vault.modify(file, lines.join('\n'));

      const titles = result.splits.map(s => s.newTitle).join(', ');
      new Notice(`Split into ${result.splits.length} notes: ${titles}`);
      onClose();
    } catch (e) {
      new Notice(`Split failed: ${(e as Error).message}`);
    }
  };

  // Calculate word counts per split
  const splitWordCounts = result.splits.map(split => {
    const [start, end] = split.lineRange;
    const content = lines.slice(start - 1, end).join(' ');
    return content.split(/\s+/).filter(Boolean).length;
  });
  const totalWords = splitWordCounts.reduce((a, b) => a + b, 0);

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <Scissors className="pktw-w-4 pktw-h-4" />
          <span className="pktw-text-sm pktw-font-semibold">Split Suggestion</span>
          <span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
            {totalWords.toLocaleString()} words
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {/* Reason */}
        <div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-4 pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed pktw-border-l-3 pktw-border-l-[var(--pk-warning,#f59e0b)]">
          <Ruler className="pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0 pktw-mt-0.5" />
          {result.reason}
        </div>

        {/* Proportional bar */}
        <div className="pktw-flex pktw-gap-0.5 pktw-mb-4 pktw-h-2 pktw-rounded pktw-overflow-hidden">
          {result.splits.map((_, i) => (
            <div
              key={i}
              className={`${SPLIT_COLORS[i % SPLIT_COLORS.length]} pktw-rounded-sm`}
              style={{ flex: splitWordCounts[i] }}
            />
          ))}
        </div>

        {/* Split cards */}
        {result.splits.map((split, i) => (
          <div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
            <div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border">
              <div className="pktw-w-[22px] pktw-h-[22px] pktw-rounded-full pktw-bg-accent/10 pktw-text-accent pktw-flex pktw-items-center pktw-justify-center pktw-text-[11px] pktw-font-bold pktw-flex-shrink-0">
                {i + 1}
              </div>
              <span className="pktw-text-[13px] pktw-font-semibold pktw-flex-1">{split.newTitle}</span>
              <span className="pktw-text-[10px] pktw-text-muted-foreground pktw-tabular-nums">~{splitWordCounts[i].toLocaleString()} words</span>
            </div>
            <div className="pktw-px-3.5 pktw-py-2.5">
              {/* Headings */}
              <div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-mb-2">
                {split.headings.map(h => (
                  <span key={h} className="pktw-text-[10px] pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground pktw-border pktw-border-border">{h}</span>
                ))}
              </div>
              {/* Summary */}
              <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-leading-relaxed pktw-block">{split.summary}</span>
              {/* Excerpt */}
              <div className="pktw-mt-2 pktw-p-2 pktw-bg-background pktw-border pktw-border-border pktw-rounded-md pktw-text-[11px] pktw-text-muted-foreground/60 pktw-leading-relaxed pktw-max-h-[60px] pktw-overflow-hidden pktw-relative">
                <span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-block pktw-mb-1">
                  Original content <span className="pktw-text-accent pktw-font-semibold pktw-ml-1.5">Lines {split.lineRange[0]}–{split.lineRange[1]}</span>
                </span>
                {split.excerpt}
                <div className="pktw-absolute pktw-bottom-0 pktw-left-0 pktw-right-0 pktw-h-5 pktw-bg-gradient-to-t pktw-from-background pktw-to-transparent" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <Button variant="ghost" onClick={onClose}>Dismiss</Button>
        <Button onClick={handleSplit}>
          Split into {result.splits.length} Notes
        </Button>
      </div>
    </div>
  );
};
