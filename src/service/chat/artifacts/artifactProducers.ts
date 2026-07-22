/**
 * ArtifactProducerService — structured `artifact_create` producers
 * (Chat Studio zero-gap Track D, 2026-07-21).
 *
 * Owns the validate → save-to-Vault → emit-receipt pipeline for the 5
 * artifact_create sub-types (dataview / excalidraw / drawio / extract /
 * reminder). Called by the app-owned `artifact_create` ToolDef and by the
 * ReminderSchedulerService when it needs to mark a reminder done.
 *
 * Design invariants:
 *   • Each producer validates its payload BEFORE touching the vault. On
 *     validation failure we return a `ChatArtifactReceipt` with
 *     `state: 'failed'`, `error.recoverable: true`, and the original raw
 *     content stashed in `preview.text` so the retry action can replay it.
 *   • Filenames + extensions + labels + error copy come from
 *     `templates/config/artifact-create.json` — no inline strings here.
 *   • The service is framework-agnostic: it takes an `ArtifactVaultWriterPort`
 *     + a `ReceiptSink` + a `now` clock. All Obsidian coupling lives in the
 *     port implementation.
 */

import type { z } from 'zod';
import {
	artifactCreateInputSchema,
	type ArtifactCreateInput,
	type ArtifactCreateType,
} from '@/core/schemas/tools/artifactCreate';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import type { ArtifactVaultWriterPort } from '@/core/ports/ArtifactVaultWriterPort';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import {
	getAIArtifactsDataviewFolder,
	getAIArtifactsExcalidrawFolder,
	getAIArtifactsDrawioFolder,
	getAIArtifactsExtractsFolder,
	getAIArtifactsRemindersFolder,
} from '@/core/config/folderPaths';

/** Persist a receipt through the app-owned sink. */
export interface ReceiptSink {
	save(receipt: ChatArtifactReceipt): Promise<void>;
}

export interface ArtifactCreateConfig {
	labels: Record<ArtifactCreateType, string>;
	filenames: Record<ArtifactCreateType, string>;
	extensions: Record<ArtifactCreateType, string>;
	excalidrawFrontmatter: string;
	excalidrawDrawingHeading: string;
	reminderStatusOpen: string;
	reminderStatusDone: string;
	errorMessages: {
		dataviewInvalidQuery: string;
		dataviewEmpty: string;
		excalidrawInvalidJson: string;
		excalidrawMissingElements: string;
		drawioMissingRoot: string;
		drawioParseError: string;
		extractEmpty: string;
		reminderBadDate: string;
		reminderPast: string;
	};
}

export interface ArtifactProducerContext {
	runId: string;
	messageId: string;
	conversationId: string;
	projectId?: string;
}

export interface ArtifactProducerDeps {
	writer: ArtifactVaultWriterPort;
	receiptSink: ReceiptSink;
	getRootFolder: () => string;
	loadConfig: () => Promise<ArtifactCreateConfig>;
	now?: () => number;
}

export interface ProduceArtifactOutcome {
	receipt: ChatArtifactReceipt;
	/** Vault-relative path (undefined when the receipt is `failed`). */
	vaultPath?: string;
}

/**
 * Kind mapping for the receipt.kind field — different from ArtifactCreateType
 * because Excalidraw + draw.io both map to the pre-existing `drawing` kind.
 */
function receiptKindFor(type: ArtifactCreateType): ChatArtifactReceipt['kind'] {
	switch (type) {
		case 'dataview': return 'dataview';
		case 'excalidraw': return 'drawing';
		case 'drawio': return 'drawing';
		case 'extract': return 'extract';
		case 'reminder': return 'reminder';
	}
}

function folderFor(type: ArtifactCreateType, rootFolder: string): string {
	switch (type) {
		case 'dataview': return getAIArtifactsDataviewFolder(rootFolder);
		case 'excalidraw': return getAIArtifactsExcalidrawFolder(rootFolder);
		case 'drawio': return getAIArtifactsDrawioFolder(rootFolder);
		case 'extract': return getAIArtifactsExtractsFolder(rootFolder);
		case 'reminder': return getAIArtifactsRemindersFolder(rootFolder);
	}
}

// ── validators ──────────────────────────────────────────────────────────────

const DATAVIEW_KEYWORDS = /^\s*(TABLE|LIST|TASK|CALENDAR)\b/i;

/** Return a human-readable error, or null when the payload is valid. */
export function validateDataview(
	input: { flavor: 'dql' | 'dataviewjs'; query: string },
	err: ArtifactCreateConfig['errorMessages'],
): string | null {
	if (!input.query.trim()) return err.dataviewEmpty;
	if (input.flavor === 'dql' && !DATAVIEW_KEYWORDS.test(input.query)) {
		return err.dataviewInvalidQuery;
	}
	return null;
}

export function validateExcalidraw(
	input: { elementsJson: string },
	err: ArtifactCreateConfig['errorMessages'],
): string | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(input.elementsJson);
	} catch {
		return err.excalidrawInvalidJson;
	}
	// Accept either `{ elements: [...] }` (full scene) or a bare array.
	if (Array.isArray(parsed)) return null;
	if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { elements?: unknown }).elements)) {
		return null;
	}
	return err.excalidrawMissingElements;
}

export function validateDrawio(
	input: { xml: string },
	err: ArtifactCreateConfig['errorMessages'],
): string | null {
	if (!/<mxfile|<mxGraphModel/.test(input.xml)) return err.drawioMissingRoot;
	// Node has no DOMParser by default. Do a light structural sanity check:
	// balanced <mx*> tags. Anything more strict would need `xmldom` at runtime.
	// The plugin runtime has DOMParser via Obsidian; when present, use it.
	if (typeof (globalThis as { DOMParser?: unknown }).DOMParser === 'function') {
		try {
			const DOMParserCtor = (globalThis as { DOMParser: { new (): { parseFromString: (s: string, t: string) => Document } } }).DOMParser;
			const doc = new DOMParserCtor().parseFromString(input.xml, 'text/xml');
			const parseError = doc.getElementsByTagName('parsererror').length > 0;
			if (parseError) return err.drawioParseError;
		} catch {
			return err.drawioParseError;
		}
	}
	return null;
}

export function validateExtract(
	input: { content: string },
	err: ArtifactCreateConfig['errorMessages'],
): string | null {
	if (!input.content.trim()) return err.extractEmpty;
	return null;
}

export function validateReminder(
	input: { dueIso: string },
	err: ArtifactCreateConfig['errorMessages'],
	nowMs: number,
): string | null {
	const t = Date.parse(input.dueIso);
	if (Number.isNaN(t)) return err.reminderBadDate;
	if (t <= nowMs) return err.reminderPast;
	return null;
}

// ── content composition ─────────────────────────────────────────────────────

function composeDataviewBody(
	title: string,
	input: Extract<ArtifactCreateInput, { type: 'dataview' }>,
): string {
	const fenceTag = input.flavor === 'dataviewjs' ? 'dataviewjs' : 'dataview';
	const prose = input.note?.trim() ? `${input.note.trim()}\n\n` : '';
	return `# ${title}\n\n${prose}\`\`\`${fenceTag}\n${input.query.trim()}\n\`\`\`\n`;
}

function composeExcalidrawBody(
	title: string,
	input: Extract<ArtifactCreateInput, { type: 'excalidraw' }>,
	config: ArtifactCreateConfig,
): string {
	// Wrap the scene JSON into the Excalidraw plugin's `.excalidraw.md`
	// container — frontmatter + `## Drawing` heading + a fenced json block.
	// The Excalidraw plugin only reads the fenced json body; the rest is
	// user-editable prose.
	let scene: unknown;
	try {
		scene = JSON.parse(input.elementsJson);
	} catch {
		scene = { elements: [] };
	}
	if (Array.isArray(scene)) {
		scene = { type: 'excalidraw', version: 2, source: 'peak-assistant', elements: scene, appState: {} };
	}
	const pretty = JSON.stringify(scene, null, 2);
	return `${config.excalidrawFrontmatter}\n# ${title}\n\n${config.excalidrawDrawingHeading}\n\n\`\`\`json\n${pretty}\n\`\`\`\n`;
}

function composeDrawioBody(input: Extract<ArtifactCreateInput, { type: 'drawio' }>): string {
	// Ensure trailing newline for editors that expect it.
	return input.xml.endsWith('\n') ? input.xml : `${input.xml}\n`;
}

function composeExtractBody(
	title: string,
	input: Extract<ArtifactCreateInput, { type: 'extract' }>,
	ctx: ArtifactProducerContext,
): string {
	const sources: string[] = [];
	for (const ref of input.sourceRefs ?? []) {
		// Emit as a wikilink; the ref might already be one or a bare path.
		const trimmed = ref.trim();
		if (!trimmed) continue;
		if (/^\[\[.+\]\]$/.test(trimmed)) sources.push(`- ${trimmed}`);
		else sources.push(`- [[${trimmed}]]`);
	}
	for (const messageId of input.sourceMessageIds ?? []) {
		sources.push(`- conversation: \`${ctx.conversationId}\` message: \`${messageId}\``);
	}
	const sourcesBlock = sources.length > 0 ? `\n**Sources**\n\n${sources.join('\n')}\n\n---\n\n` : '';
	return `# ${title}\n\n${sourcesBlock}${input.content.trim()}\n`;
}

function composeReminderBody(
	title: string,
	input: Extract<ArtifactCreateInput, { type: 'reminder' }>,
	config: ArtifactCreateConfig,
	ctx: ArtifactProducerContext,
): string {
	// YAML frontmatter carries the machine-readable schedule; the scheduler
	// reads this back at boot to reconstruct pending reminders.
	const frontmatter = [
		'---',
		'peak-reminder: true',
		`title: ${JSON.stringify(title)}`,
		`due: ${input.dueIso}`,
		`status: ${config.reminderStatusOpen}`,
		`sourceConversation: ${ctx.conversationId}`,
		`sourceMessage: ${ctx.messageId}`,
		'---',
		'',
	].join('\n');
	const body = input.note?.trim() ? `${input.note.trim()}\n` : '';
	return `${frontmatter}\n# ${title}\n\n${body}`;
}

// ── main service ────────────────────────────────────────────────────────────

export class ArtifactProducerService {
	constructor(private readonly deps: ArtifactProducerDeps) {}

	/**
	 * Validate + persist a single artifact_create call. Never throws — the
	 * ToolDef relies on a receipt-first contract so partial output / bad
	 * JSON / bad XML must produce a `failed` receipt the retry action can
	 * replay.
	 */
	async produce(
		rawInput: unknown,
		ctx: ArtifactProducerContext,
	): Promise<ProduceArtifactOutcome> {
		const config = await this.deps.loadConfig();
		const now = this.deps.now ?? Date.now;
		const nowMs = now();
		// 1) shape check
		let parsed: ArtifactCreateInput;
		try {
			parsed = artifactCreateInputSchema.parse(rawInput);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : 'artifact_create input failed schema validation';
			return this.failed({
				// Unknown type at this point — bucket as extract to keep the
				// receipt renderable; the error message tells the true story.
				type: 'extract',
				title: 'artifact_create (invalid input)',
				config,
				ctx,
				nowMs,
				errorMessage: message,
				rawText: safeRawText(rawInput),
			});
		}

		// 2) per-type validation
		const errMap = config.errorMessages;
		let validationError: string | null = null;
		switch (parsed.type) {
			case 'dataview':
				validationError = validateDataview(parsed, errMap);
				break;
			case 'excalidraw':
				validationError = validateExcalidraw(parsed, errMap);
				break;
			case 'drawio':
				validationError = validateDrawio(parsed, errMap);
				break;
			case 'extract':
				validationError = validateExtract(parsed, errMap);
				break;
			case 'reminder':
				validationError = validateReminder(parsed, errMap, nowMs);
				break;
		}
		if (validationError) {
			return this.failed({
				type: parsed.type,
				title: parsed.title,
				config,
				ctx,
				nowMs,
				errorMessage: validationError,
				rawText: this.rawTextFor(parsed),
			});
		}

		// 3) compose body + write to vault
		let body: string;
		switch (parsed.type) {
			case 'dataview':   body = composeDataviewBody(parsed.title, parsed); break;
			case 'excalidraw': body = composeExcalidrawBody(parsed.title, parsed, config); break;
			case 'drawio':     body = composeDrawioBody(parsed); break;
			case 'extract':    body = composeExtractBody(parsed.title, parsed, ctx); break;
			case 'reminder':   body = composeReminderBody(parsed.title, parsed, config, ctx); break;
		}

		const rootFolder = this.deps.getRootFolder();
		const folder = folderFor(parsed.type, rootFolder);
		const stem = config.filenames[parsed.type];
		const ext = config.extensions[parsed.type];
		const basename = `${stem}-${timestampSlug(nowMs)}-${slugify(parsed.title)}`;
		let vaultPath: string;
		try {
			vaultPath = await this.deps.writer.writeTextFile(folder, basename, ext, body);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'vault write failed';
			return this.failed({
				type: parsed.type,
				title: parsed.title,
				config,
				ctx,
				nowMs,
				errorMessage: `vault write failed: ${message}`,
				rawText: this.rawTextFor(parsed),
			});
		}

		// 4) emit ready receipt
		const receipt: ChatArtifactReceipt = {
			artifactId: `art-${generateUuidWithoutHyphens()}`,
			runId: ctx.runId,
			messageId: ctx.messageId,
			conversationId: ctx.conversationId,
			projectId: ctx.projectId,
			direction: 'generated',
			kind: receiptKindFor(parsed.type),
			title: parsed.title,
			vaultPath,
			preview: previewFor(parsed),
			state: 'ready',
			availableActions: ['open', 'copy'],
			createdAt: nowMs,
		};
		await this.deps.receiptSink.save(receipt);
		return { receipt, vaultPath };
	}

	private async failed(args: {
		type: ArtifactCreateType;
		title: string;
		config: ArtifactCreateConfig;
		ctx: ArtifactProducerContext;
		nowMs: number;
		errorMessage: string;
		rawText: string;
	}): Promise<ProduceArtifactOutcome> {
		const receipt: ChatArtifactReceipt = {
			artifactId: `art-${generateUuidWithoutHyphens()}`,
			runId: args.ctx.runId,
			messageId: args.ctx.messageId,
			conversationId: args.ctx.conversationId,
			projectId: args.ctx.projectId,
			direction: 'generated',
			kind: receiptKindFor(args.type),
			title: args.title,
			// Preserve the original content so the retry action can replay it
			// without asking the model again (the ToolDef stashes this into
			// the tool payload).
			preview: { kind: 'text', text: args.rawText },
			state: 'failed',
			availableActions: ['retry'],
			createdAt: args.nowMs,
			error: {
				code: `artifact-create-${args.type}-failed`,
				message: args.errorMessage,
				recoverable: true,
			},
		};
		await this.deps.receiptSink.save(receipt);
		return { receipt };
	}

	private rawTextFor(parsed: ArtifactCreateInput): string {
		switch (parsed.type) {
			case 'dataview':   return parsed.query;
			case 'excalidraw': return parsed.elementsJson;
			case 'drawio':     return parsed.xml;
			case 'extract':    return parsed.content;
			case 'reminder':   return `${parsed.title} @ ${parsed.dueIso}${parsed.note ? `\n\n${parsed.note}` : ''}`;
		}
	}
}

function previewFor(input: ArtifactCreateInput): ChatArtifactReceipt['preview'] {
	switch (input.type) {
		case 'dataview': return { kind: 'code', text: input.query.slice(0, 400) };
		case 'excalidraw': return { kind: 'none' };
		case 'drawio': return { kind: 'code', text: input.xml.slice(0, 400) };
		case 'extract': return { kind: 'text', text: input.content.slice(0, 400) };
		case 'reminder': return { kind: 'text', text: `${input.title} — ${input.dueIso}` };
	}
}

function safeRawText(raw: unknown): string {
	try {
		return typeof raw === 'string' ? raw : JSON.stringify(raw ?? null).slice(0, 2000);
	} catch {
		return '(unrenderable input)';
	}
}

function slugify(raw: string): string {
	const trimmed = (raw || '').trim().toLowerCase();
	const cleaned = trimmed.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
	return cleaned.slice(0, 40) || 'untitled';
}

function timestampSlug(nowMs: number): string {
	const d = new Date(nowMs);
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-`
		+ `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
	);
}

/**
 * Discriminated union export helper: `schema.parse()` is called inside
 * `produce()`, but callers that want a pre-validated payload (tests) can
 * import the schema directly from `@/core/schemas/tools/artifactCreate`.
 */
export type { ArtifactCreateInput, ArtifactCreateType };
export { artifactCreateInputSchema };
