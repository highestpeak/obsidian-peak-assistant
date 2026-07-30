export type AIInstructionSurface =
	| 'chat'
	| 'composer'
	| 'ai-search'
	| 'ai-graph'
	| 'vault-intelligence';
export type AIInstructionRunStatus = 'idle' | 'submitting' | 'streaming' | 'error';

export interface AIInstructionContextRef {
	id: string;
	kind: 'vault-file' | 'vault-block' | 'selection' | 'artifact' | 'custom';
	label: string;
	source: 'explicit' | 'automatic';
}

export interface AIInstructionAttachmentRef {
	id: string;
	name: string;
	mimeType: string;
	hash?: string;
}

export interface AIInstructionSubmission {
	instruction: string;
	context: readonly AIInstructionContextRef[];
	attachments: readonly AIInstructionAttachmentRef[];
	submittedAt: number;
}

export interface AIInstructionEnvelope<TContext = unknown> {
	surface: AIInstructionSurface;
	capabilityId: string;
	submission: AIInstructionSubmission;
	surfaceContext: TContext;
}

export interface AIInstructionSubmitReceipt {
	runId: string;
	surface: AIInstructionSurface;
	capabilityId: string;
	submittedAt: number;
}

export interface AIInstructionSurfaceAdapter<TContext, TOutput> {
	readonly surface: AIInstructionSurface;
	readonly capabilityId: string;
	readonly placeholder: string;
	context(): TContext;
	submit(envelope: AIInstructionEnvelope<TContext>): Promise<TOutput>;
	stop?(): void | Promise<void>;
}

export interface AIInstructionDraftStore {
	load(key: string): string | null;
	save(key: string, value: string): void;
	clear(key: string): void;
	recent(key: string, limit: number): readonly string[];
	record(key: string, instruction: string): void;
}
