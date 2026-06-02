import React, { useMemo, useState, useCallback } from 'react';
import {
	Search,
	X,
	ChevronRight,
	MessageSquare,
	FileText,
	Code,
	Network,
	Image as ImageIcon,
	Paperclip,
	ArrowUpRight,
} from 'lucide-react';
import { Segmented, IconButton, Pill, Chip } from '@/ui/components/primitives';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import type { ChatMessage } from '@/service/chat/types';
import { useChatStrings } from '../chatStringsContext';
import { AppContext } from '@/app/context/AppContext';
import { CHAT_VIEW_TYPE } from '@/app/view/types';

/**
 * ConversationIndex — right-side navigator with 4 tabs (PR-Chat-3).
 *
 * Tabs:
 *   - All        : flat newest-first list (topics + artifacts + messages)
 *   - Topics     : accordion of topic groups with position bar + attachments
 *   - Artifacts  : first-class card grid (code/file/diagram/image)
 *   - Messages   : flat scrollable list with role filters and quick jump
 *
 * Data sources:
 *   - `message.topic`   (string, optional)  → topic grouping
 *   - `message.resources` (ChatResourceRef[]) → attachment chips
 *   - assistant message ```fenced``` code blocks → code/diagram artifacts
 *
 * Click any row/card → scrolls to the matching `[data-message-id]` element
 * in the chat body (rendered by MessageViewItemRetained).
 *
 * Strings live in `chatStrings.ts` + `templates/config/chat.json`. PR-Chat-4
 * will migrate to the TemplateManager runtime loader. Service layer is NOT
 * touched — this is a pure UI consumer of the message store.
 */

type TabId = 'all' | 'topics' | 'artifacts' | 'messages';
type ArtifactKind = 'code' | 'file' | 'diagram' | 'image';
type ArtifactFilter = 'all' | ArtifactKind;
type MessageFilter = 'all' | 'user' | 'assistant' | 'error';

interface Artifact {
	id: string;
	messageId: string;
	messageIndex: number;
	kind: ArtifactKind;
	name: string;
	language?: string;
	createdAt: number;
	/** True when artifact is backed by a vault resource (not an inline fenced block). */
	isSaved?: boolean;
}

interface TopicGroup {
	name: string;        // canonical name, '' = no-topic bucket
	messages: ChatMessage[];
	indices: number[];   // positions in the full message array (0-based)
	firstIndex: number;
	lastIndex: number;
}

const FENCE_RE = /```(\w*)[^\n]*\n([\s\S]*?)```/g;
const MAX_PREVIEW = 60;

/**
 * Strip common Markdown syntax so previews and topic names render as plain
 * text in the index panel — the index is a navigation surface, not a render
 * surface, so leaving `## hello` or `**bold**` in the label is just noise.
 *
 * Cheap regex pass — not a full Markdown parser. Order matters: drop fences
 * before stripping inline syntax so we don't leave dangling backticks.
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

/**
 * Day key for grouping messages in the Messages tab.
 * Returns an ISO date stamp (YYYY-MM-DD) — stable across timezones for grouping,
 * and a human label for display.
 */
function dayKey(ts: number): string {
	if (!ts) return '';
	const d = new Date(ts);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(ts: number): string {
	if (!ts) return '';
	const d = new Date(ts);
	return d.toLocaleDateString([], {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
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

function scrollToMessage(messageId: string) {
	// First, make sure the chat leaf is the active center pane. The outline
	// lives in Obsidian's right sidebar; if the user is focused on a markdown
	// document, the chat-rendered message DOM may not be visible. revealLeaf
	// brings the chat leaf to the front without stealing focus from the
	// outline (so the user can keep clicking outline items).
	try {
		const app = AppContext.getInstance().app;
		const chatLeaf = app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];
		if (chatLeaf) {
			app.workspace.revealLeaf(chatLeaf);
		}
	} catch {
		// Best-effort — fall through to the scroll path even if app lookup fails.
	}

	// querySelector is global to the workspace DOM, so it finds the chat
	// message even though the outline is in a separate Obsidian leaf.
	const performScroll = () => {
		const el = document.querySelector(
			`[data-message-id="${CSS.escape(messageId)}"]`
		) as HTMLElement | null;
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		// Flash highlight: use the same accent tint briefly.
		el.style.transition = 'background-color 0.4s ease';
		const prev = el.style.backgroundColor;
		el.style.backgroundColor = 'var(--pk-accent-tint)';
		window.setTimeout(() => {
			el.style.backgroundColor = prev;
		}, 900);
	};

	// Allow one frame for revealLeaf to settle before scrolling.
	window.requestAnimationFrame(performScroll);
}

function ArtifactIcon({ kind }: { kind: ArtifactKind }) {
	if (kind === 'code') return <Code aria-hidden />;
	if (kind === 'diagram') return <Network aria-hidden />;
	if (kind === 'image') return <ImageIcon aria-hidden />;
	return <FileText aria-hidden />;
}

function MessageRowItem({
	role,
	text,
	timestamp,
	suffix,
	onClick,
	isError,
	variant = 'card',
}: {
	role: 'user' | 'assistant' | 'system';
	text: string;
	timestamp: number;
	suffix?: string;
	onClick: () => void;
	isError?: boolean;
	/** `card` = bordered (Topics body, All tab); `flat` = unboxed (Messages tab) */
	variant?: 'card' | 'flat';
}) {
	const whoRole = isError ? 'error' : role === 'user' ? 'user' : 'assistant';
	const letter = isError ? '!' : role === 'user' ? 'U' : 'P';
	return (
		<button
			type="button"
			className="pkchat-idx-msg"
			data-variant={variant === 'flat' ? 'flat' : undefined}
			onClick={onClick}
		>
			<span className="pkchat-idx-msg__who" data-role={whoRole}>{letter}</span>
			<span className="pkchat-idx-msg__body">
				<span className="pkchat-idx-msg__text">{text || ' '}</span>
				<span className="pkchat-idx-msg__meta">
					{timestamp ? <span className="pkchat-idx-msg__ts">{formatTimestamp(timestamp)}</span> : null}
					{suffix ? <span>{suffix}</span> : null}
				</span>
			</span>
		</button>
	);
}

export const ConversationIndex: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
	const strings = useChatStrings();
	const messages = useChatDataStore((s) => s.messages);
	const [tab, setTab] = useState<TabId>('topics');
	const [query, setQuery] = useState('');
	const [artifactFilter, setArtifactFilter] = useState<ArtifactFilter>('all');
	const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');

	const totalMessages = messages.length;

	// Derive artifacts from message resources + fenced code blocks.
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
				const label = lang
					? `${lang} · ${firstLine || `block ${count}`}`
					: firstLine || `block ${count}`;
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

	// Derive topic groups in order of first occurrence.
	const topics = useMemo<TopicGroup[]>(() => {
		const groupMap = new Map<string, TopicGroup>();
		const order: string[] = [];
		messages.forEach((m, idx) => {
			const key = (m.topic || '').trim();
			let g = groupMap.get(key);
			if (!g) {
				g = { name: key, messages: [], indices: [], firstIndex: idx, lastIndex: idx };
				groupMap.set(key, g);
				order.push(key);
			}
			g.messages.push(m);
			g.indices.push(idx);
			g.lastIndex = idx;
		});
		return order.map((k) => groupMap.get(k)!);
	}, [messages]);

	const filteredArtifacts = useMemo(() => {
		const q = query.trim().toLowerCase();
		return artifacts.filter((a) => {
			if (artifactFilter !== 'all' && a.kind !== artifactFilter) return false;
			if (q && !a.name.toLowerCase().includes(q)) return false;
			return true;
		});
	}, [artifacts, artifactFilter, query]);

	const filteredMessages = useMemo(() => {
		const q = query.trim().toLowerCase();
		return messages
			.map((m, idx) => ({ m, idx }))
			.filter(({ m }) => {
				if (messageFilter === 'user' && m.role !== 'user') return false;
				if (messageFilter === 'assistant' && m.role !== 'assistant') return false;
				if (messageFilter === 'error' && !m.isErrorMessage) return false;
				if (q && !(m.content || '').toLowerCase().includes(q)) return false;
				return true;
			});
	}, [messages, messageFilter, query]);

	const searchPlaceholder =
		tab === 'topics' ? strings.index.searchTopics
		: tab === 'artifacts' ? strings.index.searchArtifacts
		: tab === 'messages' ? strings.index.searchMessages
		: strings.index.searchAll;

	const handleArtifactFilterChange = useCallback((next: ArtifactFilter) => setArtifactFilter(next), []);
	const handleMessageFilterChange = useCallback((next: MessageFilter) => setMessageFilter(next), []);

	return (
		<div className="pkchat-idx">
			<div className="pkchat-idx__head">
				<span className="pkchat-idx__title">{strings.index.panelTitle}</span>
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

			<div className="pkchat-idx__search">
				<Search aria-hidden />
				<input
					type="text"
					value={query}
					placeholder={searchPlaceholder}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>

			<div className="pkchat-idx__tabs">
				<Segmented<TabId>
					value={tab}
					onValueChange={setTab}
					aria-label={strings.index.panelTitle}
					options={[
						{ value: 'all', label: strings.index.tabAll },
						{ value: 'topics', label: strings.index.tabTopics },
						{ value: 'artifacts', label: strings.index.tabArtifacts },
						{ value: 'messages', label: strings.index.tabMessages },
					]}
				/>
			</div>

			{tab === 'artifacts' && (
				<div className="pkchat-idx__filters">
					{(
						[
							['all', strings.index.artifactFilterAll],
							['code', strings.index.artifactFilterCode],
							['diagram', strings.index.artifactFilterDiagrams],
							['file', strings.index.artifactFilterFiles],
							['image', strings.index.artifactFilterImages],
						] as Array<[ArtifactFilter, string]>
					).map(([v, label]) => (
						<Pill
							key={v}
							selected={artifactFilter === v}
							onClick={() => handleArtifactFilterChange(v)}
						>
							{label}
						</Pill>
					))}
				</div>
			)}

			{tab === 'messages' && (
				<div className="pkchat-idx__filters">
					{(
						[
							['all', strings.index.messageFilterAll],
							['user', strings.index.messageFilterUser],
							['assistant', strings.index.messageFilterAssistant],
							['error', strings.index.messageFilterErrors],
						] as Array<[MessageFilter, string]>
					).map(([v, label]) => (
						<Pill
							key={v}
							selected={messageFilter === v}
							onClick={() => handleMessageFilterChange(v)}
						>
							{label}
						</Pill>
					))}
				</div>
			)}

			<div className="pkchat-idx__list">
				{tab === 'all' && (
					<AllTabBody
						topics={topics}
						artifacts={artifacts}
						messages={messages}
						query={query}
					/>
				)}
				{tab === 'topics' && (
					<TopicsTabBody
						topics={topics}
						totalMessages={totalMessages}
						artifacts={artifacts}
						query={query}
					/>
				)}
				{tab === 'artifacts' && (
					<ArtifactsTabBody artifacts={filteredArtifacts} />
				)}
				{tab === 'messages' && (
					<MessagesTabBody entries={filteredMessages} />
				)}
			</div>

			<div className="pkchat-idx__foot">
				<span>
					{tab === 'topics' ? strings.index.footerTopics
						: tab === 'artifacts' ? strings.index.footerArtifacts
						: tab === 'messages' ? strings.index.footerMessages
						: strings.index.footerAll}
				</span>
			</div>
		</div>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// Tab bodies (kept inside this file — small, single-purpose, share helpers)
// ─────────────────────────────────────────────────────────────────────────────

function AllTabBody({
	topics,
	artifacts,
	messages,
	query,
}: {
	topics: TopicGroup[];
	artifacts: Artifact[];
	messages: ChatMessage[];
	query: string;
}) {
	const strings = useChatStrings();
	const q = query.trim().toLowerCase();
	const filteredTopics = topics.filter((t) => !q || t.name.toLowerCase().includes(q));
	const filteredArtifacts = artifacts.filter((a) => !q || a.name.toLowerCase().includes(q));
	const filteredMessages = messages.filter((m) => !q || (m.content || '').toLowerCase().includes(q));

	if (!messages.length) {
		return <div className="pkchat-idx__empty">{strings.index.emptyAll}</div>;
	}

	return (
		<>
			{filteredTopics.length > 0 && (
				<>
					<div className="pkchat-idx__section-header">
						{strings.index.allTopicsHeader}
						<Chip variant="neutral">{filteredTopics.length}</Chip>
					</div>
					{filteredTopics.slice(0, 5).map((t, i) => {
						const sub = trimText(t.messages.map((m) => m.content || '').join(' '), 80);
						return (
							<button
								key={`topic-${i}-${t.name}`}
								type="button"
								className="pkchat-idx-msg"
								onClick={() => scrollToMessage(t.messages[0].id)}
							>
								{/*
								  Plain outline icon (reuses .pkchat-idx-topic__icon
								  spec — 14px, text-secondary). Previously this used
								  .pkchat-idx-msg__who which renders a purple-tinted
								  letter badge meant for actual message-author
								  letters (P/U/!), giving topic rows an out-of-place
								  filled square that diverged from the mock.
								*/}
								<MessageSquare className="pkchat-idx-topic__icon" aria-hidden style={{ marginTop: 2 }} />
								<span className="pkchat-idx-msg__body">
									<span className="pkchat-idx-msg__text">
										{stripMarkdown(t.name) || strings.index.topicNoTopic}
									</span>
									{sub && (
										<span className="pkchat-idx-msg__desc">{sub}</span>
									)}
									<span className="pkchat-idx-msg__meta">
										<span>{t.messages.length} msg</span>
									</span>
								</span>
								<ArrowUpRight aria-hidden style={{ width: 14, height: 14, color: 'var(--pk-text-tertiary)', marginTop: 2 }} />
							</button>
						);
					})}
				</>
			)}

			{filteredArtifacts.length > 0 && (
				<>
					<div className="pkchat-idx__section-header">
						{strings.index.allArtifactsHeader}
						<Chip variant="neutral">{filteredArtifacts.length}</Chip>
					</div>
					{filteredArtifacts.slice(0, 5).map((a) => (
						<ArtifactCard key={a.id} artifact={a} />
					))}
				</>
			)}

			{filteredMessages.length > 0 && (
				<>
					<div className="pkchat-idx__section-header">
						{strings.index.allMessagesHeader}
						<Chip variant="neutral">{filteredMessages.length}</Chip>
					</div>
					{filteredMessages
						.slice()
						.reverse()
						.slice(0, 8)
						.map((m) => (
							<MessageRowItem
								key={m.id}
								role={m.role === 'user' ? 'user' : 'assistant'}
								isError={m.isErrorMessage}
								text={trimText(m.content || '')}
								timestamp={m.createdAtTimestamp}
								onClick={() => scrollToMessage(m.id)}
							/>
						))}
				</>
			)}
		</>
	);
}

function TopicsTabBody({
	topics,
	totalMessages,
	artifacts,
	query,
}: {
	topics: TopicGroup[];
	totalMessages: number;
	artifacts: Artifact[];
	query: string;
}) {
	const strings = useChatStrings();
	const q = query.trim().toLowerCase();
	const filtered = topics.filter((t) => !q || t.name.toLowerCase().includes(q));

	if (!filtered.length) {
		return <div className="pkchat-idx__empty">{strings.index.emptyTopics}</div>;
	}

	return (
		<>
			{filtered.map((t, i) => {
				const isFirst = i === 0;
				const startPct = totalMessages > 0
					? Math.max(0, Math.min(100, (t.firstIndex / Math.max(1, totalMessages - 1)) * 100))
					: 0;
				const endPct = totalMessages > 0
					? Math.max(startPct, Math.min(100, (t.lastIndex / Math.max(1, totalMessages - 1)) * 100))
					: 0;
				const widthPct = Math.max(2, endPct - startPct);
				// Collect attachments + first artifact mention from messages within the topic.
				const attachments = t.messages
					.flatMap((m) => (m.resources || []).map((r) => ({
						source: r.source,
						messageId: m.id,
						kind: inferArtifactKindFromResource(r.kind as string, r.source),
					})))
					.slice(0, 4);
				const topicArtifacts = artifacts.filter((a) =>
					t.indices.includes(a.messageIndex)
				);
				const sub = trimText(t.messages.map((m) => m.content || '').join(' '), 80);

				// Primary attachment preview for the summary row3 (compact peek). Pick
				// the first non-fenced resource attached to any message in this topic.
				const primaryAttachment = attachments[0] ?? null;

				return (
					<details
						key={`${t.name}-${i}`}
						className="pkchat-idx-topic"
						open={isFirst}
					>
						<summary className="pkchat-idx-topic__summary">
							<div className="pkchat-idx-topic__summary-row">
								<ChevronRight className="pkchat-idx-topic__chev" aria-hidden />
								<MessageSquare className="pkchat-idx-topic__icon" aria-hidden />
								<span className="pkchat-idx-topic__name">
									{stripMarkdown(t.name) || strings.index.topicNoTopic}
								</span>
								<span className="pkchat-idx-topic__count">{t.messages.length}</span>
							</div>
							{sub && (
								<div className="pkchat-idx-topic__summary-desc">{sub}</div>
							)}
							{/*
							  Summary row3 — compact preview combining (a) primary
							  attachment chip if any (b) mini position bar showing
							  where this topic sits in the conversation timeline.
							  Always rendered (even on collapsed cards) per design —
							  the topic-card's collapsed state is a 3-row peek,
							  not just title+description.
							*/}
							<div className="pkchat-idx-topic__summary-meta">
								{primaryAttachment && (
									<span
										className="pkchat-idx-attach pkchat-idx-attach--mini"
										title={primaryAttachment.source}
										onClick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											scrollToMessage(primaryAttachment.messageId);
										}}
									>
										{primaryAttachment.kind === 'image' ? <ImageIcon aria-hidden />
											: primaryAttachment.kind === 'diagram' ? <Network aria-hidden />
											: <Paperclip aria-hidden />}
										<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
											{(primaryAttachment.source.split('/').pop() || primaryAttachment.source).slice(0, 24)}
										</span>
									</span>
								)}
								<span className="pkchat-idx-posbar pkchat-idx-posbar--mini">
									<span className="pkchat-idx-posbar__bar">
										<span
											className="pkchat-idx-posbar__range"
											style={{ left: `${startPct}%`, width: `${widthPct}%` }}
										/>
										<span
											className="pkchat-idx-posbar__dot"
											style={{ left: `${startPct}%` }}
										/>
										<span
											className="pkchat-idx-posbar__dot"
											style={{ left: `${endPct}%` }}
										/>
									</span>
								</span>
							</div>
						</summary>
						<div className="pkchat-idx-topic__body">
							{/*
							  "Messages X — Y" label + full progress bar removed from body
							  (2026-06-03): the summary row3 already shows a mini progress
							  bar with the same range info, so repeating it in the expanded
							  body was redundant. Body now goes straight to
							  Sources/Attachments + Key messages.
							*/}
							{attachments.length > 0 && (
								<>
									<div className="pkchat-idx-topic__sub" style={{ marginTop: 10 }}>
										{strings.index.topicAttachments}
									</div>
									<div className="pkchat-idx-attach-row">
										{attachments.map((att, j) => (
											<button
												key={`${att.source}-${j}`}
												type="button"
												className="pkchat-idx-attach"
												title={att.source}
												onClick={() => scrollToMessage(att.messageId)}
											>
												{att.kind === 'image' ? <ImageIcon aria-hidden />
													: att.kind === 'diagram' ? <Network aria-hidden />
													: <Paperclip aria-hidden />}
												<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
													{(att.source.split('/').pop() || att.source).slice(0, 28)}
												</span>
											</button>
										))}
									</div>
								</>
							)}

							{topicArtifacts.length > 0 && (
								<>
									<div className="pkchat-idx-topic__sub" style={{ marginTop: 10 }}>
										{strings.index.allArtifactsHeader}
									</div>
									{topicArtifacts.slice(0, 3).map((a) => (
										<ArtifactCard key={a.id} artifact={a} />
									))}
								</>
							)}

							<div className="pkchat-idx-topic__sub" style={{ marginTop: 10 }}>
								{strings.index.topicKeyMessages}
							</div>
							{t.messages.slice(0, 3).map((m) => (
								<MessageRowItem
									key={m.id}
									role={m.role === 'user' ? 'user' : 'assistant'}
									isError={m.isErrorMessage}
									text={trimText(m.content || '')}
									timestamp={m.createdAtTimestamp}
									onClick={() => scrollToMessage(m.id)}
								/>
							))}
						</div>
					</details>
				);
			})}
		</>
	);
}

function ArtifactsTabBody({ artifacts }: { artifacts: Artifact[] }) {
	const strings = useChatStrings();
	if (!artifacts.length) {
		return <div className="pkchat-idx__empty">{strings.index.emptyArtifacts}</div>;
	}
	return (
		<>
			{artifacts.map((a) => (
				<ArtifactCard key={a.id} artifact={a} />
			))}
		</>
	);
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
	const strings = useChatStrings();
	const kindLabel =
		artifact.kind === 'code' ? strings.index.artifactKindCode
		: artifact.kind === 'diagram' ? strings.index.artifactKindDiagram
		: artifact.kind === 'image' ? strings.index.artifactKindImage
		: strings.index.artifactKindFile;
	return (
		<button
			type="button"
			className="pkchat-idx-art"
			title={strings.index.artifactOpenLabel}
			onClick={() => scrollToMessage(artifact.messageId)}
		>
			<span className="pkchat-idx-art__thumb" data-kind={artifact.kind}>
				<ArtifactIcon kind={artifact.kind} />
			</span>
			<span className="pkchat-idx-art__body">
				<span className="pkchat-idx-art__name">{artifact.name}</span>
				<span className="pkchat-idx-art__sub">
					<span className="pkchat-idx-art__kind">{kindLabel}</span>
					{artifact.createdAt ? <span>{formatTimestamp(artifact.createdAt)}</span> : null}
					{artifact.isSaved && (
						<span className="pkchat-idx-art__tag">
							{strings.index.artifactTagSaved}
						</span>
					)}
				</span>
			</span>
			<ArrowUpRight aria-hidden style={{ width: 14, height: 14, color: 'var(--pk-text-tertiary)' }} />
		</button>
	);
}

function MessagesTabBody({ entries }: { entries: Array<{ m: ChatMessage; idx: number }> }) {
	const strings = useChatStrings();
	if (!entries.length) {
		return <div className="pkchat-idx__empty">{strings.index.emptyMessages}</div>;
	}

	// Group consecutive entries by day. Render a `.pkchat-idx-msg-day` divider
	// each time the day changes — matches mock `.msg-day` (e.g. "May 9, 2026").
	// Falls back to a single "—" divider for messages with no timestamp.
	const chunks: Array<{ key: string; label: string; rows: typeof entries }> = [];
	let current: { key: string; label: string; rows: typeof entries } | null = null;
	for (const e of entries) {
		const k = dayKey(e.m.createdAtTimestamp) || 'no-date';
		if (!current || current.key !== k) {
			current = { key: k, label: formatDayLabel(e.m.createdAtTimestamp), rows: [] };
			chunks.push(current);
		}
		current.rows.push(e);
	}

	return (
		<>
			{chunks.map((chunk) => (
				<React.Fragment key={chunk.key}>
					<div className="pkchat-idx-msg-day">{chunk.label || '—'}</div>
					{chunk.rows.map(({ m, idx }) => (
						<MessageRowItem
							key={m.id}
							role={m.role === 'user' ? 'user' : 'assistant'}
							isError={m.isErrorMessage}
							text={trimText(m.content || '')}
							timestamp={m.createdAtTimestamp}
							suffix={`Msg ${idx + 1}`}
							onClick={() => scrollToMessage(m.id)}
							variant="flat"
						/>
					))}
				</React.Fragment>
			))}
		</>
	);
}
