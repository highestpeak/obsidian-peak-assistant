// src/ui/view/copilot/panels/FormatPolishPanel.tsx
import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { WrapText } from 'lucide-react';
import { DiffView } from '@/ui/component/diff/DiffView';

interface FormatPolishPanelProps {
  result: string;
  file: TFile;
  scope: 'full' | 'selection';
  originalContent: string;
  selectedText?: string;
  onClose: () => void;
}

export const FormatPolishPanel: React.FC<FormatPolishPanelProps> = ({
  result, file, scope, originalContent, selectedText, onClose,
}) => {
  const original = scope === 'selection' && selectedText ? selectedText : originalContent;
  const formatted = result;

  const handleApply = async () => {
    const app = AppContext.getInstance().app;
    try {
      if (scope === 'selection') {
        const editor = app.workspace.activeEditor?.editor;
        if (editor) {
          editor.replaceSelection(formatted);
        }
      } else {
        await app.vault.modify(file, formatted);
      }
      new Notice('Formatting fixes applied.');
      onClose();
    } catch (e) {
      new Notice(`Failed to apply: ${(e as Error).message}`);
    }
  };

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <WrapText className="pktw-w-4 pktw-h-4" />
          <span className="pktw-text-sm pktw-font-semibold">Format Polish</span>
          <span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
            {scope === 'selection' ? 'Selection' : 'Full Document'}
          </span>
        </div>
      </div>

      {/* Diff content */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        <div className="pktw-space-y-3">
          <div className="pktw-flex pktw-items-center pktw-gap-3 pktw-text-xs pktw-text-[var(--text-muted)]">
            <span className="pktw-inline-flex pktw-items-center pktw-gap-1">
              <span className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[var(--pk-error,#ef4444)]" />
              Removed
            </span>
            <span className="pktw-inline-flex pktw-items-center pktw-gap-1">
              <span className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[var(--pk-success,#22c55e)]" />
              Added
            </span>
          </div>
          <DiffView original={original} modified={formatted} />
        </div>
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <Button variant="ghost" onClick={onClose}>
          Dismiss
        </Button>
        <Button onClick={handleApply}>
          Apply Changes
        </Button>
      </div>
    </div>
  );
};
