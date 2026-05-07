// src/ui/view/copilot/CopilotResultModal.tsx
import { Modal, type App } from 'obsidian';
import React, { useState, useEffect } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { AuthenticationError } from '@/core/errors/llm-errors';
import { Loader2, AlertTriangle, Settings2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { CopilotAction, DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface CopilotResultModalProps {
	action: CopilotAction;
	ctx: DocumentContext;
}

type ModalPhase =
	| { phase: 'loading'; progressText?: string; startTime: number }
	| { phase: 'result'; data: any }
	| { phase: 'error'; error: Error };

const LoadingView: React.FC<{ label: string; startTime: number; progressText?: string }> = ({ label, startTime, progressText }) => {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
		return () => clearInterval(timer);
	}, [startTime]);
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
			<Loader2 className="pktw-w-8 pktw-h-8 pktw-animate-spin pktw-text-accent" />
			<span className="pktw-text-sm pktw-font-medium">{label}...</span>
			<span className="pktw-text-xs pktw-text-muted-foreground">{elapsed}s</span>
			{progressText && (
				<div className="pktw-w-full pktw-max-h-[200px] pktw-overflow-y-auto pktw-mt-4 pktw-px-4 pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap">
					{progressText}
				</div>
			)}
		</div>
	);
};

const ErrorView: React.FC<{ error: Error; onClose: () => void }> = ({ error, onClose }) => {
	const isAuth = error instanceof AuthenticationError;
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
			<AlertTriangle className="pktw-w-8 pktw-h-8 pktw-text-destructive" />
			<span className="pktw-text-sm pktw-font-medium">Something went wrong</span>
			<span className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-max-w-md">{error.message}</span>
			<div className="pktw-flex pktw-gap-2 pktw-mt-2">
				{isAuth && (
					<Button variant="outline" size="sm" onClick={() => {
						const { SettingsModal } = require('@/ui/view/SettingsModal');
						new SettingsModal(AppContext.getInstance()).open();
					}}>
						<Settings2 className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
						Open Settings
					</Button>
				)}
				<Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
			</div>
		</div>
	);
};

let _currentSetPhase: ((phase: ModalPhase) => void) | null = null;

const CopilotResultContent: React.FC<{
	action: CopilotAction;
	ctx: DocumentContext;
	initialPhase: ModalPhase;
	onClose: () => void;
}> = ({ action, ctx, initialPhase, onClose }) => {
	const [phase, setPhase] = useState<ModalPhase>(initialPhase);

	useEffect(() => {
		_currentSetPhase = setPhase;
		return () => { _currentSetPhase = null; };
	}, []);

	if (phase.phase === 'loading') {
		return <LoadingView label={action.label} startTime={phase.startTime} progressText={phase.progressText} />;
	}
	if (phase.phase === 'error') {
		return <ErrorView error={phase.error} onClose={onClose} />;
	}

	const Panel = action.ResultPanel;
	return (
		<Panel
			result={phase.data}
			ctx={ctx}
			file={ctx.file}
			scope={ctx.scope}
			originalContent={ctx.content}
			selectedText={ctx.selection}
			onClose={onClose}
		/>
	);
};

export class CopilotResultModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private props: CopilotResultModalProps) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-modal');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '720px';
		this.modalEl.style.maxWidth = '90vw';

		const initialPhase: ModalPhase = { phase: 'loading', startTime: Date.now() };
		const appContext = AppContext.getInstance();

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotResultContent,
				{
					action: this.props.action,
					ctx: this.props.ctx,
					initialPhase,
					onClose: () => this.close(),
				},
				appContext,
			),
		);
	}

	setResult(data: any): void {
		_currentSetPhase?.({ phase: 'result', data });
	}

	setError(error: Error): void {
		_currentSetPhase?.({ phase: 'error', error });
	}

	updateProgress(text: string): void {
		_currentSetPhase?.({ phase: 'loading', progressText: text, startTime: Date.now() });
	}

	onClose(): void {
		_currentSetPhase = null;
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
