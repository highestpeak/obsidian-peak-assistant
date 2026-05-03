import { Modal } from 'obsidian';
import React, { useState, useCallback, useEffect } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { Tag, Link2, Scissors, MessageSquareText, Sparkles } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

interface CopilotAction {
    id: string;
    icon: React.ReactNode;
    label: string;
    description: string;
}

const ACTIONS: CopilotAction[] = [
    { id: 'peak-copilot-suggest-tags', icon: <Tag size={20} />, label: 'Suggest Tags', description: 'Analyze content and suggest relevant tags' },
    { id: 'peak-copilot-suggest-links', icon: <Link2 size={20} />, label: 'Suggest Links', description: 'Find potential wiki-link connections' },
    { id: 'peak-copilot-split', icon: <Scissors size={20} />, label: 'Suggest Split', description: 'Propose how to split a long document' },
    { id: 'peak-copilot-review', icon: <MessageSquareText size={20} />, label: 'Review Article', description: 'Get structural and content feedback' },
    { id: 'peak-copilot-polish', icon: <Sparkles size={20} />, label: 'Polish Document', description: 'Improve clarity and style' },
];

const CopilotPickerContent: React.FC<{ onSelect: (id: string) => void; fileName: string | null }> = ({ onSelect, fileName }) => {
    const [selected, setSelected] = useState(0);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const cols = 3;
        if (e.key === 'ArrowRight') { e.preventDefault(); setSelected(i => (i + 1) % ACTIONS.length); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); setSelected(i => (i - 1 + ACTIONS.length) % ACTIONS.length); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(i => Math.min(i + cols, ACTIONS.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(i => Math.max(i - cols, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (fileName) onSelect(ACTIONS[selected].id); }
    }, [selected, onSelect, fileName]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="pktw-p-4">
            <div className="pktw-flex pktw-justify-between pktw-items-center pktw-mb-4">
                <span className="pktw-text-sm pktw-font-semibold">Copilot</span>
                {fileName && <span className="pktw-text-xs pktw-text-muted-foreground pktw-font-mono">{fileName}</span>}
            </div>
            {!fileName && (
                <div className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-py-8">
                    Open a document first
                </div>
            )}
            {fileName && (
                <div className="pktw-grid pktw-grid-cols-3 pktw-gap-2">
                    {ACTIONS.map((action, idx) => (
                        <div
                            key={action.id}
                            className={cn(
                                'pktw-flex pktw-flex-col pktw-items-center pktw-gap-2 pktw-p-4 pktw-rounded-lg pktw-border pktw-cursor-pointer pktw-transition-all',
                                idx === selected
                                    ? 'pktw-border-accent pktw-bg-accent/10 pktw-shadow-sm'
                                    : 'pktw-border-border hover:pktw-border-accent/50 hover:pktw-shadow-sm',
                            )}
                            onClick={() => onSelect(action.id)}
                            onMouseEnter={() => setSelected(idx)}
                        >
                            <span className="pktw-text-accent">{action.icon}</span>
                            <span className="pktw-text-xs pktw-font-medium">{action.label}</span>
                            <span className="pktw-text-[10px] pktw-text-muted-foreground pktw-text-center pktw-leading-tight">{action.description}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="pktw-flex pktw-gap-3 pktw-justify-center pktw-mt-4 pktw-text-[10px] pktw-text-muted-foreground">
                <span>↑↓←→ navigate</span>
                <span>↵ select</span>
            </div>
        </div>
    );
};

export class CopilotPickerModal extends Modal {
    private reactRenderer: ReactRenderer | null = null;

    constructor(private appContext: AppContext) {
        super(appContext.app);
    }

    onOpen(): void {
        this.contentEl.empty();
        this.modalEl.addClass('peak-copilot-picker-modal');
        this.contentEl.addClass('pktw-root');
        this.modalEl.style.width = '520px';
        this.modalEl.style.maxWidth = '90vw';

        const file = this.appContext.app.workspace.getActiveFile();

        this.reactRenderer = new ReactRenderer(this.containerEl);
        this.reactRenderer.render(
            createReactElementWithServices(
                CopilotPickerContent,
                {
                    fileName: file?.basename ?? null,
                    onSelect: (commandId: string) => {
                        this.close();
                        (this.app as any).commands.executeCommandById(`obsidian-peak-assistant:${commandId}`);
                    },
                },
                this.appContext,
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
