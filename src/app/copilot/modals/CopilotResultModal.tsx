import { Modal, type App } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/app/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type {
	CopilotAction,
	DocumentContext,
	ActionUsage,
	ActionResult,
} from '@/service/copilot/CopilotActionRegistry';
import type { V2ToolStep } from '@/ui/view/quick-search/types/search-steps';
import {
	CopilotResultContent,
	type ModalPhase,
	actionResultData,
	consumeCopilotStream,
	setCurrentSetPhase,
	getCurrentSetPhase,
} from '@/ui/view/copilot/CopilotResultContent';
import { CopilotPickerModal } from '@/app/copilot/modals/CopilotPickerModal';

export interface CopilotResultModalProps {
	action: CopilotAction;
	ctx: DocumentContext;
	initialResult?: ActionResult;
	completedSteps?: V2ToolStep[];
}

export class CopilotResultModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private abortController: AbortController | null = null;

	constructor(app: App, private props: CopilotResultModalProps) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-modal');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '1120px';
		this.modalEl.style.maxWidth = '92vw';
		this.modalEl.style.padding = '0';
		this.contentEl.style.padding = '0';

		this.abortController = new AbortController();
		const initialPhase: ModalPhase = this.props.initialResult
			? this.props.initialResult.type === 'error'
				? { phase: 'error', error: new Error(this.props.initialResult.message) }
				: {
					phase: 'result',
					data: actionResultData(this.props.initialResult),
					usage: this.props.initialResult.usage,
					completedSteps: this.props.completedSteps,
					resultType: this.props.initialResult.type,
				}
			: { phase: 'loading', startTime: Date.now() };
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
					onBack: () => {
						this.abortController?.abort();
						this.close();
						// Modal-class ctor pattern: CopilotPickerModal ctor takes AppContext.
						new CopilotPickerModal(appContext).open();
					},
					onCancel: () => {
						this.abortController?.abort();
						getCurrentSetPhase()?.({ phase: 'cancelled' });
					},
				},
				appContext,
			),
		);

		if (this.props.initialResult) return;

		const { action, ctx } = this.props;
		const guard = action.guard?.(ctx);
		if (guard) {
			this.setError(new Error(guard));
			return;
		}
		const signal = this.abortController.signal;
		const startTime = Date.now();

		(async () => {
			try {
				const generator = action.execute(ctx, signal);
				let lastSteps: V2ToolStep[] = [];
				const result = await consumeCopilotStream(generator, (p) => {
					getCurrentSetPhase()?.(p);
					if (p.phase === 'streaming') lastSteps = p.steps;
				}, startTime, signal);
				if (signal.aborted) return;
				if (result) {
					if (result.type === 'error') {
						this.setError(new Error(result.message));
						return;
					}
					getCurrentSetPhase()?.({
						phase: 'result',
						data: actionResultData(result),
						usage: result.usage,
						completedSteps: lastSteps.length > 0 ? lastSteps : undefined,
						resultType: result.type,
					});
				}
			} catch (err) {
				if (signal.aborted) {
					getCurrentSetPhase()?.({ phase: 'cancelled' });
					return;
				}
				this.setError(err instanceof Error ? err : new Error(String(err)));
			}
		})();
	}

	setResult(data: any, usage?: ActionUsage): void {
		getCurrentSetPhase()?.({ phase: 'result', data, usage, resultType: 'structured' });
	}

	setError(error: Error): void {
		getCurrentSetPhase()?.({ phase: 'error', error });
	}

	onClose(): void {
		this.abortController?.abort();
		this.abortController = null;
		setCurrentSetPhase(null);
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
