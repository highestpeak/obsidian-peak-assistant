// src/ui/view/copilot/panels/LinkSuggestPanel.tsx
import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { LinkSuggestions } from '@/service/copilot/copilot-schemas';
import { Link2, Check } from 'lucide-react';

interface LinkSuggestPanelProps {
  result: LinkSuggestions;
  file: TFile;
  originalContent: string;
  onClose: () => void;
}

export const LinkSuggestPanel: React.FC<LinkSuggestPanelProps> = ({
  result, file, originalContent, onClose,
}) => {
  const [selected, setSelected] = useState<Set<number>>(() => {
    // Pre-select outgoing links
    const s = new Set<number>();
    result.links.forEach((link, i) => { if (link.type === 'outgoing') s.add(i); });
    return s;
  });

  const toggle = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const outgoingCount = result.links.filter(l => l.type === 'outgoing').length;
  const incomingCount = result.links.filter(l => l.type === 'incoming').length;
  const selectedOutgoing = result.links.filter((l, i) => l.type === 'outgoing' && selected.has(i));

  const handleInsert = async () => {
    const app = AppContext.getInstance().app;
    try {
      let content = await app.vault.read(file);
      for (const link of selectedOutgoing) {
        // Insert [[target]] near the context phrase
        const contextIdx = content.indexOf(link.context);
        if (contextIdx !== -1) {
          // Insert [[target]] after the context phrase
          const insertPos = contextIdx + link.context.length;
          content = content.slice(0, insertPos) + ` [[${link.target}]]` + content.slice(insertPos);
        }
      }
      await app.vault.modify(file, content);
      new Notice(`Inserted ${selectedOutgoing.length} links.`);
      onClose();
    } catch (e) {
      new Notice(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <Link2 className="pktw-w-4 pktw-h-4" />
          <span className="pktw-text-sm pktw-font-semibold">Link Suggestions</span>
        </div>
      </div>

      {/* Body */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {/* Summary */}
        <div className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-3 pktw-text-[11px] pktw-text-muted-foreground">
          <span className="pktw-text-lg pktw-font-bold pktw-text-accent">{result.links.length}</span>
          <span>potential links · <span className="pktw-font-semibold pktw-text-accent">{outgoingCount}</span> outgoing · <span className="pktw-font-semibold pktw-text-[var(--pk-success,#22c55e)]">{incomingCount}</span> incoming</span>
        </div>

        {/* Links */}
        {result.links.map((link, i) => {
          const isChecked = selected.has(i);
          const isOutgoing = link.type === 'outgoing';
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
                  <span className="pktw-text-[13px] pktw-font-semibold pktw-text-accent">[[{link.target}]]</span>
                  <span className={`pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-uppercase ${
                    isOutgoing
                      ? 'pktw-bg-accent/10 pktw-text-accent'
                      : 'pktw-bg-[var(--pk-success,#22c55e)]/10 pktw-text-[var(--pk-success,#22c55e)]'
                  }`}>
                    {isOutgoing ? '→ Out' : '← In'}
                  </span>
                </div>
                <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mt-0.5">{link.reason}</span>
                {link.context && (
                  <span className="pktw-text-[11px] pktw-text-muted-foreground/60 pktw-italic pktw-block pktw-mt-1 pktw-pl-2.5 pktw-border-l-2 pktw-border-border">
                    ...{link.context}...
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
          {selected.size} of {result.links.length} selected
        </span>
        <Button variant="ghost" onClick={onClose}>Dismiss</Button>
        <Button onClick={handleInsert} disabled={selectedOutgoing.length === 0}>
          Insert {selectedOutgoing.length} Links
        </Button>
      </div>
    </div>
  );
};
