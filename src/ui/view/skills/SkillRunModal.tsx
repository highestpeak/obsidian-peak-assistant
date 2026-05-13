import { Modal, Notice, TFile } from 'obsidian';
import React, { useEffect, useRef, useState } from 'react';
import {
	AlertTriangle,
	Activity,
	Ban,
	CheckCircle2,
	Circle,
	Copy,
	Layers,
	Loader2,
	Inbox,
	Wrench,
	X,
} from 'lucide-react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { SkillExecutor } from '@/service/skills/SkillExecutor';
import { openGapAnalysis, openVaultXRay } from '@/app/commands/PeakCommandActions';
import { CopilotActionRegistry, type DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { registerAllCopilotActions } from '@/service/copilot/actions';
import { CopilotResultModal } from '@/ui/view/copilot/CopilotResultModal';
import { Button } from '@/ui/component/shared-ui/button';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { SkillDefinition, SkillExecutionResult } from '@/service/skills/types';

interface SkillRunModalProps {
	skill: SkillDefinition;
	inputs: Record<string, string>;
}

interface SkillToolStep {
	id: string;
	toolName: string;
	input: Record<string, unknown>;
	status: 'running' | 'done' | 'error';
	startedAt: number;
	endedAt?: number;
	summary?: string;
}

type SkillRunPhase =
	| 'loading'
	| 'streaming'
	| 'result'
	| 'cancelled'
	| 'error';

interface SkillRunState {
	phase: SkillRunPhase;
	output: string;
	reasoning: string;
	steps: SkillToolStep[];
	currentPhase?: string;
	usage?: SkillExecutionResult['usage'];
	error?: Error;
	startTime: number;
}

function formatToolName(toolName: string): string {
	const raw = toolName
		.replace(/^mcp__skill__/, '')
		.replace(/^mcp__vault__/, '')
		.replace(/_/g, ' ');
	return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function stringifyToolSummary(output: unknown): string {
	if (typeof output === 'string') return output.slice(0, 180);
	if (Array.isArray(output)) {
		return output
			.map((item: any) => typeof item?.text === 'string' ? item.text : JSON.stringify(item))
			.join('\n')
			.slice(0, 180);
	}
	if (output && typeof output === 'object') return JSON.stringify(output).slice(0, 180);
	return '';
}

function updateStep(
	steps: SkillToolStep[],
	id: string,
	updater: (step: SkillToolStep) => SkillToolStep,
): SkillToolStep[] {
	return steps.map((step) => step.id === id ? updater(step) : step);
}

const ToolStepsView: React.FC<{ steps: SkillToolStep[] }> = ({ steps }) => {
	if (steps.length === 0) return null;
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-rounded-md pktw-border pktw-border-border pktw-p-2">
			{steps.map((step) => {
				const Icon = step.status === 'running' ? Loader2 : step.status === 'done' ? CheckCircle2 : AlertTriangle;
				return (
					<div key={step.id} className="pktw-flex pktw-items-start pktw-gap-2 pktw-text-xs">
						<Icon className={step.status === 'running' ? 'pktw-mt-0.5 pktw-h-3.5 pktw-w-3.5 pktw-shrink-0 pktw-animate-spin pktw-text-accent' : 'pktw-mt-0.5 pktw-h-3.5 pktw-w-3.5 pktw-shrink-0 pktw-text-muted-foreground'} />
						<div className="pktw-flex pktw-min-w-0 pktw-flex-col">
							<span className="pktw-font-medium pktw-text-foreground">{formatToolName(step.toolName)}</span>
							{step.summary && (
								<span className="pktw-line-clamp-2 pktw-text-muted-foreground">{step.summary}</span>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
};

const SkillRunContent: React.FC<{
	skill: SkillDefinition;
	inputs: Record<string, string>;
	onClose: () => void;
}> = ({ skill, inputs, onClose }) => {
	const abortRef = useRef<AbortController | null>(null);
	const [elapsed, setElapsed] = useState(0);
	const [copied, setCopied] = useState(false);
	const [state, setState] = useState<SkillRunState>({
		phase: 'loading',
		output: '',
		reasoning: '',
		steps: [],
		startTime: Date.now(),
	});

	useEffect(() => {
		const timer = window.setInterval(() => {
			setElapsed(Math.floor((Date.now() - state.startTime) / 1000));
		}, 1000);
		return () => window.clearInterval(timer);
	}, [state.startTime]);

	useEffect(() => {
		const controller = new AbortController();
		let active = true;
		let generator: AsyncGenerator<LLMStreamEvent, SkillExecutionResult | void> | null = null;
		abortRef.current = controller;
		const setRunState: typeof setState = (next) => {
			if (active) setState(next);
		};

		void (async () => {
			const executor = new SkillExecutor();
			generator = executor.execute(skill, {
				skillId: skill.id,
				inputs,
				signal: controller.signal,
			});

			try {
				while (true) {
					if (controller.signal.aborted) {
						setRunState((prev) => ({ ...prev, phase: 'cancelled' }));
						return;
					}

					const { value, done } = await generator.next();
					if (done) {
						const result = value as SkillExecutionResult | void;
						setRunState((prev) => ({
							...prev,
							phase: 'result',
							output: result?.output || prev.output,
							usage: result?.usage,
						}));
						return;
					}

					const event = value as LLMStreamEvent;
					setRunState((prev) => reduceSkillEvent(prev, event));
				}
			} catch (error) {
				if (controller.signal.aborted) {
					setRunState((prev) => ({ ...prev, phase: 'cancelled' }));
					return;
				}
				setRunState((prev) => ({
					...prev,
					phase: 'error',
					error: error instanceof Error ? error : new Error(String(error)),
				}));
			}
		})();

		return () => {
			active = false;
			controller.abort();
			void generator?.return?.();
			abortRef.current = null;
		};
	}, [skill, inputs]);

	const cancel = () => {
		abortRef.current?.abort();
		setState((prev) => ({ ...prev, phase: 'cancelled' }));
	};

	const copyOutput = async () => {
		if (!state.output) return;
		await navigator.clipboard?.writeText(state.output);
		setCopied(true);
		window.setTimeout(() => setCopied(false), 1200);
	};

	const fileWithCopilot = async () => {
		if (!state.output.trim()) return;
		try {
			const app = AppContext.getInstance().app;
			const registry = CopilotActionRegistry.getInstance();
			if (!registry.get('detect-and-file')) registerAllCopilotActions();
			const action = registry.get('detect-and-file');
			if (!action) {
				new Notice('Detect & File action is not available.');
				return;
			}
			const ctx = await buildSkillResultContext(skill, state.output);
			new CopilotResultModal(app, { action, ctx }).open();
		} catch (error) {
			new Notice(`Failed to start Copilot filing: ${(error as Error).message}`);
		}
	};

	const isRunning = state.phase === 'loading' || state.phase === 'streaming';
	const showVaultHealthActions = skill.id === 'vault-health-check';
	const titleIcon = state.phase === 'result' ? CheckCircle2
		: state.phase === 'error' ? AlertTriangle
			: state.phase === 'cancelled' ? Ban
				: Loader2;
	const TitleIcon = titleIcon;

	return (
		<div className="pktw-flex pktw-max-h-[78vh] pktw-flex-col">
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-border-b pktw-border-border pktw-px-4 pktw-py-3">
					<div className="pktw-flex pktw-min-w-0 pktw-items-center pktw-gap-2">
						<TitleIcon className={isRunning ? 'pktw-h-4 pktw-w-4 pktw-shrink-0 pktw-animate-spin pktw-text-accent' : 'pktw-h-4 pktw-w-4 pktw-shrink-0 pktw-text-accent'} />
						<span className="pktw-truncate pktw-text-sm pktw-font-semibold">{skill.name}</span>
					<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-font-mono">{elapsed}s</span>
				</div>
				<div className="pktw-flex pktw-items-center pktw-gap-1">
					{state.output && (
						<Button variant="ghost" size="sm" onClick={copyOutput} className="pktw-gap-1">
							<Copy className="pktw-h-3.5 pktw-w-3.5" />
							<span>{copied ? 'Copied' : 'Copy'}</span>
						</Button>
					)}
					{isRunning && (
						<Button variant="ghost" size="sm" onClick={cancel} className="pktw-gap-1">
							<X className="pktw-h-3.5 pktw-w-3.5" />
							<span>Cancel</span>
						</Button>
					)}
					<Button variant="ghost" size="sm" onClick={onClose}>
						<X className="pktw-h-3.5 pktw-w-3.5" />
					</Button>
				</div>
			</div>

			<div className="pktw-flex pktw-flex-1 pktw-flex-col pktw-gap-3 pktw-overflow-y-auto pktw-p-4">
				{state.currentPhase && (
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-muted-foreground">
						<Circle className="pktw-h-2.5 pktw-w-2.5 pktw-fill-current" />
						<span>Phase: {state.currentPhase}</span>
					</div>
				)}

				<ToolStepsView steps={state.steps} />

				{state.phase === 'loading' && (
					<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-3 pktw-py-10">
						<Loader2 className="pktw-h-8 pktw-w-8 pktw-animate-spin pktw-text-accent" />
						<span className="pktw-text-sm pktw-font-medium">Starting skill...</span>
						<span className="pktw-text-xs pktw-text-muted-foreground">Preparing tools and agent profile</span>
					</div>
				)}

				{state.phase === 'cancelled' && (
					<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-3 pktw-py-10">
						<Ban className="pktw-h-8 pktw-w-8 pktw-text-muted-foreground" />
						<span className="pktw-text-sm pktw-font-medium">Cancelled</span>
					</div>
				)}

				{state.phase === 'error' && state.error && (
					<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-3 pktw-py-10">
						<AlertTriangle className="pktw-h-8 pktw-w-8 pktw-text-destructive" />
						<span className="pktw-text-sm pktw-font-medium">Skill failed</span>
						<span className="pktw-max-w-lg pktw-text-center pktw-text-xs pktw-text-muted-foreground">{state.error.message}</span>
					</div>
				)}

				{state.reasoning && (
					<div className="pktw-rounded-md pktw-border pktw-border-border pktw-bg-muted/30 pktw-p-3">
						<div className="pktw-mb-1 pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-xs pktw-font-medium pktw-text-muted-foreground">
							<Wrench className="pktw-h-3.5 pktw-w-3.5" />
							<span>Reasoning</span>
						</div>
						<div className="pktw-max-h-32 pktw-overflow-y-auto pktw-whitespace-pre-wrap pktw-text-xs pktw-text-muted-foreground">
							{state.reasoning}
						</div>
					</div>
				)}

				{state.output && (
					<div className="pktw-rounded-md pktw-border pktw-border-border pktw-p-3">
						<StreamdownIsolated
							isAnimating={isRunning}
							className="pktw-select-text pktw-break-words pktw-text-sm pktw-leading-6"
						>
							{state.output}
						</StreamdownIsolated>
					</div>
				)}

				{state.phase === 'result' && !state.output && (
					<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-2 pktw-py-10">
						<CheckCircle2 className="pktw-h-8 pktw-w-8 pktw-text-accent" />
						<span className="pktw-text-sm pktw-font-medium">Skill completed</span>
						<span className="pktw-text-xs pktw-text-muted-foreground">No text output was returned.</span>
					</div>
				)}
			</div>

			{state.output && (
				<div className="pktw-flex pktw-flex-wrap pktw-items-center pktw-justify-between pktw-gap-2 pktw-border-t pktw-border-border pktw-px-4 pktw-py-3">
					<div className="pktw-flex pktw-flex-wrap pktw-gap-2">
						<Button variant="outline" size="sm" onClick={fileWithCopilot} disabled={isRunning} className="pktw-gap-1.5">
							<Inbox className="pktw-h-3.5 pktw-w-3.5" />
							<span>File with Copilot</span>
						</Button>
						<Button variant="ghost" size="sm" onClick={copyOutput} className="pktw-gap-1.5">
							<Copy className="pktw-h-3.5 pktw-w-3.5" />
							<span>{copied ? 'Copied' : 'Copy markdown'}</span>
						</Button>
						{showVaultHealthActions && (
							<>
								<Button variant="ghost" size="sm" onClick={() => void openVaultXRay()} disabled={isRunning} className="pktw-gap-1.5">
									<Activity className="pktw-h-3.5 pktw-w-3.5" />
									<span>Vault X-Ray</span>
								</Button>
								<Button variant="ghost" size="sm" onClick={() => openGapAnalysis()} disabled={isRunning} className="pktw-gap-1.5">
									<Layers className="pktw-h-3.5 pktw-w-3.5" />
									<span>Gap Analysis</span>
								</Button>
							</>
						)}
					</div>
					<span className="pktw-text-[10px] pktw-text-muted-foreground">
						{state.usage ? `${state.usage.durationMs.toLocaleString()} ms` : isRunning ? 'Running' : 'Done'}
					</span>
				</div>
			)}
		</div>
	);
};

function reduceSkillEvent(prev: SkillRunState, event: LLMStreamEvent): SkillRunState {
	if (event.type === 'text-delta') {
		return {
			...prev,
			phase: 'streaming',
			output: prev.output + ((event as any).text ?? ''),
		};
	}
	if (event.type === 'reasoning-delta') {
		return {
			...prev,
			phase: 'streaming',
			reasoning: prev.reasoning + ((event as any).text ?? ''),
		};
	}
	if (event.type === 'tool-call') {
		const id = String((event as any).id ?? `${Date.now()}-${prev.steps.length}`);
		const toolName = String((event as any).toolName ?? 'tool');
		return {
			...prev,
			phase: 'streaming',
			steps: [
				...prev.steps,
				{
					id,
					toolName,
					input: ((event as any).input ?? {}) as Record<string, unknown>,
					status: 'running',
					startedAt: Date.now(),
				},
			],
		};
	}
	if (event.type === 'tool-result') {
		const id = String((event as any).id ?? '');
		return {
			...prev,
			phase: 'streaming',
			steps: updateStep(prev.steps, id, (step) => ({
				...step,
				status: 'done',
				endedAt: Date.now(),
				summary: stringifyToolSummary((event as any).output),
			})),
		};
	}
	if (event.type === 'pk-debug' && (event as any).debugName?.startsWith('skill-phase-')) {
		return {
			...prev,
			phase: 'streaming',
			currentPhase: String((event as any).extra?.phase ?? ''),
		};
	}
	if (event.type === 'complete') {
		return { ...prev, phase: 'streaming' };
	}
	if (event.type === 'error') {
		const error = (event as any).error;
		return {
			...prev,
			phase: 'error',
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
	return prev.phase === 'loading' ? { ...prev, phase: 'streaming' } : prev;
}

async function buildSkillResultContext(skill: SkillDefinition, output: string): Promise<DocumentContext> {
	const app = AppContext.getInstance().app;
	const activeFile = app.workspace.getActiveFile();
	const file = activeFile ?? ({
		path: `Skill Results/${skill.id}.md`,
		name: `${skill.name}.md`,
		basename: skill.name,
		extension: 'md',
	} as TFile);
	const content = activeFile ? await app.vault.cachedRead(activeFile) : output;
	return {
		file,
		title: `Skill result: ${skill.name}`,
		content,
		selection: output,
		scope: 'selection',
		wordCount: output.split(/\s+/).filter(Boolean).length,
		tags: skill.tags,
		links: [],
		backlinks: 0,
		headingCount: 0,
		isOrphan: false,
		frontmatter: {
			source: 'peak-skill',
			skillId: skill.id,
		},
	};
}

export class SkillRunModal extends Modal {
	private renderer: ReactRenderer | null = null;
	private readonly appContext: AppContext;

	constructor(appContext: AppContext, private readonly props: SkillRunModalProps) {
		super(appContext.app);
		this.appContext = appContext;
		this.modalEl.addClass('peak-skill-run-modal');
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '760px';
		this.modalEl.style.maxWidth = '92vw';
		this.renderer = new ReactRenderer(this.containerEl);
		this.renderer.render(
			createReactElementWithServices(
				SkillRunContent,
				{
					skill: this.props.skill,
					inputs: this.props.inputs,
					onClose: () => this.close(),
				},
				this.appContext,
			),
		);
	}

	onClose(): void {
		if (this.renderer) {
			this.renderer.unmount();
			this.renderer = null;
		}
		this.contentEl.empty();
	}
}
