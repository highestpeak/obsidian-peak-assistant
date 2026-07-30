import type {
	ComposerCandidate,
	ComposerCandidateRuntimePort,
	ComposerCandidateRuntimeSnapshot,
	ComposerCapabilityRunEvent,
	ComposerInvocationHandle,
	ComposerRendererId,
} from '@/core/composer';
import { CompositeComposerCandidateRuntime } from '@/app/composer/CompositeComposerCandidateRuntime';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

class FakeRuntime implements ComposerCandidateRuntimePort {
	readonly calls: string[] = [];

	constructor(
		private readonly rendererById: Record<string, string>,
		private readonly label: string,
	) {}

	subscribe(cb: (candidates: readonly ComposerCandidate[]) => void): () => void {
		cb([]);
		return () => undefined;
	}

	onRunEvent(_cb: (event: ComposerCapabilityRunEvent) => void): () => void {
		return () => undefined;
	}

	rendererIdFor(candidateId: string): ComposerRendererId | null {
		return (this.rendererById[candidateId] as ComposerRendererId | undefined) ?? null;
	}

	candidateLabelFor(candidateId: string): string | null {
		return this.rendererIdFor(candidateId) ? this.label : null;
	}

	regenerate(candidateId: string): ComposerInvocationHandle {
		this.calls.push(`regenerate:${candidateId}`);
		return { runId: candidateId, cancel: () => undefined };
	}

	cancel(candidateId: string): void {
		this.calls.push(`cancel:${candidateId}`);
	}

	isStreaming(candidateId: string): boolean {
		this.calls.push(`streaming:${candidateId}`);
		return true;
	}

	async accept(candidateId: string): Promise<void> {
		this.calls.push(`accept:${candidateId}`);
	}

	discard(candidateId: string): void {
		this.calls.push(`discard:${candidateId}`);
	}

	setActiveVariant(candidateId: string, variantId: string): void {
		this.calls.push(`variant:${candidateId}:${variantId}`);
	}

	exportCandidateRuntimeState(
		candidateId: string,
	): ComposerCandidateRuntimeSnapshot | null {
		const rendererId = this.rendererIdFor(candidateId);
		if (!rendererId) return null;
		return {
			ownerId: this.label === 'Image' ? 'image' : 'capability',
			rendererId,
			label: this.label,
			payload: { candidateId },
		};
	}

	restoreCandidateRuntimeState(
		candidate: ComposerCandidate,
		snapshot: ComposerCandidateRuntimeSnapshot,
	): boolean {
		const expectedOwner = this.label === 'Image' ? 'image' : 'capability';
		if (snapshot.ownerId !== expectedOwner) return false;
		this.calls.push(`restore:${candidate.candidateId}`);
		return true;
	}
}

async function main(): Promise<void> {
	const primary = new FakeRuntime({ text: 'composer.renderer.streaming-text' }, 'Text');
	const image = new FakeRuntime({ image: 'composer.renderer.image-asset' }, 'Image');
	const runtime = new CompositeComposerCandidateRuntime(primary, image);

	check('generic renderer remains owned by primary', runtime.rendererIdFor('text') === 'composer.renderer.streaming-text');
	check('image renderer is resolved from image runtime', runtime.rendererIdFor('image') === 'composer.renderer.image-asset');
	check('image label is routed to image runtime', runtime.candidateLabelFor('image') === 'Image');
	check('generic label is routed to primary runtime', runtime.candidateLabelFor('text') === 'Text');

	runtime.regenerate('image');
	await runtime.accept('image');
	runtime.discard('text');
	runtime.setActiveVariant('image', 'v2');
	check(
		'image review actions route to image runtime',
		image.calls.includes('regenerate:image') &&
			image.calls.includes('accept:image') &&
			image.calls.includes('variant:image:v2'),
	);
	check('generic review actions remain on primary runtime', primary.calls.includes('discard:text'));
	check(
		'persisted image review state exports from the image owner',
		runtime.exportCandidateRuntimeState('image')?.ownerId === 'image',
	);
	check(
		'persisted generic review state exports from the capability owner',
		runtime.exportCandidateRuntimeState('text')?.ownerId === 'capability',
	);
	const restored = {
		candidateId: 'restored',
		target: { kind: 'document' },
		baseRevision: 'rev',
		status: 'ready',
		variants: [],
		activeVariantId: 'variant',
		proposedChange: { operations: [] },
	} as unknown as ComposerCandidate;
	check(
		'image-owned persisted state restores through the image runtime',
		runtime.restoreCandidateRuntimeState(restored, {
			ownerId: 'image',
			rendererId: 'composer.renderer.image-asset',
			payload: {},
		}) === true && image.calls.includes('restore:restored'),
	);
	done('composer-image-candidate-routing');
}

void main();
