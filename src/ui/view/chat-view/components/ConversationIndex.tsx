import React, { useMemo, useState, useCallback } from 'react';
import {
	Search,
	X,
	MessageSquare,
	MessagesSquare,
	FileText,
	Code,
	Network,
	Image as ImageIcon,
} from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import type { ChatMessage } from '@/service/chat/types';
import { useChatStrings } from '../chatStringsContext';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';
import { usePortalContainer } from '@/ui/react/PortalContainerContext';

/**
 * ConversationIndex — right-side navigator with 2 tabs.
 *
 * Tabs:
 *   - Overview  : mixed timeline — topic blocks + standalone messages + artifacts
 *   - Artifacts : grouped by kind (Images / Diagrams / Files / Code)
 *
 * (A separate "Messages" tab was dropped — Overview already shows every
 *  message, and the only difference would be hiding artifacts, which is
 *  rarely the user's actual goal. If the need re-emerges, add an Overview
 *  filter chip instead of a third tab.)
 *
 * Row alignment (all rows share the same anchor grid):
 *   [8 padding] [16 chev gutter] [12 gap] [26 main icon] [12 gap] [body] [meta]
 *
 * The chev gutter holds the expand chevron for topic rows and is an empty
 * placeholder for standalone-message + artifact rows. This keeps all main
 * icons (avatar / topic-icon / artifact-icon) on the same X across mixed
 * row types — without it, the panel reads as ragged at the left edge.
 *
 * Data sources:
 *   - `message.topic`         → topic grouping
 *   - `message.resources`     → attachment artifacts
 *   - ```fenced``` code blocks in assistant/user content → code/diagram artifacts
 *
 * Click any row → scrolls the chat body to `[data-message-id]` in the
 * leaf's own document (popout-safe via usePortalContainer).
 */

type TabId = 'overview' | 'artifacts';
type ArtifactKind = 'code' | 'file' | 'diagram' | 'image';

interface Artifact {
	id: string;
	messageId: string;
	messageIndex: number;
	kind: ArtifactKind;
	name: string;
	/** Full path of the source resource — `docs/ai/provider.md` style. Empty for
	 *  inline fenced code blocks (which have no on-disk source). Used as the
	 *  subtitle line of nested artifact rows so the file's vault location is
	 *  visible without expanding the row. */
	source?: string;
	language?: string;
	createdAt: number;
	/** True when artifact is backed by a vault resource (not an inline fenced block). */
	isSaved?: boolean;
}

const FENCE_RE = /```(\w*)[^\n]*\n([\s\S]*?)```/g;
const MAX_PREVIEW = 60;

/**
 * Strip common Markdown syntax so previews and topic names render as plain
 * text in the index panel — the index is a navigation surface, not a render
 * surface, so leaving `## hello` or `**bold**` in the label is just noise.
 */
function stripMarkdown(text: string): string {
	if (!text) return '';
	let out = text;
	out = out.replace(/```[\s\S]*?```/g, ' ');             // fenced code blocks
	out = out.replace(/`([^`]*)`/g, '$1');                  // inline code
	out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');     // images → alt
	out = out.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');      // links → text
	out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '');           // ATX headings
	out = out.replace(/^\s{0,3}>\s?/gm, '');                // blockquotes
	out = out.replace(/^\s*[-*+]\s+/gm, '');                // bullet markers
	out = out.replace(/^\s*\d+\.\s+/gm, '');                // ordered markers
	out = out.replace(/\*\*([^*]+)\*\*/g, '$1');            // **bold**
	out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2');    // *italic*
	out = out.replace(/__([^_]+)__/g, '$1');                // __bold__
	out = out.replace(/(^|[^_])_([^_\n]+)_/g, '$1$2');      // _italic_
	out = out.replace(/~~([^~]+)~~/g, '$1');                // ~~strike~~
	return out;
}

function trimText(text: string, max = MAX_PREVIEW): string {
	const flat = stripMarkdown(text).replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	return flat.slice(0, max - 1).trimEnd() + '…';
}

function formatTimestamp(ts: number): string {
	if (!ts) return '';
	try {
		const d = new Date(ts);
		return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	} catch {
		return '';
	}
}

function inferArtifactKindFromLang(lang: string): ArtifactKind {
	const l = lang.toLowerCase();
	if (l === 'mermaid' || l === 'plantuml' || l === 'dot') return 'diagram';
	if (l === 'svg' || l === 'graphviz') return 'diagram';
	if (l === '' || l === 'text') return 'file';
	return 'code';
}

function inferArtifactKindFromResource(kind: string | undefined, source: string): ArtifactKind {
	const k = (kind || '').toLowerCase();
	if (k.startsWith('image') || /\.(png|jpe?g|gif|webp|svg)$/i.test(source)) return 'image';
	if (/\.(drawio|excalidraw|mmd)$/i.test(source)) return 'diagram';
	return 'file';
}

function scrollToMessageInDoc(messageId: string, doc: Document) {
	// `doc` is the leaf-scoped document: in the main window it's `document`; in
	// a popout window (Studio etc.) it's the popout's own document. Using the
	// global `document` here misses messages rendered in a popout — they live
	// in a different document and querySelector returns null.
	const win = doc.defaultView ?? window;
	const performScroll = () => {
		const el = doc.querySelector(
			`[data-message-id="${CSS.escape(messageId)}"]`
		) as HTMLElement | null;
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		el.style.transition = 'background-color 0.4s ease';
		const prev = el.style.backgroundColor;
		el.style.backgroundColor = 'var(--pk-accent-tint)';
		win.setTimeout(() => {
			el.style.backgroundColor = prev;
		}, 900);
	};

	win.requestAnimationFrame(performScroll);
}

function useScrollToMessage(): (messageId: string) => void {
	const chatNavigation = useChatNavigation();
	const portalContainer = usePortalContainer();
	return useCallback(
		(messageId: string) => {
			// First, bring the chat surface to the front. In Studio mode chat +
			// outline share a leaf so this is a no-op; in legacy mode the outline
			// sits in the right sidebar and we reveal the chat leaf without
			// stealing focus. Reveal goes through the chat-navigation port so we
			// don't import view-type constants from `@/app/view/types`.
			void chatNavigation.revealChatView();
			const doc = portalContainer?.ownerDocument ?? document;
			scrollToMessageInDoc(messageId, doc);
		},
		[portalContainer, chatNavigation],
	);
}

function ArtifactIcon({ kind }: { kind: ArtifactKind }) {
	if (kind === 'code') return <Code aria-hidden />;
	if (kind === 'diagram') return <Network aria-hidden />;
	if (kind === 'image') return <ImageIcon aria-hidden />;
	return <FileText aria-hidden />;
}

/**
 * TimelineItem — building block for the mixed Overview / Messages tabs.
 *
 * The store gives us a flat ChatMessage[] with `message.topic` as the
 * grouping key. We walk that array once and produce a sequence of items
 * where consecutive same-topic messages collapse into a single `topic`
 * item and no-topic messages remain as `standalone-msg` items. This
 * preserves chronological order across topic boundaries, which a naive
 * `groupBy(topic)` would lose (it would place all no-topic messages at
 * the first occurrence and bunch all same-topic messages together even
 * if they were interleaved).
 */
type TimelineItem =
	| { kind: 'standalone-msg'; message: ChatMessage; index: number }
	| { kind: 'topic'; name: string; messages: ChatMessage[]; indices: number[] };

function buildMixedTimeline(messages: ChatMessage[]): TimelineItem[] {
	const out: TimelineItem[] = [];
	let i = 0;
	while (i < messages.length) {
		const m = messages[i];
		const topic = (m.topic || '').trim();
		if (!topic) {
			out.push({ kind: 'standalone-msg', message: m, index: i });
			i += 1;
			continue;
		}
		const start = i;
		while (i < messages.length && (messages[i].topic || '').trim() === topic) {
			i += 1;
		}
		const indices = Array.from({ length: i - start }, (_, k) => start + k);
		out.push({
			kind: 'topic',
			name: topic,
			messages: messages.slice(start, i),
			indices,
		});
	}
	return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row primitives — share `.pkchat-idx-row` so every row sits on the same
// [chev | icon | body | time] grid. See file header for the alignment rule.
// ─────────────────────────────────────────────────────────────────────────────

interface MessageRowProps {
	message: ChatMessage;
	nested?: boolean;
	onClick: () => void;
}

function MessageRow({ message, nested, onClick }: MessageRowProps) {
	const isError = message.isErrorMessage;
	const role = isError ? 'error' : message.role === 'user' ? 'user' : 'assistant';
	const letter = isError ? '!' : message.role === 'user' ? 'U' : 'P';
	return (
		<button
			type="button"
			className={`pkchat-idx-row${nested ? ' pkchat-idx-row--nested' : ''}`}
			onClick={onClick}
		>
			<span className="pkchat-idx-row__avatar" data-role={role}>{letter}</span>
			<span className="pkchat-idx-row__body">
				<span className="pkchat-idx-row__title">
					{trimText(message.content || ' ')}
				</span>
			</span>
			{message.createdAtTimestamp ? (
				<span className="pkchat-idx-row__time">{formatTimestamp(message.createdAtTimestamp)}</span>
			) : null}
		</button>
	);
}

interface TopicBlockProps {
	name: string;
	preview: string;
	totalMessages: number;
	firstIndex: number;
	lastIndex: number;
	defaultExpanded?: boolean;
	/** Pre-assembled nested rows (messages + artifacts interleaved by index).
	 *  TopicBlock stays presentational — the caller decides what mix to put
	 *  inside, so the same component serves Overview (messages + artifacts)
	 *  and Messages (messages only). */
	nested: React.ReactNode;
}

/**
 * Collapsible topic block. Click the header row to toggle.
 * When collapsed, the nested rows + the vertical guide line both hide.
 * The chevron rotates -90° via CSS.
 */
function TopicBlock({
	name,
	preview,
	totalMessages,
	firstIndex,
	lastIndex,
	defaultExpanded = false,
	nested,
}: TopicBlockProps) {
	const [expanded, setExpanded] = useState(defaultExpanded);
	const strings = useChatStrings();
	const widthPct = totalMessages > 0
		? Math.max(4, Math.min(100, ((lastIndex - firstIndex + 1) / totalMessages) * 100))
		: 0;
	return (
		<div className={`pkchat-idx-topic${expanded ? '' : ' pkchat-idx-topic--collapsed'}`}>
			<button
				type="button"
				className="pkchat-idx-row pkchat-idx-topic__head"
				onClick={() => setExpanded((v) => !v)}
				aria-expanded={expanded}
			>
				{/* Icon doubles as the expand toggle — single bubble = collapsed,
				    stacked bubbles = expanded. Replaces the prior chev+icon pair
				    so the topic row reads with the same visual rhythm as the
				    left-rail Project rows (Folder ⇄ FolderOpen as the toggle). */}
				<span className="pkchat-idx-row__icon pkchat-idx-topic__toggle">
					{expanded ? <MessagesSquare aria-hidden /> : <MessageSquare aria-hidden />}
				</span>
				<span className="pkchat-idx-row__body">
					<span className="pkchat-idx-row__title">
						{stripMarkdown(name) || strings.index.topicNoTopic}
					</span>
					{preview && <span className="pkchat-idx-row__desc">{preview}</span>}
				</span>
				<span className="pkchat-idx-topic__progress" aria-hidden>
					<span
						className="pkchat-idx-topic__progress-fill"
						style={{ width: `${widthPct}%` }}
					/>
				</span>
			</button>
			{expanded && (
				<div className="pkchat-idx-topic__nested">{nested}</div>
			)}
		</div>
	);
}

interface ArtifactRowProps {
	artifact: Artifact;
	/** When true, the row renders in the compact "inside a topic" form:
	 *    title + path subtitle, plain outline icon, no lavender thumb,
	 *    no kind chip, no topic chip — the surrounding topic supplies
	 *    that context implicitly. Mock 01: `provider.md` row inside
	 *    "API profile setup". */
	nested?: boolean;
	/** Name of the parent topic, used for the `Kind · <topic>` meta line
	 *  on top-level artifact rows. Omitted (or empty) on nested rows. */
	topicName?: string;
	onClick: () => void;
}

function ArtifactRow({ artifact, nested, topicName, onClick }: ArtifactRowProps) {
	const strings = useChatStrings();
	const kindLabel =
		artifact.kind === 'code' ? strings.index.artifactKindCode
		: artifact.kind === 'diagram' ? strings.index.artifactKindDiagram
		: artifact.kind === 'image' ? strings.index.artifactKindImage
		: strings.index.artifactKindFile;
	const rowClass = nested
		? 'pkchat-idx-row pkchat-idx-row--nested pkchat-idx-row--artifact-nested'
		: 'pkchat-idx-row pkchat-idx-row--artifact';
	const iconClass = nested
		? 'pkchat-idx-row__icon'
		: 'pkchat-idx-row__icon pkchat-idx-row__icon--artifact';
	return (
		<button type="button" className={rowClass} onClick={onClick}>
			<span className={iconClass} data-kind={artifact.kind}>
				<ArtifactIcon kind={artifact.kind} />
			</span>
			<span className="pkchat-idx-row__body">
				<span className="pkchat-idx-row__title">{artifact.name}</span>
				{nested
					? artifact.source && (
						<span className="pkchat-idx-row__desc">{artifact.source}</span>
					)
					: (
						<span className="pkchat-idx-row__sub">
							<span className="pkchat-idx-row__kind">{kindLabel}</span>
							{topicName && (
								<>
									<span className="pkchat-idx-row__sub-sep" aria-hidden>·</span>
									<span className="pkchat-idx-row__meta-chip">{topicName}</span>
								</>
							)}
						</span>
					)
				}
			</span>
			{artifact.createdAt ? (
				<span className="pkchat-idx-row__time">{formatTimestamp(artifact.createdAt)}</span>
			) : null}
		</button>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface ConversationIndexProps {
	onClose?: () => void;
	/** Compact layout for the narrow Obsidian right-sidebar leaf:
	 *  - hides the "Conversation Index" header title (keeps the bar)
	 *  - centers the Overview / Artifacts tabs
	 *  Studio's wider right column omits this prop and keeps the legacy
	 *  title + left-aligned tabs layout. */
	compact?: boolean;
}

export const ConversationIndex: React.FC<ConversationIndexProps> = ({ onClose, compact = false }) => {
	const strings = useChatStrings();
	const messages = useChatDataStore((s) => s.messages);
	const [tab, setTab] = useState<TabId>('overview');
	const [query, setQuery] = useState('');

	const totalMessages = messages.length;

	const artifacts = useMemo<Artifact[]>(() => {
		const out: Artifact[] = [];
		messages.forEach((m, idx) => {
			(m.resources ?? []).forEach((r, j) => {
				const baseName = r.source.split('/').pop() || r.source;
				out.push({
					id: `${m.id}::res::${r.id || j}`,
					messageId: m.id,
					messageIndex: idx,
					kind: inferArtifactKindFromResource(r.kind as string, r.source),
					name: trimText(baseName, 48),
					// Only carry the full path when it differs from the basename — a
					// bare filename like "notes.md" would render an identical
					// duplicate subtitle line otherwise.
					source: r.source !== baseName ? r.source : undefined,
					createdAt: m.createdAtTimestamp,
					isSaved: true,
				});
			});
			if (m.role !== 'assistant' && m.role !== 'user') return;
			const text = m.content || '';
			FENCE_RE.lastIndex = 0;
			let match: RegExpExecArray | null;
			let count = 0;
			while ((match = FENCE_RE.exec(text)) !== null) {
				const lang = (match[1] || '').trim();
				const body = (match[2] || '').trim();
				if (!body) continue;
				count += 1;
				const kind = inferArtifactKindFromLang(lang);
				const firstLine = body.split('\n')[0].slice(0, 40);
				const label = lang ? `${lang} · ${firstLine || `block ${count}`}` : firstLine || `block ${count}`;
				out.push({
					id: `${m.id}::code::${count}`,
					messageId: m.id,
					messageIndex: idx,
					kind,
					name: trimText(label, 48),
					language: lang || undefined,
					createdAt: m.createdAtTimestamp,
				});
			}
		});
		return out;
	}, [messages]);

	const timeline = useMemo(() => buildMixedTimeline(messages), [messages]);

	const topicByMessageIndex = useMemo(() => {
		const map = new Map<number, string>();
		messages.forEach((m, i) => {
			const t = (m.topic || '').trim();
			if (t) map.set(i, t);
		});
		return map;
	}, [messages]);

	const q = query.trim().toLowerCase();
	const filteredTimeline = useMemo(() => {
		if (!q) return timeline;
		return timeline.filter((item) => {
			if (item.kind === 'standalone-msg') {
				return (item.message.content || '').toLowerCase().includes(q);
			}
			return item.name.toLowerCase().includes(q)
				|| item.messages.some((m) => (m.content || '').toLowerCase().includes(q));
		});
	}, [timeline, q]);

	const filteredArtifacts = useMemo(() => {
		if (!q) return artifacts;
		return artifacts.filter((a) => a.name.toLowerCase().includes(q));
	}, [artifacts, q]);

	const searchPlaceholder =
		tab === 'artifacts' ? strings.index.searchArtifacts
		: strings.index.searchOverview;

	return (
		<div className="pkchat-idx">
			{(!compact || onClose) && (
				<div className="pkchat-idx__head">
					{!compact && <span className="pkchat-idx__title">{strings.index.panelTitle}</span>}
					<div className="pkchat-idx__head-actions">
						{onClose && (
							<IconButton
								label={strings.index.closeLabel}
								title={strings.index.closeLabel}
								onClick={onClose}
							>
								<X />
							</IconButton>
						)}
					</div>
				</div>
			)}

			<div className="pkchat-idx__search">
				<Search aria-hidden />
				<input
					type="text"
					value={query}
					placeholder={searchPlaceholder}
					onChange={(e) => setQuery(e.target.value)}
				/>
				{query.length === 0 && <span className="pkchat-idx__kbd" aria-hidden>⌘K</span>}
			</div>

			{/* Tabs — bespoke underline-style tabs rather than the Segmented
				pill primitive: the locked design (Mock 01) calls for flat
				labels with a 2px dark underline on the active tab, which the
				Segmented control's filled-pill aesthetic actively fights. */}
			<div
				className={`pkchat-idx__tabs${compact ? ' pkchat-idx__tabs--centered' : ''}`}
				role="tablist"
				aria-label={strings.index.panelTitle}
			>
				{(
					[
						['overview', strings.index.tabOverview],
						['artifacts', strings.index.tabArtifacts],
					] as Array<[TabId, string]>
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						role="tab"
						aria-selected={tab === value}
						className={`pkchat-idx__tab${tab === value ? ' pkchat-idx__tab--active' : ''}`}
						onClick={() => setTab(value)}
					>
						{/* Inner span so the active-tab underline only spans the label
						   width, not the full grid-column the button occupies. */}
						<span className="pkchat-idx__tab-label">{label}</span>
					</button>
				))}
			</div>

			<div className="pkchat-idx__list">
				{tab === 'overview' && (
					<OverviewTabBody
						timeline={filteredTimeline}
						artifacts={artifacts}
						totalMessages={totalMessages}
					/>
				)}
				{tab === 'artifacts' && (
					<ArtifactsTabBody
						artifacts={filteredArtifacts}
						topicByMessageIndex={topicByMessageIndex}
					/>
				)}
			</div>

			<div className="pkchat-idx__foot">
				<span>
					{tab === 'artifacts' ? strings.index.footerArtifacts : strings.index.footerOverview}
				</span>
			</div>
		</div>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab bodies
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a nested-row sequence that interleaves messages and artifacts in
 * chronological order. Used by both Overview (mixed) and — with empty
 * artifacts — Messages (msg-only). Each entry's `idx` is the position in
 * the full message array, which gives us a stable sort key across types.
 */
type NestedEntry =
	| { type: 'message'; idx: number; message: ChatMessage }
	| { type: 'artifact'; idx: number; artifact: Artifact };

function interleaveNested(
	messages: ChatMessage[],
	indices: number[],
	artifacts: Artifact[],
): NestedEntry[] {
	const items: NestedEntry[] = [];
	messages.forEach((m, i) => items.push({ type: 'message', idx: indices[i], message: m }));
	artifacts.forEach((a) => items.push({ type: 'artifact', idx: a.messageIndex, artifact: a }));
	items.sort((a, b) => a.idx - b.idx);
	return items;
}

function renderNested(
	entries: NestedEntry[],
	onMessageClick: (m: ChatMessage) => void,
	onArtifactClick: (a: Artifact) => void,
) {
	return entries.map((entry) => {
		if (entry.type === 'message') {
			return (
				<MessageRow
					key={`m-${entry.message.id}`}
					message={entry.message}
					nested
					onClick={() => onMessageClick(entry.message)}
				/>
			);
		}
		return (
			<ArtifactRow
				key={`a-${entry.artifact.id}`}
				artifact={entry.artifact}
				nested
				onClick={() => onArtifactClick(entry.artifact)}
			/>
		);
	});
}

interface OverviewTabBodyProps {
	timeline: TimelineItem[];
	artifacts: Artifact[];
	totalMessages: number;
}

function OverviewTabBody({ timeline, artifacts, totalMessages }: OverviewTabBodyProps) {
	const strings = useChatStrings();
	const scrollToMessage = useScrollToMessage();
	if (!timeline.length) {
		return <div className="pkchat-idx__empty">{strings.index.emptyAll}</div>;
	}
	return (
		<>
			{timeline.map((item, i) => {
				if (item.kind === 'standalone-msg') {
					// Render the standalone message followed by any artifacts produced
					// at that exact message position, so "the prompt → its outputs"
					// reads as a single beat in the timeline.
					const msgArtifacts = artifacts.filter((a) => a.messageIndex === item.index);
					return (
						<React.Fragment key={`m-${item.message.id}`}>
							<MessageRow
								message={item.message}
								onClick={() => scrollToMessage(item.message.id)}
							/>
							{msgArtifacts.map((a) => (
								<ArtifactRow
									key={a.id}
									artifact={a}
									topicName={undefined}
									onClick={() => scrollToMessage(a.messageId)}
								/>
							))}
						</React.Fragment>
					);
				}
				// Topic — interleave its messages + artifacts in chronological order
				// inside the nested body. Mock 01 places `provider.md` between the
				// user prompt and the assistant reply inside the same topic, not as
				// a stray row after the topic block.
				const topicArtifacts = artifacts.filter((a) => item.indices.includes(a.messageIndex));
				const nested = renderNested(
					interleaveNested(item.messages, item.indices, topicArtifacts),
					(m) => scrollToMessage(m.id),
					(a) => scrollToMessage(a.messageId),
				);
				const preview = trimText(item.messages.map((m) => m.content || '').join(' '), 80);
				return (
					<TopicBlock
						key={`t-${i}-${item.name}`}
						name={item.name}
						preview={preview}
						totalMessages={totalMessages}
						firstIndex={item.indices[0]}
						lastIndex={item.indices[item.indices.length - 1]}
						defaultExpanded={i === 0}
						nested={nested}
					/>
				);
			})}
		</>
	);
}

interface ArtifactsTabBodyProps {
	artifacts: Artifact[];
	/** Map from messageIndex → topic name. Lets each artifact row surface
	 *  its parent topic ("Image · API profile setup") without re-walking
	 *  the message list. */
	topicByMessageIndex: Map<number, string>;
}

const ARTIFACT_KIND_ORDER: ArtifactKind[] = ['image', 'diagram', 'file', 'code'];

function ArtifactsTabBody({ artifacts, topicByMessageIndex }: ArtifactsTabBodyProps) {
	const strings = useChatStrings();
	const scrollToMessage = useScrollToMessage();
	if (!artifacts.length) {
		return <div className="pkchat-idx__empty">{strings.index.emptyArtifacts}</div>;
	}
	const groups = new Map<ArtifactKind, Artifact[]>();
	for (const k of ARTIFACT_KIND_ORDER) groups.set(k, []);
	for (const a of artifacts) {
		const arr = groups.get(a.kind);
		if (arr) arr.push(a);
	}
	const kindHeader = (k: ArtifactKind) =>
		k === 'image' ? strings.index.artifactKindHeaderImages
		: k === 'diagram' ? strings.index.artifactKindHeaderDiagrams
		: k === 'file' ? strings.index.artifactKindHeaderFiles
		: strings.index.artifactKindHeaderCode;
	return (
		<>
			{ARTIFACT_KIND_ORDER
				.filter((k) => (groups.get(k) ?? []).length > 0)
				.map((k) => {
					const items = groups.get(k) ?? [];
					return (
						<React.Fragment key={k}>
							<div className="pkchat-idx-group-header">
								{kindHeader(k)}
								<span className="pkchat-idx-group-header__count">· {items.length}</span>
							</div>
							{items.map((a) => (
								<ArtifactRow
									key={a.id}
									artifact={a}
									topicName={topicByMessageIndex.get(a.messageIndex)}
									onClick={() => scrollToMessage(a.messageId)}
								/>
							))}
						</React.Fragment>
					);
				})}
		</>
	);
}
