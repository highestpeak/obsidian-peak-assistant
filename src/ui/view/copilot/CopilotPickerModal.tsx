import { Modal } from 'obsidian';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, FolderOpen, Pen, Star } from 'lucide-react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { CopilotActionRegistry, type CopilotAction, type DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import { getSelectedTextFromActiveEditor } from '@/core/utils/obsidian-utils';
import { cn } from '@/ui/react/lib/utils';

const CATEGORY_META = {
	document: { label: 'Document', icon: FileText, color: 'pktw-text-blue-400' },
	vault: { label: 'Vault', icon: FolderOpen, color: 'pktw-text-purple-400' },
	writing: { label: 'Writing', icon: Pen, color: 'pktw-text-green-400' },
} as const;

const CATEGORIES: Array<'document' | 'vault' | 'writing'> = ['document', 'vault', 'writing'];

const CopilotPickerContent: React.FC<{
	onSelect: (action: CopilotAction) => void;
	ctx: DocumentContext | null;
}> = ({ onSelect, ctx }) => {
	const registry = CopilotActionRegistry.getInstance();

	const scored = useMemo(() => {
		if (!ctx) return new Map<string, number>();
		const map = new Map<string, number>();
		registry.rank(ctx).forEach(({ action, score }) => map.set(action.id, score));
		return map;
	}, [ctx]);

	// Flatten all actions for keyboard nav
	const allActions = useMemo(() => {
		return CATEGORIES.flatMap(cat => registry.getByCategory(cat));
	}, []);

	const [selectedIdx, setSelectedIdx] = useState(0);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		const cols = 3;
		if (e.key === 'ArrowRight') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, allActions.length - 1)); }
		else if (e.key === 'ArrowLeft') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); }
		else if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + cols, allActions.length - 1)); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - cols, 0)); }
		else if (e.key === 'Enter') { e.preventDefault(); if (ctx) onSelect(allActions[selectedIdx]); }
	}, [allActions, selectedIdx, onSelect, ctx]);

	useEffect(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleKeyDown]);

	if (!ctx) {
		return (
			<div className="pktw-p-4">
				<div className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-py-8">
					Open a document first
				</div>
			</div>
		);
	}

	let flatIdx = 0;

	return (
		<div className="pktw-p-4">
			<div className="pktw-flex pktw-justify-between pktw-items-center pktw-mb-4">
				<span className="pktw-text-sm pktw-font-semibold">Copilot</span>
				<span className="pktw-text-xs pktw-text-muted-foreground pktw-font-mono">{ctx.title}</span>
			</div>

			<div className="pktw-flex pktw-flex-col pktw-gap-4">
				{CATEGORIES.map(cat => {
					const actions = registry.getByCategory(cat);
					if (actions.length === 0) return null;
					const meta = CATEGORY_META[cat];
					const CatIcon = meta.icon;

					return (
						<div key={cat}>
							<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2">
								<CatIcon className={cn('pktw-w-3 pktw-h-3', meta.color)} />
								<span className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
									{meta.label}
								</span>
							</div>
							<div className="pktw-grid pktw-grid-cols-3 pktw-gap-2">
								{actions.map(action => {
									const idx = flatIdx++;
									const score = scored.get(action.id) ?? 0;
									const isRecommended = score > 0.7;
									const isSelected = idx === selectedIdx;
									const Icon = action.icon;

									return (
										<div
											key={action.id}
											className={cn(
												'pktw-flex pktw-flex-col pktw-items-center pktw-gap-2 pktw-p-4 pktw-rounded-lg pktw-border pktw-cursor-pointer pktw-transition-all pktw-relative',
												isSelected
													? 'pktw-border-accent pktw-bg-accent/10 pktw-shadow-sm'
													: 'pktw-border-border hover:pktw-border-accent/50 hover:pktw-shadow-sm',
												isRecommended && 'pktw-border-yellow-500/30',
											)}
											onClick={() => onSelect(action)}
											onMouseEnter={() => setSelectedIdx(idx)}
										>
											{isRecommended && (
												<Star className="pktw-w-3 pktw-h-3 pktw-text-yellow-500 pktw-fill-yellow-500 pktw-absolute pktw-top-1.5 pktw-right-1.5" />
											)}
											<Icon className={cn('pktw-w-5 pktw-h-5', meta.color)} />
											<span className="pktw-text-xs pktw-font-medium">{action.label}</span>
											<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-text-center pktw-leading-tight">{action.description}</span>
										</div>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>

			<div className="pktw-flex pktw-gap-3 pktw-justify-center pktw-mt-4 pktw-text-[10px] pktw-text-muted-foreground">
				<span>↑↓←→ navigate</span>
				<span>↵ select</span>
				<span><span className="pktw-text-yellow-500">★</span> recommended</span>
			</div>
		</div>
	);
};

export class CopilotPickerModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(private appContext: AppContext) {
		super(appContext.app);
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-picker-modal');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '520px';
		this.modalEl.style.maxWidth = '90vw';

		const app = this.appContext.app;
		const file = app.workspace.getActiveFile();
		let ctx: DocumentContext | null = null;
		if (file) {
			const content = await app.vault.cachedRead(file);
			const selected = getSelectedTextFromActiveEditor(app) ?? undefined;
			ctx = DocumentContextBuilder.build(app, file, content, selected);
		}

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotPickerContent,
				{
					ctx,
					onSelect: (action: CopilotAction) => {
						this.close();
						(app as any).commands.executeCommandById(`obsidian-peak-assistant:peak-copilot-${action.id}`);
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
