// src/ui/view/copilot/panels/SemanticLinkSuggestPanel.tsx
import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { Share2, Check } from 'lucide-react';

interface SemanticLinkSuggestion {
  path: string;
  title: string;
  score: number;
  direction: 'outgoing' | 'incoming';
  snippet: string;
}

interface SemanticLinkSuggestPanelProps {
  result: {
    suggestions: SemanticLinkSuggestion[];
    summary: string;
  };
  file: TFile;
  originalContent: string;
  onClose: () => void;
}

export const SemanticLinkSuggestPanel: React.FC<SemanticLinkSuggestPanelProps> = ({
  result, file, originalContent, onClose,
}) => {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const toggle = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const selectedItems = result.suggestions.filter((_, i) => selected.has(i));

  const handleInsert = async () => {
    const app = AppContext.getInstance().app;
    try {
      let content = await app.vault.read(file);
      // Append links section at the end of the document
      const linkLines = selectedItems.map(s => `- [[${s.path.replace(/\.md$/, '')}|${s.title}]]`);
      const linkSection = `\n\n## Related Notes\n\n${linkLines.join('\n')}\n`;
      content += linkSection;
      await app.vault.modify(file, content);
      new Notice(`Inserted ${selectedItems.length} link${selectedItems.length !== 1 ? 's' : ''}.`);
      onClose();
    } catch (e) {
      new Notice(`Failed: ${(e as Error).message}`);
    }
  };

  const formatScore = (score: number) => {
    const pct = Math.round(score * 100);
    if (pct >= 80) return { label: `${pct}%`, className: 'pktw-text-[var(--pk-success,#22c55e)]' };
    if (pct >= 50) return { label: `${pct}%`, className: 'pktw-text-accent' };
    return { label: `${pct}%`, className: 'pktw-text-muted-foreground' };
  };

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <Share2 className="pktw-w-4 pktw-h-4" />
          <span className="pktw-text-sm pktw-font-semibold">Semantic Link Suggestions</span>
        </div>
      </div>

      {/* Body */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {/* Summary */}
        <div className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-3 pktw-text-[11px] pktw-text-muted-foreground">
          <span className="pktw-text-lg pktw-font-bold pktw-text-accent">{result.suggestions.length}</span>
          <span>{result.summary}</span>
        </div>

        {result.suggestions.length === 0 ? (
          <div className="pktw-text-sm pktw-text-muted-foreground pktw-text-center pktw-py-8">
            No unlinked semantic neighbors found.
          </div>
        ) : (
          result.suggestions.map((suggestion, i) => {
            const isChecked = selected.has(i);
            const scoreInfo = formatScore(suggestion.score);
            return (
              <div
                key={i}
                className="pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
                onClick={() => toggle(i)}
              >
                <div className={`pktw-w-4 pktw-h-4 pktw-rounded pktw-border-2 pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5 pktw-transition-all ${
                  isChecked
                    ? 'pktw-bg-accent pktw-border-accent pktw-text-white pktw-text-[10px]'
                    : 'pktw-border-border'
                }`}>
                  {isChecked && <Check className="pktw-w-2.5 pktw-h-2.5" />}
                </div>
                <div className="pktw-flex-1 pktw-min-w-0">
                  <div className="pktw-flex pktw-items-center pktw-gap-1.5">
                    <span className="pktw-text-[13px] pktw-font-semibold pktw-text-accent pktw-truncate">[[{suggestion.title}]]</span>
                    <span className={`pktw-text-[10px] pktw-font-bold ${scoreInfo.className}`}>
                      {scoreInfo.label}
                    </span>
                    <span className={`pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-uppercase ${
                      suggestion.direction === 'outgoing'
                        ? 'pktw-bg-accent/10 pktw-text-accent'
                        : 'pktw-bg-[var(--pk-success,#22c55e)]/10 pktw-text-[var(--pk-success,#22c55e)]'
                    }`}>
                      {suggestion.direction === 'outgoing' ? 'out' : 'in'}
                    </span>
                  </div>
                  <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mt-0.5 pktw-truncate">
                    {suggestion.path}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
          {selected.size} of {result.suggestions.length} selected
        </span>
        <Button variant="ghost" onClick={onClose}>Dismiss</Button>
        <Button onClick={handleInsert} disabled={selectedItems.length === 0}>
          Insert {selectedItems.length} Link{selectedItems.length !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
};
