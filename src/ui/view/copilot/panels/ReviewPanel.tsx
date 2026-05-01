// src/ui/view/copilot/panels/ReviewPanel.tsx
import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import type { ReviewResult } from '@/service/copilot/copilot-schemas';
import { PolishPanel } from './PolishPanel';
import { AlertCircle, AlertTriangle, Info, FileCheck, Wrench, Lightbulb, Check, type LucideIcon } from 'lucide-react';

const SEVERITY_CONFIG: Record<string, { icon: LucideIcon; label: string; bg: string; text: string }> = {
  error: { icon: AlertCircle, label: 'Error', bg: 'pktw-bg-[var(--pk-error,#ef4444)]/10', text: 'pktw-text-[var(--pk-error,#ef4444)]' },
  warning: { icon: AlertTriangle, label: 'Warning', bg: 'pktw-bg-[var(--pk-warning,#f59e0b)]/10', text: 'pktw-text-[var(--pk-warning,#f59e0b)]' },
  info: { icon: Info, label: 'Info', bg: 'pktw-bg-[var(--pk-info,#3b82f6)]/10', text: 'pktw-text-[var(--pk-info,#3b82f6)]' },
};

interface ReviewPanelProps {
  result: ReviewResult;
  file: TFile;
  scope: 'full' | 'selection';
  originalContent: string;
  selectedText?: string;
  onClose: () => void;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  result, file, scope, originalContent, selectedText, onClose,
}) => {
  const [fixedIndices, setFixedIndices] = useState<Set<number>>(new Set());
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [isFixLoading, setIsFixLoading] = useState(false);

  const handleFix = async (index: number) => {
    const section = result.sections[index];
    setFixingIndex(index);
    setIsFixLoading(true);
    try {
      const manager = AppContext.getInstance().manager;
      const content = scope === 'selection' && selectedText ? selectedText : originalContent;
      const fixed = await manager.queryText(PromptId.DocPolish, {
        content,
        title: file.basename,
        scope,
        instruction: section.suggestion,
      });
      setFixResult(fixed);
      setIsFixLoading(false);
    } catch (e) {
      setIsFixLoading(false);
      setFixingIndex(null);
      new Notice(`Fix failed: ${(e as Error).message}`);
    }
  };

  const handleFixAccepted = () => {
    if (fixingIndex !== null) {
      setFixedIndices(prev => new Set([...prev, fixingIndex]));
    }
    setFixingIndex(null);
    setFixResult(null);
  };

  const handleFixBack = () => {
    setFixingIndex(null);
    setFixResult(null);
  };

  const handleCopyFeedback = () => {
    const md = [
      `## Review: ${file.basename}`,
      '',
      result.overall,
      '',
      ...result.sections.map(s => `### ${s.severity.toUpperCase()}: ${s.title}\n${s.feedback}\n> 💡 ${s.suggestion}`),
    ].join('\n');
    navigator.clipboard.writeText(md);
    new Notice('Feedback copied to clipboard.');
  };

  // If in Fix flow, show PolishPanel
  if (fixingIndex !== null && fixResult) {
    const section = result.sections[fixingIndex];
    return (
      <PolishPanel
        result={fixResult}
        file={file}
        scope={scope}
        originalContent={originalContent}
        selectedText={selectedText}
        onClose={() => { handleFixAccepted(); }}
        breadcrumb={`Fix: ${section.title}`}
        onBack={handleFixBack}
      />
    );
  }

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <FileCheck className="pktw-w-4 pktw-h-4" />
          <span className="pktw-text-sm pktw-font-semibold">Article Review</span>
          <span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
            {scope === 'selection' ? 'Selection' : 'Full Document'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {/* Loading state for fix */}
        {isFixLoading && (
          <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-3 pktw-bg-accent/10 pktw-rounded-lg pktw-mb-3 pktw-text-sm pktw-text-muted-foreground">
            <Wrench className="pktw-w-4 pktw-h-4 pktw-animate-pulse" /> Generating fix...
          </div>
        )}

        {/* Overall */}
        <div className="pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-4 pktw-text-[13px] pktw-leading-relaxed pktw-border-l-3 pktw-border-l-accent">
          {result.overall}
        </div>

        {/* Sections */}
        {result.sections.map((section, i) => {
          const config = SEVERITY_CONFIG[section.severity];
          const isFixed = fixedIndices.has(i);
          return (
            <div key={i} className={`pktw-flex pktw-gap-2.5 pktw-py-2.5 pktw-border-b pktw-border-border ${isFixed ? 'pktw-opacity-50' : ''}`}>
              <div className={`pktw-w-[22px] pktw-h-[22px] pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5 ${config.bg} ${config.text}`}>
                <config.icon className="pktw-w-3 pktw-h-3" />
              </div>
              <div className="pktw-flex-1 pktw-min-w-0">
                <div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1">
                  <span className="pktw-text-xs pktw-font-semibold">{section.title}</span>
                  <span className={`pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-px-1.5 pktw-py-0.5 pktw-rounded ${config.bg} ${config.text}`}>
                    {config.label}
                  </span>
                </div>
                <span className="pktw-text-xs pktw-text-muted-foreground pktw-block pktw-mb-1.5 pktw-leading-relaxed">{section.feedback}</span>
                <div className="pktw-flex pktw-items-start pktw-gap-1.5 pktw-text-[11px] pktw-bg-secondary pktw-p-2 pktw-rounded-md pktw-border-l-2 pktw-border-l-accent pktw-leading-relaxed">
                  <Lightbulb className="pktw-w-3.5 pktw-h-3.5 pktw-text-accent pktw-flex-shrink-0 pktw-mt-0.5" />
                  <span>{section.suggestion}</span>
                </div>
                <div className="pktw-mt-2">
                  {isFixed ? (
                    <span className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[10px] pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-bg-[var(--pk-success,#22c55e)]/10 pktw-text-[var(--pk-success,#22c55e)]">
                      <Check className="pktw-w-3 pktw-h-3" /> Fixed
                    </span>
                  ) : (
                    <span
                      className="pktw-text-[10px] pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-border pktw-border-accent pktw-bg-accent/10 pktw-text-accent pktw-cursor-pointer hover:pktw-bg-accent hover:pktw-text-white pktw-transition-all pktw-inline-flex pktw-items-center pktw-gap-1"
                      onClick={() => handleFix(i)}
                    >
                      <Wrench className="pktw-w-3 pktw-h-3" /> Fix
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
          {fixedIndices.size} of {result.sections.length} fixed
        </span>
        <Button variant="ghost" onClick={handleCopyFeedback}>Copy Feedback</Button>
        <Button variant="ghost" onClick={onClose}>Dismiss</Button>
      </div>
    </div>
  );
};
