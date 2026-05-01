// src/ui/view/copilot/CopilotResultModal.tsx
import { Modal, type App, type TFile } from 'obsidian';
import React from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { ReviewResult, LinkSuggestions, SplitPlan } from '@/service/copilot/copilot-schemas';

export type CopilotResultType = 'polish' | 'review' | 'suggest-links' | 'split';

export interface CopilotResultProps {
  type: CopilotResultType;
  result: string | ReviewResult | LinkSuggestions | SplitPlan;
  file: TFile;
  scope: 'full' | 'selection';
  originalContent: string;
  selectedText?: string;
  onClose: () => void;
}

const CopilotResultContent: React.FC<CopilotResultProps> = (props) => {
  const { type } = props;

  // Lazy-load panels to keep the shell thin
  switch (type) {
    case 'polish': {
      const { PolishPanel } = require('./panels/PolishPanel');
      return <PolishPanel {...props} result={props.result as string} />;
    }
    case 'review': {
      const { ReviewPanel } = require('./panels/ReviewPanel');
      return <ReviewPanel {...props} result={props.result as ReviewResult} />;
    }
    case 'suggest-links': {
      const { LinkSuggestPanel } = require('./panels/LinkSuggestPanel');
      return <LinkSuggestPanel {...props} result={props.result as LinkSuggestions} />;
    }
    case 'split': {
      const { SplitPanel } = require('./panels/SplitPanel');
      return <SplitPanel {...props} result={props.result as SplitPlan} />;
    }
  }
};

export class CopilotResultModal extends Modal {
  private reactRenderer: ReactRenderer | null = null;

  constructor(
    app: App,
    private props: Omit<CopilotResultProps, 'onClose'>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass('peak-copilot-modal');
    this.contentEl.addClass('pktw-root');
    this.modalEl.style.width = '720px';
    this.modalEl.style.maxWidth = '90vw';

    const appContext = AppContext.getInstance();
    this.reactRenderer = new ReactRenderer(this.containerEl);
    this.reactRenderer.render(
      createReactElementWithServices(
        CopilotResultContent,
        { ...this.props, onClose: () => this.close() },
        appContext,
      ),
    );
  }

  onClose(): void {
    const r = this.reactRenderer;
    this.reactRenderer = null;
    if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
    else this.contentEl.empty();
  }
}
