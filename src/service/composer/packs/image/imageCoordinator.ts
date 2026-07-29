/**
 * Peak Composer — image asset coordinator (WP7, CMP-IMG-01/02/03/04/06/07).
 *
 * The per-document runtime for image-asset candidates — the flows that do NOT
 * fit the WP3 text model-stream runtime:
 *   - paste bitmap → save attachment → semantic rename review (versions as
 *     candidate variants) → accept = physical rename (if needed) + atomic
 *     insertion commit through the WP2 hub;
 *   - AI 改图 (media generation) → variants / follow-up / history / accept one;
 *   - Converter output → new asset + reference replacement (non-destructive),
 *     or a confirmed reversible overwrite of the original.
 *
 * It implements the frozen {@link ComposerCandidateRuntimePort} so the existing
 * candidate host + variant navigation drive the review, plus imperative entry
 * methods the block chrome calls to START a flow. Caption + layout-suggest are
 * NOT here — they are model-stream capabilities on the shared WP3 runtime.
 *
 * Ownership: created per (session, hub) by the app composition; injected ports
 * only, no module singletons, no Obsidian import.
 */

import {
	ComposerConflictError,
	composerTargetBlockId,
	type ComposerCandidate,
	type ComposerCandidateRuntimePort,
	type ComposerCapabilityRunEvent,
	type ComposerInvocationHandle,
	type ComposerOperation,
	type ComposerRendererId,
	type ComposerResultEnvelope,
	type ComposerTarget,
} from '@/core/composer';
import {
	ComposerImageAssetCandidatePayloadSchema,
	type ComposerImageAssetCandidatePayload,
	type ComposerImageAssetIntent,
} from '@/core/schemas/composer';
import type { ComposerDocumentSession } from '../../documentSession';
import type { ComposerTransactionHub } from '../../transactionHub';
import {
	COMPOSER_IMAGE_ANNOTATION_RENDERER_ID,
	COMPOSER_IMAGE_ANNOTATION_WRITEBACK_ID,
	COMPOSER_IMAGE_ASSET_RENDERER_ID,
	COMPOSER_IMAGE_LAYOUT_RENDERER_ID,
	COMPOSER_IMAGE_LAYOUT_WRITEBACK_ID,
} from './dispatchIds';
import { buildFileNameVersions, dedupeAttachmentPath, extensionForMime } from './imageNaming';
import {
	buildImageEmbed,
	planImageInsertAfterBlock,
	planImageSplitInsert,
	planReferenceRewrite,
	type ImageInsertionPlan,
} from './imageTransaction';
import { applyCaption } from './imageCaption';
import { planLayoutInsert, planLayoutReplace, renderLayoutHtml } from './imageLayout';
import {
	ComposerImageAnnotationPatchPayloadSchema,
	ComposerImageLayoutPatchPayloadSchema,
	ComposerImageLayoutSpecSchema,
	type ComposerImageLayoutSpec,
} from '@/core/schemas/composer';
import type {
	ComposerImageAttachmentPort,
	ComposerImageEditPort,
	ComposerImageReferencePort,
	ComposerImageTextPort,
} from './ports';
import type { ImageDomainConfigProvider } from './imageConfig';
import { DEFAULT_IMAGE_DOMAIN_CONFIG } from './imageConfig';

/** Where a pasted image goes in the document. */
export type ImageInsertionTarget =
	| { kind: 'after-block'; blockId: string | null }
	| { kind: 'split'; blockId: string; offset: number };

export interface ImagePasteInput {
	bytes: Uint8Array;
	mimeType: string;
	/** Original clipboard filename, if any (host-generated names get cleaned). */
	rawName?: string;
	width?: number;
	height?: number;
	/** Semantic name suggestions (e.g. from an AI describe pass). */
	nameSuggestions?: string[];
	insertion: ImageInsertionTarget;
}

export interface ImageConvertInput {
	/** The already-encoded converted bytes (from the Canvas render). */
	bytes: Uint8Array;
	mimeType: string;
	width?: number;
	height?: number;
	/** Base name suggestion for the new asset. */
	baseName?: string;
	/** The existing image block whose reference is replaced. */
	replaceBlockId: string;
	/** Path of the original asset (kept unchanged unless overwrite is used). */
	originalPath: string;
}

export interface ImageAiEditInput {
	instruction: string;
	/** The image block being edited. */
	target: ComposerTarget;
	/** Vault path of the source image (base for the edit). */
	sourcePath: string;
	variants?: number;
}

export interface ImageRenameInput {
	sourcePath: string;
	blockId: string;
	desiredBaseName: string;
	width?: number;
	height?: number;
}

interface VariantPlan {
	/** Final vault path this variant's embed points at (asset flows only). */
	assetPath?: string;
	/** Base name (no extension) proposed for this variant (asset flows only). */
	baseName?: string;
	operations: ComposerOperation[];
	blockDelta: number;
	envelope: ComposerResultEnvelope;
	historyLabel: string;
}

type ImageFlowKind = 'paste' | 'convert' | 'rename' | 'ai-edit' | 'caption' | 'layout';

interface AssetCandidateMeta {
	flow: ImageFlowKind;
	/** Renderer the candidate dispatches to. */
	rendererId: ComposerRendererId;
	/** Physical path currently written on disk (asset flows). */
	savedPath: string;
	extension: string;
	mimeType: string;
	width?: number;
	height?: number;
	/** paste/convert insertion target (undefined for ai-edit which replaces a ref). */
	insertion?: ImageInsertionTarget;
	/** ai-edit source path + document target. */
	editSourcePath?: string;
	editTarget?: ComposerTarget;
	/** caption/layout context (block source or layout items JSON). */
	textContext?: string;
	/** Frozen source range of the targeted block (caption / layout-replace). */
	anchor?: { from: number; to: number };
	lastInstruction?: string;
	/** Per-variant plan (keyed by variantId). */
	plans: Map<string, VariantPlan>;
}

let assetRunSeq = 0;
function nextRunId(): string {
	assetRunSeq += 1;
	return `cmp-img-${Date.now().toString(36)}-${assetRunSeq.toString(36)}`;
}

export interface ImageCoordinatorDeps {
	session: ComposerDocumentSession;
	hub: ComposerTransactionHub;
	attachment: ComposerImageAttachmentPort;
	reference: ComposerImageReferencePort;
	edit: ComposerImageEditPort;
	/** Caption / smart-layout text completion (optional — those flows no-op without it). */
	text?: ComposerImageTextPort;
	config?: ImageDomainConfigProvider;
}

export class ImageCapabilityCoordinator implements ComposerCandidateRuntimePort {
	private readonly meta = new Map<string, AssetCandidateMeta>();
	private readonly streaming = new Set<string>();
	private readonly runEventSubs = new Set<(event: ComposerCapabilityRunEvent) => void>();
	private readonly aborters = new Map<string, AbortController>();

	constructor(private readonly deps: ImageCoordinatorDeps) {}

	private get config() {
		return this.deps.config ? this.deps.config() : DEFAULT_IMAGE_DOMAIN_CONFIG;
	}

	get converterDefaultQuality(): number {
		return this.config.converter.defaultQuality;
	}

	// ── Paste flow (CMP-IMG-01 / CMP-IMG-02) ────────────────────────────────────

	/**
	 * Persist a pasted bitmap and open a semantic rename review. The asset is
	 * written immediately (handoff: "保存附件后进入语义 rename review"); the initial
	 * variant is the deterministic cleanup name, and regenerate appends alternate
	 * name variants. Accept renames the file (if the chosen name differs) then
	 * commits the reference insertion atomically.
	 */
	async beginPaste(input: ImagePasteInput): Promise<string> {
		const extension = extensionForMime(input.mimeType);
		const versions = buildFileNameVersions(input.rawName ?? '', input.nameSuggestions ?? [], this.config.naming);
		const folder = this.deps.attachment.attachmentFolder();
		const saved = await this.deps.attachment.save({
			bytes: input.bytes,
			baseName: versions[0],
			extension,
			folder,
		});
		const target = insertionTargetToComposerTarget(input.insertion);
		const meta: AssetCandidateMeta = {
			flow: 'paste',
			rendererId: COMPOSER_IMAGE_ASSET_RENDERER_ID,
			savedPath: saved.path,
			extension,
			mimeType: input.mimeType,
			...(input.width !== undefined ? { width: input.width } : {}),
			...(input.height !== undefined ? { height: input.height } : {}),
			insertion: input.insertion,
			plans: new Map(),
		};
		const plan = this.buildPastePlan(meta, input.insertion, saved.path, versions, versions[0], input.bytes.length);
		const candidate = this.deps.hub.createCandidate({
			target,
			proposedChange: { operations: plan.operations, result: plan.envelope, summary: plan.historyLabel },
		});
		meta.plans.set(candidate.activeVariantId, plan);
		this.meta.set(candidate.candidateId, meta);
		return candidate.candidateId;
	}

	// ── AI edit flow (CMP-IMG-06 / CMP-IMG-07) ───────────────────────────────────

	/**
	 * Start an AI image edit. Opens a STREAMING candidate (skeleton) then calls
	 * the media-generation port; the first result becomes the active ready
	 * variant, replacing the source image's reference on accept. Regenerate /
	 * follow-up append further variants.
	 */
	beginAiEdit(input: ImageAiEditInput): ComposerInvocationHandle {
		const candidate = this.deps.hub.createCandidate({
			target: input.target,
			streaming: true,
			instruction: input.instruction,
			proposedChange: { operations: [] },
		});
		const meta: AssetCandidateMeta = {
			flow: 'ai-edit',
			rendererId: COMPOSER_IMAGE_ASSET_RENDERER_ID,
			savedPath: input.sourcePath,
			extension: 'png',
			mimeType: 'image/png',
			editSourcePath: input.sourcePath,
			editTarget: input.target,
			lastInstruction: input.instruction,
			plans: new Map(),
		};
		this.meta.set(candidate.candidateId, meta);
		const runId = nextRunId();
		this.runEdit(candidate.candidateId, candidate.activeVariantId, runId, input.instruction, input.variants);
		return { runId, cancel: () => this.cancel(candidate.candidateId) };
	}

	// ── Converter flow (CMP-IMG-03 / CMP-IMG-04) ─────────────────────────────────

	/**
	 * Register a Converter output as a NEW asset and open a review that replaces
	 * the original image's reference (non-destructive — the original file is
	 * untouched until accept, and even then only the reference moves).
	 */
	async beginConvert(input: ImageConvertInput): Promise<string> {
		const extension = extensionForMime(input.mimeType);
		const base = input.baseName ?? baseNameOf(input.originalPath);
		const folder = this.deps.attachment.attachmentFolder();
		const saved = await this.deps.attachment.save({ bytes: input.bytes, baseName: base, extension, folder });
		const rewrite = planReferenceRewrite(this.deps.session, input.originalPath, saved.path);
		const payload = this.assetPayload('convert', saved.path, extension, input.mimeType, {
			width: input.width,
			height: input.height,
			byteSize: input.bytes.length,
		});
		const meta: AssetCandidateMeta = {
			flow: 'convert',
			rendererId: COMPOSER_IMAGE_ASSET_RENDERER_ID,
			savedPath: saved.path,
			extension,
			mimeType: input.mimeType,
			...(input.width !== undefined ? { width: input.width } : {}),
			...(input.height !== undefined ? { height: input.height } : {}),
			plans: new Map(),
		};
		const plan: VariantPlan = {
			assetPath: saved.path,
			baseName: base,
			operations: rewrite.operations,
			blockDelta: 0,
			envelope: payload,
			historyLabel: 'Convert image',
		};
		const candidate = this.deps.hub.createCandidate({
			target: { kind: 'block', blockId: input.replaceBlockId },
			proposedChange: { operations: plan.operations, result: plan.envelope, summary: plan.historyLabel },
		});
		meta.plans.set(candidate.activeVariantId, plan);
		this.meta.set(candidate.candidateId, meta);
		return candidate.candidateId;
	}

	/**
	 * Open a real existing-asset rename review. Accept first records the current
	 * document's reference rewrite in Composer History, then asks the host to
	 * rename the file and update backlinks in other documents. If the host rename
	 * fails, the document transaction is immediately undone.
	 */
	beginRename(input: ImageRenameInput): string {
		const extension = extensionOf(input.sourcePath);
		const baseName = buildFileNameVersions(input.desiredBaseName, [], this.config.naming)[0];
		const finalPath = this.renameTargetPath(input.sourcePath, baseName, extension);
		const rewrite = planReferenceRewrite(this.deps.session, input.sourcePath, finalPath);
		const envelope = this.assetPayload('rename', finalPath, extension, mimeForExtension(extension), {
			width: input.width,
			height: input.height,
			fileName: { versions: [baseName], activeIndex: 0, extension },
			previewPath: input.sourcePath,
		});
		const plan: VariantPlan = {
			assetPath: finalPath,
			baseName,
			operations: rewrite.operations,
			blockDelta: 0,
			envelope,
			historyLabel: 'Rename image',
		};
		const meta: AssetCandidateMeta = {
			flow: 'rename',
			rendererId: COMPOSER_IMAGE_ASSET_RENDERER_ID,
			savedPath: input.sourcePath,
			extension,
			mimeType: mimeForExtension(extension),
			...(input.width !== undefined ? { width: input.width } : {}),
			...(input.height !== undefined ? { height: input.height } : {}),
			editTarget: { kind: 'block', blockId: input.blockId },
			plans: new Map(),
		};
		const candidate = this.deps.hub.createCandidate({
			target: { kind: 'block', blockId: input.blockId },
			proposedChange: { operations: plan.operations, result: plan.envelope, summary: plan.historyLabel },
		});
		meta.plans.set(candidate.activeVariantId, plan);
		this.meta.set(candidate.candidateId, meta);
		return candidate.candidateId;
	}

	/**
	 * Reversibly OVERWRITE the original asset in place with converted bytes. The
	 * caller is responsible for the second `useOwnerConfirm` confirmation; this
	 * takes a backup first so the change is undoable at the file level.
	 */
	async overwriteOriginal(path: string, bytes: Uint8Array): Promise<{ backupPath: string }> {
		const backup = await this.deps.reference.backup(path);
		await this.deps.attachment.overwrite(path, bytes);
		return backup;
	}

	// ── Caption flow (CMP-IMG-05) ────────────────────────────────────────────────

	/**
	 * Open an AI caption review for an image block. The caption belongs to the
	 * SAME figure (never a sibling prose block): the accepted change rebuilds the
	 * image block's source with a `<figcaption>` slot. Streams a skeleton while
	 * the text port runs; regenerate appends a caption variant.
	 */
	beginCaption(input: { blockId: string; instruction?: string }): ComposerInvocationHandle {
		const block = this.deps.session.getBlock(input.blockId);
		if (!block) throw new Error(`beginCaption: unknown block '${input.blockId}'`);
		const context = this.deps.session.snapshot.sourceText.slice(block.source.from, block.source.to);
		const target: ComposerTarget = { kind: 'block', blockId: input.blockId };
		const candidate = this.deps.hub.createCandidate({
			target,
			streaming: true,
			...(input.instruction !== undefined ? { instruction: input.instruction } : {}),
			proposedChange: { operations: [] },
		});
		this.meta.set(candidate.candidateId, {
			flow: 'caption',
			rendererId: COMPOSER_IMAGE_ANNOTATION_RENDERER_ID,
			savedPath: '',
			extension: '',
			mimeType: '',
			textContext: context,
			editTarget: target,
			anchor: { from: block.source.from, to: block.source.to },
			...(input.instruction !== undefined ? { lastInstruction: input.instruction } : {}),
			plans: new Map(),
		});
		const runId = nextRunId();
		this.runText(candidate.candidateId, candidate.activeVariantId, runId, 'caption', input.instruction ?? '');
		return { runId, cancel: () => this.cancel(candidate.candidateId) };
	}

	// ── Layout flow (CMP-IMG-08) ─────────────────────────────────────────────────

	/**
	 * Commit a deterministic multi-image layout (the layout editor's apply). No
	 * candidate — a layout the user assembled is applied directly and atomically.
	 */
	async commitLayout(input: {
		spec: ComposerImageLayoutSpec;
		insertion?: ImageInsertionTarget;
		replaceBlockId?: string;
	}): Promise<void> {
		const layout = ComposerImageLayoutSpecSchema.parse(input.spec);
		const html = renderLayoutHtml(layout, this.config.layout);
		if (input.replaceBlockId) {
			const plan = planLayoutReplace(this.deps.session, input.replaceBlockId, html);
			await this.deps.hub.commit({
				origin: 'deterministic',
				label: 'Image layout',
				operations: plan.operations,
				target: { kind: 'block', blockId: input.replaceBlockId },
				expectedBlockDelta: plan.blockDelta,
			});
			return;
		}
		const insertion = input.insertion ?? { kind: 'after-block', blockId: null };
		const afterId = insertion.kind === 'after-block' ? insertion.blockId : insertion.blockId;
		const plan = planLayoutInsert(this.deps.session, afterId, html);
		await this.deps.hub.commit({
			origin: 'deterministic',
			label: 'Image layout',
			operations: plan.operations,
			target: afterId ? { kind: 'block', blockId: afterId } : { kind: 'document', documentId: 'active' },
			expectedBlockDelta: plan.blockDelta,
		});
	}

	/**
	 * Open an AI "smart layout" review: the text port returns a typed layout spec
	 * (JSON) for the given items; the deterministic HTML is rendered and reviewed.
	 * Replaces an existing layout block when `replaceBlockId` is given, else
	 * inserts a new one after `afterBlockId`.
	 */
	beginLayoutSuggest(input: {
		items: { path: string; alt?: string; caption?: string }[];
		instruction: string;
		replaceBlockId?: string;
		afterBlockId?: string | null;
	}): ComposerInvocationHandle {
		const target: ComposerTarget = input.replaceBlockId
			? { kind: 'block', blockId: input.replaceBlockId }
			: input.afterBlockId
				? { kind: 'block', blockId: input.afterBlockId }
				: { kind: 'document', documentId: 'active' };
		const candidate = this.deps.hub.createCandidate({
			target,
			streaming: true,
			instruction: input.instruction,
			proposedChange: { operations: [] },
		});
		const anchor =
			input.replaceBlockId && this.deps.session.getBlock(input.replaceBlockId)
				? {
						from: this.deps.session.getBlock(input.replaceBlockId)!.source.from,
						to: this.deps.session.getBlock(input.replaceBlockId)!.source.to,
					}
				: undefined;
		this.meta.set(candidate.candidateId, {
			flow: 'layout',
			rendererId: COMPOSER_IMAGE_LAYOUT_RENDERER_ID,
			savedPath: '',
			extension: '',
			mimeType: '',
			textContext: JSON.stringify({ items: input.items }),
			...(anchor ? { anchor } : {}),
			...(input.afterBlockId !== undefined && !input.replaceBlockId
				? { insertion: { kind: 'after-block', blockId: input.afterBlockId } as ImageInsertionTarget }
				: {}),
			lastInstruction: input.instruction,
			plans: new Map(),
		});
		const runId = nextRunId();
		this.runText(candidate.candidateId, candidate.activeVariantId, runId, 'layout', input.instruction);
		return { runId, cancel: () => this.cancel(candidate.candidateId) };
	}

	// ── ComposerCandidateRuntimePort ─────────────────────────────────────────────

	subscribe(cb: (candidates: readonly ComposerCandidate[]) => void): () => void {
		return this.deps.hub.subscribe((p) => cb(p.candidates.filter((c) => this.meta.has(c.candidateId))));
	}

	onRunEvent(cb: (event: ComposerCapabilityRunEvent) => void): () => void {
		this.runEventSubs.add(cb);
		return () => this.runEventSubs.delete(cb);
	}

	rendererIdFor(candidateId: string): ComposerRendererId | null {
		return this.meta.get(candidateId)?.rendererId ?? null;
	}

	regenerate(candidateId: string, instruction?: string): ComposerInvocationHandle {
		const meta = this.requireMeta(candidateId);
		if (this.streaming.has(candidateId)) {
			throw new Error(`candidate ${candidateId} is still streaming`);
		}
		if (meta.flow === 'ai-edit') return this.regenerateEdit(candidateId, instruction);
		if (meta.flow === 'caption' || meta.flow === 'layout') return this.regenerateText(candidateId, instruction);
		return this.regenerateName(candidateId, instruction);
	}

	cancel(candidateId: string): void {
		this.aborters.get(candidateId)?.abort();
	}

	isStreaming(candidateId: string): boolean {
		return this.streaming.has(candidateId);
	}

	setActiveVariant(candidateId: string, variantId: string): void {
		if (this.streaming.has(candidateId)) throw new Error(`candidate ${candidateId} is streaming`);
		this.deps.hub.setActiveVariant(candidateId, variantId);
	}

	discard(candidateId: string): void {
		this.cancel(candidateId);
		this.deps.hub.discardCandidate(candidateId);
		this.meta.delete(candidateId);
	}

	/**
	 * Accept the active variant: rename the physical asset when the chosen name
	 * differs, then commit the variant's insertion/replacement atomically through
	 * the hub with the exact block-count delta. The commit is undoable at the
	 * document level; the candidate card then clears.
	 */
	async accept(candidateId: string): Promise<void> {
		const meta = this.requireMeta(candidateId);
		const candidate = this.findCandidate(candidateId);
		if (!candidate) throw new Error(`unknown image candidate ${candidateId}`);
		if (candidate.status === 'stale' || candidate.baseRevision !== this.deps.session.baseRevision) {
			throw new ComposerConflictError('stale-candidate', `image candidate ${candidateId} is stale — re-run the action`);
		}
		const plan = meta.plans.get(candidate.activeVariantId);
		if (!plan) throw new Error(`no plan for active variant of ${candidateId}`);
		// A pasted asset is not referenced yet, so its physical rename safely
		// happens before inserting the reference.
		if (meta.flow === 'paste' && plan.assetPath && plan.assetPath !== meta.savedPath) {
			await this.deps.reference.rename(meta.savedPath, plan.assetPath);
			meta.savedPath = plan.assetPath;
		}
		// Existing assets need the opposite order: Composer owns the current
		// document reference + History, then Obsidian updates the physical file and
		// any remaining backlinks. Undo immediately if that host step fails.
		if (meta.flow === 'rename' && plan.assetPath && plan.assetPath !== meta.savedPath) {
			await this.deps.hub.commit({
				origin: 'deterministic',
				label: plan.historyLabel,
				operations: plan.operations,
				target: candidate.target,
				expectedBlockDelta: plan.blockDelta,
			});
			try {
				await this.deps.reference.rename(meta.savedPath, plan.assetPath);
			} catch (cause) {
				await this.deps.hub.undo();
				throw cause;
			}
			this.deps.hub.discardCandidate(candidateId);
			this.meta.delete(candidateId);
			return;
		}
		await this.deps.hub.commit({
			origin: meta.flow === 'paste' || meta.flow === 'convert' ? 'deterministic' : 'ai',
			label: plan.historyLabel,
			operations: plan.operations,
			target: candidate.target,
			expectedBlockDelta: plan.blockDelta,
		});
		this.deps.hub.discardCandidate(candidateId);
		this.meta.delete(candidateId);
	}

	// ── internals ─────────────────────────────────────────────────────────────────

	private regenerateName(candidateId: string, instruction?: string): ComposerInvocationHandle {
		const meta = this.requireMeta(candidateId);
		const candidate = this.findCandidate(candidateId)!;
		const current = candidate.variants.map((v) => meta.plans.get(v.variantId)?.baseName ?? '');
		const nextBase = proposeAlternateName(instruction, current, this.config.naming.fallbackBaseName);
		if (meta.flow === 'rename') {
			const finalPath = this.renameTargetPath(meta.savedPath, nextBase, meta.extension);
			const rewrite = planReferenceRewrite(this.deps.session, meta.savedPath, finalPath);
			const envelope = this.assetPayload('rename', finalPath, meta.extension, meta.mimeType, {
				width: meta.width,
				height: meta.height,
				fileName: { versions: [nextBase], activeIndex: 0, extension: meta.extension },
				previewPath: meta.savedPath,
			});
			const plan: VariantPlan = {
				assetPath: finalPath,
				baseName: nextBase,
				operations: rewrite.operations,
				blockDelta: 0,
				envelope,
				historyLabel: 'Rename image',
			};
			const updated = this.deps.hub.addVariant(candidateId, {
				...(instruction !== undefined ? { instruction } : {}),
				proposedChange: { operations: plan.operations, result: plan.envelope, summary: plan.historyLabel },
			});
			meta.plans.set(updated.activeVariantId, plan);
			return { runId: nextRunId(), cancel: () => {} };
		}
		const insertion = meta.insertion!;
		const finalPath = dedupeAttachmentPath(
			this.deps.attachment.attachmentFolder(),
			nextBase,
			meta.extension,
			(p) => this.pathTaken(p, meta),
		);
		const plan = this.buildInsertionPlan(meta, insertion, finalPath, nextBase, {
			width: meta.width,
			height: meta.height,
		});
		const updated = this.deps.hub.addVariant(candidateId, {
			...(instruction !== undefined ? { instruction } : {}),
			proposedChange: { operations: plan.operations, result: plan.envelope, summary: plan.historyLabel },
		});
		meta.plans.set(updated.activeVariantId, plan);
		return { runId: nextRunId(), cancel: () => {} };
	}

	private regenerateEdit(candidateId: string, instruction?: string): ComposerInvocationHandle {
		const meta = this.requireMeta(candidateId);
		const runInstruction = instruction ?? meta.lastInstruction ?? '';
		meta.lastInstruction = runInstruction;
		const updated = this.deps.hub.addVariant(candidateId, {
			streaming: true,
			instruction: runInstruction,
			proposedChange: { operations: [] },
		});
		const runId = nextRunId();
		this.runEdit(candidateId, updated.activeVariantId, runId, runInstruction);
		return { runId, cancel: () => this.cancel(candidateId) };
	}

	private runEdit(
		candidateId: string,
		variantId: string,
		runId: string,
		instruction: string,
		variants?: number,
	): void {
		const meta = this.requireMeta(candidateId);
		const abort = new AbortController();
		this.aborters.set(candidateId, abort);
		this.streaming.add(candidateId);
		this.emit({ type: 'run-started', runId, capabilityId: 'composer.image.edit', candidateId, variantId });
		void (async () => {
			try {
				const result = await this.deps.edit.edit({
					instruction,
					...(meta.editSourcePath ? { sourcePath: meta.editSourcePath } : {}),
					...(variants !== undefined ? { variants } : {}),
					signal: abort.signal,
				});
				if (abort.signal.aborted) throw new AbortRunError();
				const path = result.paths[0];
				if (!path) throw new Error('media generation returned no image');
				const envelope = this.assetPayload('ai-edit', path, extensionForMime(result.mimeType), result.mimeType, {});
				const rewrite = planReferenceRewrite(this.deps.session, meta.editSourcePath ?? meta.savedPath, path);
				const plan: VariantPlan = {
					assetPath: path,
					baseName: baseNameOf(path),
					operations: rewrite.operations,
					blockDelta: 0,
					envelope,
					historyLabel: 'AI 改图',
				};
				meta.plans.set(variantId, plan);
				// The source image is untouched — the generated asset is a separate file.
				this.streaming.delete(candidateId);
				this.aborters.delete(candidateId);
				this.deps.hub.markVariantReady(candidateId, {
					operations: plan.operations,
					result: plan.envelope,
					summary: plan.historyLabel,
				});
				this.emit({ type: 'variant-ready', runId, candidateId, variantId, envelope });
			} catch (err) {
				this.streaming.delete(candidateId);
				this.aborters.delete(candidateId);
				this.failVariantSafely(candidateId);
				if (err instanceof AbortRunError || abort.signal.aborted) {
					this.emit({ type: 'run-cancelled', runId, candidateId, variantId });
					return;
				}
				const message = err instanceof Error ? err.message : 'AI image edit failed';
				this.emit({ type: 'run-failed', runId, candidateId, variantId, error: message });
			}
		})();
	}

	private regenerateText(candidateId: string, instruction?: string): ComposerInvocationHandle {
		const meta = this.requireMeta(candidateId);
		const runInstruction = instruction ?? meta.lastInstruction ?? '';
		meta.lastInstruction = runInstruction;
		const updated = this.deps.hub.addVariant(candidateId, {
			streaming: true,
			instruction: runInstruction,
			proposedChange: { operations: [] },
		});
		const runId = nextRunId();
		this.runText(candidateId, updated.activeVariantId, runId, meta.flow === 'layout' ? 'layout' : 'caption', runInstruction);
		return { runId, cancel: () => this.cancel(candidateId) };
	}

	private runText(
		candidateId: string,
		variantId: string,
		runId: string,
		kind: 'caption' | 'layout',
		instruction: string,
	): void {
		const meta = this.requireMeta(candidateId);
		const abort = new AbortController();
		this.aborters.set(candidateId, abort);
		this.streaming.add(candidateId);
		const capabilityId = kind === 'caption' ? 'composer.image.caption' : 'composer.image.layout';
		this.emit({ type: 'run-started', runId, capabilityId, candidateId, variantId });
		void (async () => {
			try {
				if (!this.deps.text) throw new Error('image text port not configured');
				const text = await this.deps.text.complete({
					kind,
					instruction,
					context: meta.textContext ?? '',
					signal: abort.signal,
				});
				if (abort.signal.aborted) throw new AbortRunError();
				const plan = kind === 'caption' ? this.buildCaptionPlan(meta, text) : this.buildLayoutPlan(meta, text);
				meta.plans.set(variantId, plan);
				this.streaming.delete(candidateId);
				this.aborters.delete(candidateId);
				this.deps.hub.markVariantReady(candidateId, {
					operations: plan.operations,
					result: plan.envelope,
					summary: plan.historyLabel,
				});
				this.emit({ type: 'variant-ready', runId, candidateId, variantId, envelope: plan.envelope });
			} catch (err) {
				this.streaming.delete(candidateId);
				this.aborters.delete(candidateId);
				this.failVariantSafely(candidateId);
				if (err instanceof AbortRunError || abort.signal.aborted) {
					this.emit({ type: 'run-cancelled', runId, candidateId, variantId });
					return;
				}
				const message = err instanceof Error ? err.message : 'AI generation failed';
				this.emit({ type: 'run-failed', runId, candidateId, variantId, error: message });
			}
		})();
	}

	private buildCaptionPlan(meta: AssetCandidateMeta, captionText: string): VariantPlan {
		if (!meta.anchor) throw new Error('caption plan: missing frozen block anchor');
		const caption = captionText.trim();
		const replacementText = applyCaption(meta.textContext ?? '', caption);
		const payload = ComposerImageAnnotationPatchPayloadSchema.parse({ caption, replacementText });
		const envelope: ComposerResultEnvelope = {
			resultKind: 'image-annotation-patch',
			rendererId: COMPOSER_IMAGE_ANNOTATION_RENDERER_ID,
			writebackAdapterId: COMPOSER_IMAGE_ANNOTATION_WRITEBACK_ID,
			payload,
		};
		return {
			operations: [{ kind: 'replaceRange', from: meta.anchor.from, to: meta.anchor.to, text: replacementText }],
			blockDelta: 0,
			envelope,
			historyLabel: 'Image caption',
		};
	}

	private buildLayoutPlan(meta: AssetCandidateMeta, jsonText: string): VariantPlan {
		const layout = ComposerImageLayoutSpecSchema.parse(parseLayoutJson(jsonText));
		const html = renderLayoutHtml(layout, this.config.layout);
		const payload = ComposerImageLayoutPatchPayloadSchema.parse({ layout, html });
		const envelope: ComposerResultEnvelope = {
			resultKind: 'image-layout-patch',
			rendererId: COMPOSER_IMAGE_LAYOUT_RENDERER_ID,
			writebackAdapterId: COMPOSER_IMAGE_LAYOUT_WRITEBACK_ID,
			payload,
		};
		if (meta.anchor) {
			return {
				operations: [{ kind: 'replaceRange', from: meta.anchor.from, to: meta.anchor.to, text: html }],
				blockDelta: 0,
				envelope,
				historyLabel: 'Image layout',
			};
		}
		const afterId = meta.insertion && meta.insertion.kind === 'after-block' ? meta.insertion.blockId : null;
		const plan = planLayoutInsert(this.deps.session, afterId, html);
		return { operations: plan.operations, blockDelta: plan.blockDelta, envelope, historyLabel: 'Image layout' };
	}

	private buildPastePlan(
		meta: AssetCandidateMeta,
		insertion: ImageInsertionTarget,
		assetPath: string,
		versions: string[],
		baseName: string,
		byteSize: number,
	): VariantPlan {
		return this.buildInsertionPlan(meta, insertion, assetPath, baseName, {
			width: meta.width,
			height: meta.height,
			byteSize,
			versions,
			activeIndex: 0,
		});
	}

	private buildInsertionPlan(
		meta: AssetCandidateMeta,
		insertion: ImageInsertionTarget,
		assetPath: string,
		baseName: string,
		extra: { width?: number; height?: number; byteSize?: number; versions?: string[]; activeIndex?: number },
	): VariantPlan {
		const embed = buildImageEmbed(assetPath);
		const plan: ImageInsertionPlan =
			insertion.kind === 'after-block'
				? planImageInsertAfterBlock(this.deps.session, insertion.blockId, embed)
				: planImageSplitInsert(this.deps.session, insertion.blockId, insertion.offset, embed);
		const intent: ComposerImageAssetIntent = meta.flow === 'convert' ? 'convert' : 'paste';
		const envelope = this.assetPayload(intent, assetPath, meta.extension, meta.mimeType, {
			width: extra.width,
			height: extra.height,
			byteSize: extra.byteSize,
			fileName: {
				versions: extra.versions ?? [baseName],
				activeIndex: extra.activeIndex ?? 0,
				extension: meta.extension,
			},
		});
		return {
			assetPath,
			baseName,
			operations: plan.operations,
			blockDelta: plan.blockDelta,
			envelope,
			historyLabel: meta.flow === 'convert' ? 'Convert image' : 'Insert image',
		};
	}

	private assetPayload(
		intent: ComposerImageAssetIntent,
		assetPath: string,
		extension: string,
		mimeType: string,
		extra: {
			width?: number;
			height?: number;
			byteSize?: number;
			fileName?: { versions: string[]; activeIndex: number; extension: string };
			previewPath?: string;
		},
	): ComposerResultEnvelope<ComposerImageAssetCandidatePayload> {
		const payload = ComposerImageAssetCandidatePayloadSchema.parse({
			intent,
			assetPath,
			previewUri: this.deps.attachment.previewUri(extra.previewPath ?? assetPath),
			mimeType,
			...(extra.width !== undefined ? { width: extra.width } : {}),
			...(extra.height !== undefined ? { height: extra.height } : {}),
			...(extra.byteSize !== undefined ? { byteSize: extra.byteSize } : {}),
			...(extra.fileName ? { fileName: extra.fileName } : {}),
		});
		return { resultKind: 'image-asset-candidate', rendererId: COMPOSER_IMAGE_ASSET_RENDERER_ID, payload };
	}

	private pathTaken(path: string, meta: AssetCandidateMeta): boolean {
		// The asset already lives at savedPath; every other proposed variant path is free.
		return path === meta.savedPath;
	}

	private renameTargetPath(sourcePath: string, baseName: string, extension: string): string {
		const folder = folderOf(sourcePath);
		const direct = folder.length > 0
			? `${folder}/${baseName}.${extension}`
			: `${baseName}.${extension}`;
		if (direct === sourcePath) return sourcePath;
		return dedupeAttachmentPath(
			folder,
			baseName,
			extension,
			(path) => path !== sourcePath && (this.deps.attachment.exists?.(path) ?? false),
		);
	}

	private failVariantSafely(candidateId: string): void {
		try {
			this.deps.hub.markVariantFailed(candidateId);
		} catch {
			// discarded mid-run
		}
	}

	private findCandidate(candidateId: string): ComposerCandidate | undefined {
		return this.deps.hub.projection().candidates.find((c) => c.candidateId === candidateId);
	}

	private requireMeta(candidateId: string): AssetCandidateMeta {
		const meta = this.meta.get(candidateId);
		if (!meta) throw new Error(`no image metadata for candidate ${candidateId}`);
		return meta;
	}

	private emit(event: ComposerCapabilityRunEvent): void {
		for (const cb of this.runEventSubs) cb(event);
	}
}

function insertionTargetToComposerTarget(insertion: ImageInsertionTarget): ComposerTarget {
	if (insertion.kind === 'split') return { kind: 'block', blockId: insertion.blockId };
	if (insertion.blockId) return { kind: 'block', blockId: insertion.blockId };
	// Whole-document insertion at the end.
	return { kind: 'document', documentId: 'active' };
}

function baseNameOf(path: string): string {
	const file = path.slice(path.lastIndexOf('/') + 1);
	const dot = file.lastIndexOf('.');
	return dot > 0 ? file.slice(0, dot) : file;
}

function folderOf(path: string): string {
	const slash = path.lastIndexOf('/');
	return slash > 0 ? path.slice(0, slash) : '';
}

function extensionOf(path: string): string {
	const file = path.slice(path.lastIndexOf('/') + 1);
	const dot = file.lastIndexOf('.');
	return dot > 0 ? file.slice(dot + 1).toLowerCase() : 'png';
}

function mimeForExtension(extension: string): string {
	if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
	if (extension === 'webp') return 'image/webp';
	if (extension === 'gif') return 'image/gif';
	if (extension === 'svg') return 'image/svg+xml';
	if (extension === 'avif') return 'image/avif';
	return 'image/png';
}

/** A deterministic alternate name proposal (uses a typed instruction verbatim). */
function proposeAlternateName(instruction: string | undefined, taken: string[], fallback: string): string {
	const typed = instruction?.trim();
	if (typed) return typed;
	const seed = taken.find((t) => t.length > 0) ?? fallback;
	for (let n = 2; n < 1000; n++) {
		const candidate = `${seed}-v${n}`;
		if (!taken.includes(candidate)) return candidate;
	}
	return `${seed}-${Date.now().toString(36)}`;
}

/** Parse a layout spec JSON from model text, tolerating a fenced ```json block. */
function parseLayoutJson(text: string): unknown {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = fenced ? fenced[1].trim() : trimmed;
	try {
		return JSON.parse(body);
	} catch {
		throw new Error('smart layout: model output is not valid layout JSON');
	}
}

class AbortRunError extends Error {
	constructor() {
		super('image edit cancelled');
		this.name = 'AbortRunError';
	}
}
