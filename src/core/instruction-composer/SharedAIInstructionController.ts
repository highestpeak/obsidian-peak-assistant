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

export interface AIInstructionFileLike {
	name: string;
	type?: string;
	size?: number;
	lastModified?: number;
	arrayBuffer?(): Promise<ArrayBuffer>;
}

async function fileFingerprint(file: AIInstructionFileLike): Promise<string> {
	if (file.arrayBuffer && globalThis.crypto?.subtle) {
		const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
		return [...new Uint8Array(digest)]
			.map((value) => value.toString(16).padStart(2, '0'))
			.join('');
	}
	return [
		file.name,
		file.type ?? '',
		file.size ?? 0,
		file.lastModified ?? 0,
	].join(':');
}

/** Hash-based attachment normalization shared by every instruction consumer. */
export async function normalizeAIInstructionAttachments(
	files: readonly AIInstructionFileLike[],
): Promise<AIInstructionAttachmentRef[]> {
	const normalized: AIInstructionAttachmentRef[] = [];
	const seen = new Set<string>();
	for (const file of files) {
		const hash = await fileFingerprint(file);
		if (seen.has(hash)) continue;
		seen.add(hash);
		normalized.push({
			id: `attachment-${hash.slice(0, 24)}`,
			name: file.name,
			mimeType: file.type || 'application/octet-stream',
			hash,
		});
	}
	return normalized;
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
		private readonly draftKey: string = adapter.surface,
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
		if (this.draft === draft) return;
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
		const hasPayload = Boolean(submission.instruction)
			|| submission.context.length > 0
			|| submission.attachments.length > 0;
		if (!hasPayload || this.composing || this.status === 'submitting' || this.status === 'streaming') {
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

	syncStatus(status: AIInstructionRunStatus, error: string | null = null): void {
		if (this.status === status && this.error === error) return;
		this.status = status;
		this.error = error;
		this.notify();
	}

	recent(limit = 20): readonly string[] {
		return this.draftStore?.recent(this.draftKey, limit) ?? [];
	}

	restoreRecent(index: number): boolean {
		const value = this.recent(index + 1)[index];
		if (value === undefined) return false;
		this.setDraft(value);
		return true;
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
