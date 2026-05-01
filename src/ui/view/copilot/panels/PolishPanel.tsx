// src/ui/view/copilot/panels/PolishPanel.tsx
import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { Sparkles, Lightbulb } from 'lucide-react';

interface PolishPanelProps {
  result: string;
  file: TFile;
  scope: 'full' | 'selection';
  originalContent: string;
  selectedText?: string;
  onClose: () => void;
  // Optional: for Review-Fix flow
  breadcrumb?: string;
  onBack?: () => void;
}

export const PolishPanel: React.FC<PolishPanelProps> = ({
  result, file, scope, originalContent, selectedText, onClose, breadcrumb, onBack,
}) => {
  const original = scope === 'selection' && selectedText ? selectedText : originalContent;
  const polished = result;

  const handleApply = async () => {
    const app = AppContext.getInstance().app;
    try {
      if (scope === 'selection') {
        const editor = app.workspace.activeEditor?.editor;
        if (editor) {
          editor.replaceSelection(polished);
        }
      } else {
        await app.vault.modify(file, polished);
      }
      new Notice('Changes applied.');
      onClose();
    } catch (e) {
      new Notice(`Failed to apply: ${(e as Error).message}`);
    }
  };

  // Simple word-level diff for display
  const originalWords = original.split(/(\s+)/);
  const polishedWords = polished.split(/(\s+)/);

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          {onBack && (
            <span
              className="pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-text-foreground pktw-transition-colors pktw-text-sm"
              onClick={onBack}
            >
              ← Back
            </span>
          )}
          {breadcrumb ? (
            <span className="pktw-text-sm pktw-font-semibold">{breadcrumb}</span>
          ) : (
            <>
              <Sparkles className="pktw-w-4 pktw-h-4" />
              <span className="pktw-text-sm pktw-font-semibold">Document Polish</span>
            </>
          )}
          <span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
            {scope === 'selection' ? 'Selection' : 'Full Document'}
          </span>
        </div>
      </div>

      {/* Diff content */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {breadcrumb && (
          <div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-mb-3 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-border-l-3 pktw-border-l-accent pktw-text-xs pktw-text-muted-foreground">
            <Lightbulb className="pktw-w-3.5 pktw-h-3.5 pktw-text-accent pktw-flex-shrink-0 pktw-mt-0.5" />
            <span>{breadcrumb}</span>
          </div>
        )}
        <div className="pktw-grid pktw-grid-cols-2 pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
          <div className="pktw-p-4 pktw-bg-secondary pktw-border-r pktw-border-border">
            <div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
              <div className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[var(--pk-error,#ef4444)] pktw-opacity-60" />
              <span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">Before</span>
            </div>
            <div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">{original}</div>
          </div>
          <div className="pktw-p-4">
            <div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
              <div className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[var(--pk-success,#22c55e)] pktw-opacity-60" />
              <span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">After</span>
            </div>
            <div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">{polished}</div>
          </div>
        </div>
        <div className="pktw-flex pktw-gap-3 pktw-mt-3 pktw-text-[10px] pktw-text-muted-foreground">
          <span>{originalWords.length} → {polishedWords.length} words</span>
        </div>
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        {onBack && (
          <span
            className="pktw-text-xs pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-text-foreground pktw-mr-auto"
            onClick={onBack}
          >
            ← Back to review
          </span>
        )}
        <Button variant="ghost" onClick={onClose}>
          {onBack ? 'Skip' : 'Dismiss'}
        </Button>
        <Button onClick={handleApply}>
          {onBack ? 'Accept Fix' : 'Apply Changes'}
        </Button>
      </div>
    </div>
  );
};
