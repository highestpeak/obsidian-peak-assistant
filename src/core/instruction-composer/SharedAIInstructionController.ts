import type {
	AIInstructionAttachmentRef,
	AIInstructionContextRef,
	AIInstructionDraftStore,
	AIInstructionEnvelope,
	AIInstructionRunStatus,
	AIInstructionSubmission,
	AIInstructionSurfaceAdapter,
} from './types';

export interface AIInstructionControllerSnapshot {
	draft: string;
	status: AIInstructionRunStatus;
	error: string | null;
	composing: boolean;
}

export type AIInstructionKeyAction = 'submit' | 'newline' | 'stop' | 'dismiss' | 'none';

export function resolveAIInstructionKeyAction(input: {
	key: string;
	shiftKey?: boolean;
	composing?: boolean;
	status: AIInstructionRunStatus;
}): AIInstructionKeyAction {
	if (input.composing) return 'none';
	if (input.key === 'Escape') {
		return input.status === 'submitting' || input.status === 'streaming' ? 'stop' : 'dismiss';
	}
	if (input.key !== 'Enter') return 'none';
	return input.shiftKey ? 'newline' : 'submit';
}

export function createAIInstructionSubmission(
	instruction: string,
	context: readonly AIInstructionContextRef[] = [],
	attachments: readonly AIInstructionAttachmentRef[] = [],
	now = Date.now(),
): AIInstructionSubmission {
	return {
		instruction: instruction.trim(),
		context: [...context],
		attachments: [...attachments],
		submittedAt: now,
	};
}

/**
 * Headless shared behavior for every natural-language AI surface. It owns draft,
 * IME and submit/stop state only; each adapter owns domain context and output.
 */
export class SharedAIInstructionController<TContext, TOutput> {
	private draft = '';
	private status: AIInstructionRunStatus = 'idle';
	private error: string | null = null;
	private composing = false;
	private readonly listeners = new Set<(snapshot: AIInstructionControllerSnapshot) => void>();

	constructor(
		private readonly adapter: AIInstructionSurfaceAdapter<TContext, TOutput>,
		private readonly draftStore?: AIInstructionDraftStore,
		private readonly draftKey = adapter.surface,
	) {
		this.draft = draftStore?.load(draftKey) ?? '';
	}

	snapshot(): AIInstructionControllerSnapshot {
		return {
			draft: this.draft,
			status: this.status,
			error: this.error,
			composing: this.composing,
		};
	}

	subscribe(listener: (snapshot: AIInstructionControllerSnapshot) => void): () => void {
		this.listeners.add(listener);
		listener(this.snapshot());
		return () => this.listeners.delete(listener);
	}

	setDraft(draft: string): void {
		this.draft = draft;
		this.draftStore?.save(this.draftKey, draft);
		this.notify();
	}

	setComposing(composing: boolean): void {
		this.composing = composing;
		this.notify();
	}

	async submit(
		context: readonly AIInstructionContextRef[] = [],
		attachments: readonly AIInstructionAttachmentRef[] = [],
	): Promise<TOutput | null> {
		const submission = createAIInstructionSubmission(this.draft, context, attachments);
		if (!submission.instruction || this.composing || this.status === 'submitting' || this.status === 'streaming') {
			return null;
		}
		this.status = 'submitting';
		this.error = null;
		this.notify();
		const envelope: AIInstructionEnvelope<TContext> = {
			surface: this.adapter.surface,
			capabilityId: this.adapter.capabilityId,
			submission,
			surfaceContext: this.adapter.context(),
		};
		try {
			const output = await this.adapter.submit(envelope);
			this.draftStore?.record(this.draftKey, submission.instruction);
			this.draftStore?.clear(this.draftKey);
			this.draft = '';
			this.status = 'idle';
			this.notify();
			return output;
		} catch (error) {
			this.status = 'error';
			this.error = error instanceof Error ? error.message : String(error);
			this.notify();
			throw error;
		}
	}

	async stop(): Promise<void> {
		await this.adapter.stop?.();
		this.status = 'idle';
		this.notify();
	}

	retry(): void {
		if (this.status !== 'error') return;
		this.status = 'idle';
		this.error = null;
		this.notify();
	}

	private notify(): void {
		const snapshot = this.snapshot();
		for (const listener of this.listeners) listener(snapshot);
	}
}
