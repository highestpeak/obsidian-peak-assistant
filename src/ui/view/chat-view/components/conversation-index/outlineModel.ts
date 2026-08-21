/**
 * outlineModel — pure derivation layer for the right-column Outline / Resources
 * projections (Chat Studio spec §10, §12.2).
 *
 * The whole module is React-free / DOM-free so it can be unit-tested with plain
 * Node asserts. The React layer in `ConversationIndex.tsx` calls these builders
 * from `useMemo`, holds nothing but derived state, and never mutates the
 * incoming `ChatMessage[]` / `ChatArtifactReceipt[]` / `TurnExecutionReceipt[]`.
 *
 * Two derivations live here:
 *
 *   1. `buildOutlineItems` — the ordered anchor list rendered by the Outline
 *      tab. Rows are user turns, assistant turns, process (tool) nodes, error
 *      status nodes, and artifact anchors joined by messageId. Grouped by
 *      `message.topic` when any message has one, else strict time order.
 *      RIGHT-01 hard rule: this builder takes NO filter input — Outline
 *      completely ignores Resources filters.
 *
 *   2. `buildResourceRows` — the row list rendered by the Resources tab, with
 *      an explicit direction + kind mapping. `filterResourceRows` applies the
 *      AND semantics of the Direction filter (All/Input/Generated) and the
 *      single-select Type filter (RIGHT-03).
 *
 * All identifiers are stable strings so React keys survive re-derivation.
 */

import type { ChatMessage } from '@/core/types/chat';
import { MessageStatus } from '@/core/types/chat';
import type {
	ChatArtifactReceipt,
	ChatArtifactKind,
	TurnExecutionReceipt,
} from '@/core/types/chat-studio';
import type { ResourceKind } from '@/core/document/types';

// ── Outline model ────────────────────────────────────────────────────────────

/**
 * Outline anchor kinds surfaced in the right column. Each maps to an icon +
 * short label in the presentational layer; the model stays label-free so the
 * i18n layer picks strings.
 */
export type OutlineNodeKind =
	| 'user'         // user turn
	| 'assistant'    // default-identity assistant turn (no repeated "Bot" icon)
	| 'process'      // tool run(s) attached to an assistant turn
	| 'error'        // failed / cancelled / timeout status node
	| 'artifact';    // generated or input artifact anchor

export interface OutlineItem {
	id: string;
	kind: OutlineNodeKind;
	/** Short human-readable label — first line of content / tool name / title. */
	label: string;
	/** Anchor messageId used to locate the row in the message stream. */
	messageId: string;
	/** Ordering key inside the parent group; strictly increases. */
	order: number;
	/** Group topic name; '' means the untopiced default group. */
	topic: string;
	/** Optional secondary metadata for the row (status code, tool name, kind). */
	meta?: string;
	/** Wallclock timestamp — rendered as the row subline when `meta` is absent
	 *  (message rows show a time; process/error/artifact rows show `meta`). */
	createdAt?: number;
	/** True when the underlying message is starred. Only set on the `user` /
	 *  `assistant` message rows — the process / error / artifact sub-nodes never
	 *  carry it (they aren't the thing the user starred). The view renders a
	 *  right-aligned star badge so starred turns are findable from the Outline. */
	starred?: boolean;
}

export interface OutlineGroup {
	/** Stable identity for one contiguous run. The same topic may have many runs. */
	id: string;
	/** '' for the untopiced group; a topic string otherwise. */
	topic: string;
	items: OutlineItem[];
}

const MAX_LABEL = 60;

function firstLineLabel(text: string, max = MAX_LABEL): string {
	if (!text) return '';
	// Strip fenced code + inline code + basic markdown so the outline row reads
	// as plain nav text, not "## " or "```mermaid".
	let out = text.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1');
	out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/^\s{0,3}>\s?/gm, '');
	out = out.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
	const line = out.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
	const flat = line.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	return flat.slice(0, max - 1).trimEnd() + '…';
}

function isErrorStatus(m: ChatMessage): boolean {
	if (m.isErrorMessage) return true;
	const s = m.status;
	return s === MessageStatus.ERROR
		|| s === MessageStatus.CANCELLED
		|| s === MessageStatus.TIMEOUT;
}

function errorLabel(m: ChatMessage): string {
	if (m.status === MessageStatus.CANCELLED) return 'Cancelled';
	if (m.status === MessageStatus.TIMEOUT) return 'Timeout';
	return 'Error';
}

/**
 * Build the ordered outline. The result is a list of groups; when NO message
 * carries a topic the whole conversation returns a single group with topic=''.
 * When any message has a topic, untopiced messages fall into a '' group.
 *
 * Ordering is globally NEWEST-FIRST (reverse-chronological). We sort by the
 * persisted wallclock first instead of trusting the caller's array order. The
 * original append index is only a stable tie-breaker for equal timestamps.
 *
 * Topic grouping is run-length based: only adjacent messages with the same
 * topic share a group. If a conversation returns to an earlier topic after a
 * different topic, a new group is created. This preserves the global timeline;
 * globally merging equal topic names would pull old messages above newer ones.
 *
 * A single message's node cluster keeps its NATURAL internal order (the message
 * row first, then its process / error / artifact attachments) even under the
 * reversal — attachments never float above the parent that produced them.
 *
 * `order` is renumbered to the final visual order (0 = topmost/newest row) so
 * `flattenOutline` equals render order for the a11y scan.
 *
 * `receipts` is joined by `messageId` so an artifact produced by turn X sits
 * directly after that assistant row — the reader sees "prompt → outputs" as a
 * single beat, not scattered later in the outline.
 *
 * IMPORTANT (RIGHT-01): this signature has NO filter parameter. If a caller
 * needs to filter, that MUST happen after the fact via `filterOutlineItems`.
 * Feeding a Resources filter in here is a contract violation.
 */
export function buildOutlineItems(
	messages: ChatMessage[],
	receipts: ChatArtifactReceipt[],
): OutlineGroup[] {
	const receiptsByMessage = new Map<string, ChatArtifactReceipt[]>();
	for (const r of receipts) {
		const arr = receiptsByMessage.get(r.messageId);
		if (arr) arr.push(r);
		else receiptsByMessage.set(r.messageId, [r]);
	}

	const orderedMessages = messages
		.map((message, inputIndex) => ({ message, inputIndex }))
		.sort((a, b) => {
			const byTime = (b.message.createdAtTimestamp ?? 0) - (a.message.createdAtTimestamp ?? 0);
			return byTime || b.inputIndex - a.inputIndex;
		});

	const groups: OutlineGroup[] = [];
	let activeGroup: OutlineGroup | null = null;
	function push(topic: string, messageId: string, item: OutlineItem) {
		if (!activeGroup || activeGroup.topic !== topic) {
			activeGroup = {
				id: `run:${messageId}`,
				topic,
				items: [],
			};
			groups.push(activeGroup);
		}
		activeGroup.items.push(item);
	}

	let order = 0;
	// Newest→oldest. Each message emits its whole cluster (message row + its
	// attachments) before we step to the older message, so cluster integrity is
	// preserved while the overall order flips.
	for (const { message: m } of orderedMessages) {
		const topic = (m.topic ?? '').trim();

		if (m.role === 'user') {
			push(topic, m.id, {
				id: `msg:${m.id}`,
				kind: 'user',
				label: firstLineLabel(m.content) || '(empty message)',
				messageId: m.id,
				order: order++,
				topic,
				createdAt: m.createdAtTimestamp,
				starred: m.starred,
			});
		} else if (m.role === 'assistant') {
			// Assistant identity row. We keep the default-assistant kind as
			// 'assistant' with a neutral message icon in the view — spec §10.1
			// explicitly forbids repeating a "Bot" avatar on every row.
			push(topic, m.id, {
				id: `msg:${m.id}`,
				kind: 'assistant',
				label: firstLineLabel(m.content) || '(assistant reply)',
				messageId: m.id,
				order: order++,
				topic,
				createdAt: m.createdAtTimestamp,
				starred: m.starred,
			});
			// Process (tool) node: collapse multiple tool calls into one anchor
			// so the outline stays scannable. The Trace panel is the place for
			// per-tool detail; this is nav, not inspection.
			const toolCalls = m.toolCalls ?? [];
			if (toolCalls.length > 0) {
				const names = toolCalls.map((t) => t.toolName).filter(Boolean);
				const label = names.length === 1
					? `Tool · ${names[0]}`
					: `Tools · ${names.length}`;
				push(topic, m.id, {
					id: `proc:${m.id}`,
					kind: 'process',
					label,
					messageId: m.id,
					order: order++,
					topic,
					meta: names.join(', ') || undefined,
					createdAt: m.createdAtTimestamp,
				});
			}
		}

		if (isErrorStatus(m)) {
			push(topic, m.id, {
				id: `err:${m.id}`,
				kind: 'error',
				label: errorLabel(m),
				messageId: m.id,
				order: order++,
				topic,
				meta: m.status,
				createdAt: m.createdAtTimestamp,
			});
		}

		// Artifact anchors joined by messageId. Only 'generated' artifacts are
		// hoisted into the outline (input artifacts are surfaced in Resources
		// and would otherwise duplicate the user row's summary).
		const rs = receiptsByMessage.get(m.id) ?? [];
		for (const r of rs) {
			if (r.direction !== 'generated') continue;
			push(topic, m.id, {
				id: `art:${r.artifactId}`,
				kind: 'artifact',
				label: r.title || r.artifactId,
				messageId: m.id,
				order: order++,
				topic,
				meta: r.kind,
				createdAt: r.createdAt,
			});
		}
	}

	return groups;
}

/** Flatten groups back to a single ordered list — convenient for a11y scan. */
export function flattenOutline(groups: OutlineGroup[]): OutlineItem[] {
	const out: OutlineItem[] = [];
	for (const g of groups) out.push(...g.items);
	return out;
}

/**
 * Text filter applied after outline building. Kept on the model side so the
 * component stays a dumb renderer and the filter behavior is unit-testable.
 */
export function filterOutlineItems(groups: OutlineGroup[], query: string): OutlineGroup[] {
	const q = query.trim().toLowerCase();
	if (!q) return groups;
	return groups
		.map((g) => ({
			id: g.id,
			topic: g.topic,
			items: g.items.filter((it) =>
				it.label.toLowerCase().includes(q)
				|| (it.meta ? it.meta.toLowerCase().includes(q) : false)
			),
		}))
		.filter((g) => g.items.length > 0);
}

/**
 * Presentation adapter for the right-index Starred tab. It intentionally keeps
 * the outline's topic runs and reverse-chronological order, but removes every
 * non-message node and every message that was not explicitly starred.
 */
export function filterStarredOutlineItems(groups: OutlineGroup[]): OutlineGroup[] {
	return groups
		.map((group) => ({
			id: group.id,
			topic: group.topic,
			items: group.items.filter((item) => item.starred === true),
		}))
		.filter((group) => group.items.length > 0);
}

// ── Resource rows ────────────────────────────────────────────────────────────

/**
 * Row-level type surfaced in the Resources tab. Superset of ChatArtifactKind
 * because inbound Vault documents, URL sources, tool/process runs and plain
 * message references also live here per spec §10.2.
 */
export type ResourceRowKind =
	| 'message'
	| 'image'
	| 'audio'
	| 'video'
	| 'document'
	| 'url'
	| 'vault'
	| 'table'
	| 'code'
	| 'diagram'
	| 'base'
	| 'process'
	// Track D (2026-07-21): structured artifact_create outputs.
	| 'dataview'
	| 'extract'
	| 'reminder';

export type ResourceRowDirection = 'input' | 'generated';

export interface ResourceRow {
	id: string;
	direction: ResourceRowDirection;
	kind: ResourceRowKind;
	title: string;
	/** Anchor messageId — click locates the producing message. */
	messageId: string;
	/** Wallclock ordering / display timestamp. */
	createdAt: number;
	/** Where the row came from — used only for "Open" affordance. */
	target?:
		| { kind: 'vault'; path: string }
		| { kind: 'url'; url: string };
	/** Optional short producer hint (tool name / receipt kind). */
	producer?: string;
}

/** Map a `ChatArtifactKind` receipt onto the coarser Resources row kind. */
export function mapArtifactKind(k: ChatArtifactKind): ResourceRowKind {
	switch (k) {
		case 'image': return 'image';
		case 'audio': return 'audio';
		case 'video': return 'video';
		case 'document': return 'document';
		case 'table':
		case 'dataset': return 'table';
		case 'code':
		case 'diff': return 'code';
		case 'diagram':
		case 'drawing':
		case 'canvas': return 'diagram';
		case 'base': return 'base';
		case 'dataview': return 'dataview';
		case 'extract': return 'extract';
		case 'reminder': return 'reminder';
		default: return 'document';
	}
}

/**
 * Map a message-level `ResourceKind` onto the row kind. Message resources are
 * always inbound context, so this only decides which type chip lights up.
 */
export function mapMessageResourceKind(kind: ResourceKind | string, source: string): ResourceRowKind {
	const k = String(kind || '').toLowerCase();
	const src = source || '';
	if (k.startsWith('image') || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(src)) return 'image';
	if (/\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(src)) return 'audio';
	if (/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(src)) return 'video';
	if (/\.(drawio|excalidraw|mmd)$/i.test(src)) return 'diagram';
	if (/^(https?:)?\/\//i.test(src) || k === 'url' || k === 'link') return 'url';
	if (/\.(csv|tsv|xlsx?|parquet)$/i.test(src)) return 'table';
	if (/\.(md|markdown|txt|pdf|docx?|pptx?)$/i.test(src)) return 'document';
	// Fallback: an in-vault file with no known suffix is still a document.
	return 'document';
}

function basename(p: string): string {
	if (!p) return '';
	const parts = p.split(/[\\/]/);
	return parts[parts.length - 1] || p;
}

/**
 * Build the Resources tab row list from the three real data sources —
 * message resources (input), turn receipt actualSources (input), and artifact
 * receipts (generated / input, per receipt.direction). The producer of every
 * row is real; there is no regex guessing here.
 */
export function buildResourceRows(
	messages: ChatMessage[],
	artifactReceipts: ChatArtifactReceipt[],
	turnReceipts: TurnExecutionReceipt[],
): ResourceRow[] {
	const rows: ResourceRow[] = [];

	// 1) Inbound: user message resources (attachments / explicit refs).
	for (const m of messages) {
		if (m.role !== 'user') continue;
		const list = m.resources ?? [];
		list.forEach((r, i) => {
			const kind = mapMessageResourceKind(r.kind as string, r.source);
			const isUrl = kind === 'url';
			rows.push({
				id: `res:${m.id}:${r.id || i}`,
				direction: 'input',
				kind,
				title: basename(r.source) || r.source || '(untitled)',
				messageId: m.id,
				createdAt: m.createdAtTimestamp,
				target: isUrl
					? { kind: 'url', url: r.source }
					: { kind: 'vault', path: r.source },
			});
		});
	}

	// 2) Inbound: turn receipt actualSources — the runtime-proven vault docs and
	//    web sources consulted while producing an answer. This is the RUN-01
	//    evidence surface — it is deliberately separate from what the user
	//    ATTACHED so the reader can tell "I sent this" vs "the run consulted
	//    this" apart.
	for (const t of turnReceipts) {
		for (const doc of t.actualSources.vaultDocuments ?? []) {
			rows.push({
				id: `tv:${t.requestId}:${doc.id}`,
				direction: 'input',
				kind: 'vault',
				title: doc.title || basename(doc.path) || doc.id,
				messageId: t.messageId,
				createdAt: t.startedAt,
				target: { kind: 'vault', path: doc.path },
				producer: 'Vault',
			});
		}
		for (const web of t.actualSources.webSources ?? []) {
			rows.push({
				id: `tw:${t.requestId}:${web.id}`,
				direction: 'input',
				kind: 'url',
				title: web.title || web.url,
				messageId: t.messageId,
				createdAt: t.startedAt,
				target: { kind: 'url', url: web.url },
				producer: 'Web',
			});
		}
	}

	// 3) Artifact receipts — always the source of truth for generated outputs,
	//    but a receipt may declare `direction: 'input'` for a captured input
	//    (spec §12.2 permits both). Trust the receipt.
	for (const r of artifactReceipts) {
		const kind = mapArtifactKind(r.kind);
		const target: ResourceRow['target'] = r.vaultPath
			? { kind: 'vault', path: r.vaultPath }
			: r.externalUri
				? { kind: 'url', url: r.externalUri }
				: undefined;
		rows.push({
			id: `art:${r.artifactId}`,
			direction: r.direction,
			kind,
			title: r.title || r.artifactId,
			messageId: r.messageId,
			createdAt: r.createdAt,
			target,
			producer: r.kind,
		});
	}

	// 4) Process / tool nodes as first-class Resources rows — the "Process /
	//    Tool" filter category exists for exactly this. One row per assistant
	//    message with toolCalls; the target is the message itself.
	for (const m of messages) {
		if (m.role !== 'assistant') continue;
		const tools = m.toolCalls ?? [];
		if (tools.length === 0) continue;
		const names = tools.map((t) => t.toolName).filter(Boolean);
		const title = names.length === 1 ? names[0] : `${names.length} tool calls`;
		rows.push({
			id: `proc:${m.id}`,
			direction: 'generated',
			kind: 'process',
			title,
			messageId: m.id,
			createdAt: m.createdAtTimestamp,
			producer: names.join(', ') || 'process',
		});
	}

	// Deterministic order: primary by createdAt DESCENDING (newest first for
	// navigation, matching the reverse-chronological Outline tab), secondary by
	// id so ties stay stable across renders.
	rows.sort((a, b) => (b.createdAt - a.createdAt) || a.id.localeCompare(b.id));
	return rows;
}

// ── Resource filter contract ─────────────────────────────────────────────────

export type ResourceDirectionFilter = 'all' | 'input' | 'generated';
export type ResourceKindFilter = 'all' | ResourceRowKind;

export interface ResourceFilter {
	direction: ResourceDirectionFilter;
	kind: ResourceKindFilter;
	/** Optional conversation-scoped text query — same query as the Outline. */
	query?: string;
}

export const DEFAULT_RESOURCE_FILTER: ResourceFilter = { direction: 'all', kind: 'all' };

export function filterResourceRows(rows: ResourceRow[], filter: ResourceFilter): ResourceRow[] {
	const q = (filter.query ?? '').trim().toLowerCase();
	return rows.filter((row) => {
		if (filter.direction !== 'all' && row.direction !== filter.direction) return false;
		if (filter.kind !== 'all' && row.kind !== filter.kind) return false;
		if (q) {
			const hay = `${row.title} ${row.producer ?? ''}`.toLowerCase();
			if (!hay.includes(q)) return false;
		}
		return true;
	});
}

// ── Display helpers ──────────────────────────────────────────────────────────

/**
 * Short "HH:MM" clock label for a wallclock timestamp. Shared by the Outline
 * row subline (message rows) and the Resources row trailing time. Kept here
 * (the shared, DOM-free module) so both presentational tabs render identically.
 * Returns '' for a falsy / unparseable timestamp so the caller can collapse the
 * slot instead of showing "Invalid Date".
 */
export function formatTime(ts: number | undefined): string {
	if (!ts) return '';
	try {
		return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	} catch {
		return '';
	}
}
