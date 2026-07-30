import type {
	ComposerCandidate,
	ComposerCandidateRuntimePort,
	ComposerCandidateRuntimeSnapshot,
	ComposerCapabilityRunEvent,
	ComposerCapabilityEffectKind,
	ComposerInvocationHandle,
	ComposerRendererId,
} from '@/core/composer';

/**
 * App-owned candidate router for one document.
 *
 * The generic capability runtime and the image coordinator intentionally keep
 * separate execution models, but they share one transaction hub. The UI must
 * still see one candidate runtime so renderer lookup and review actions are
 * routed back to the runtime that created each candidate.
 */
export class CompositeComposerCandidateRuntime implements ComposerCandidateRuntimePort {
	constructor(
		private readonly primary: ComposerCandidateRuntimePort,
		private readonly image: ComposerCandidateRuntimePort,
	) {}

	subscribe(cb: (candidates: readonly ComposerCandidate[]) => void): () => void {
		// Both runtimes subscribe to the same hub. Use one subscription to avoid
		// duplicate React updates while still receiving every pending candidate.
		return this.primary.subscribe(cb);
	}

	onRunEvent(cb: (event: ComposerCapabilityRunEvent) => void): () => void {
		const offPrimary = this.primary.onRunEvent(cb);
		const offImage = this.image.onRunEvent(cb);
		return () => {
			offPrimary();
			offImage();
		};
	}

	rendererIdFor(candidateId: string): ComposerRendererId | null {
		return this.image.rendererIdFor(candidateId) ?? this.primary.rendererIdFor(candidateId);
	}

	candidateEffectFor(candidateId: string): ComposerCapabilityEffectKind | null {
		return (
			this.image.candidateEffectFor?.(candidateId)
			?? this.primary.candidateEffectFor?.(candidateId)
			?? null
		);
	}

	candidateLabelFor(candidateId: string): string | null {
		const imageLabel = this.image.candidateLabelFor?.(candidateId);
		return imageLabel ?? this.primary.candidateLabelFor?.(candidateId) ?? null;
	}

	regenerate(candidateId: string, instruction?: string): ComposerInvocationHandle {
		return this.owner(candidateId).regenerate(candidateId, instruction);
	}

	rerunStale(candidateId: string): ComposerInvocationHandle | null {
		const owner = this.owner(candidateId);
		return owner.rerunStale?.(candidateId) ?? null;
	}

	cancel(candidateId: string): void {
		this.owner(candidateId).cancel(candidateId);
	}

	isStreaming(candidateId: string): boolean {
		return this.owner(candidateId).isStreaming(candidateId);
	}

	accept(candidateId: string): Promise<void> {
		return this.owner(candidateId).accept(candidateId);
	}

	discard(candidateId: string): void {
		this.owner(candidateId).discard(candidateId);
	}

	setActiveVariant(candidateId: string, variantId: string): void {
		this.owner(candidateId).setActiveVariant(candidateId, variantId);
	}

	exportCandidateRuntimeState(
		candidateId: string,
	): ComposerCandidateRuntimeSnapshot | null {
		return (
			this.image.exportCandidateRuntimeState?.(candidateId)
			?? this.primary.exportCandidateRuntimeState?.(candidateId)
			?? null
		);
	}

	restoreCandidateRuntimeState(
		candidate: ComposerCandidate,
		snapshot: ComposerCandidateRuntimeSnapshot,
	): boolean {
		const owner = snapshot.ownerId === 'image' ? this.image : this.primary;
		return owner.restoreCandidateRuntimeState?.(candidate, snapshot) ?? false;
	}

	private owner(candidateId: string): ComposerCandidateRuntimePort {
		if (this.image.rendererIdFor(candidateId)) return this.image;
		return this.primary;
	}
}
