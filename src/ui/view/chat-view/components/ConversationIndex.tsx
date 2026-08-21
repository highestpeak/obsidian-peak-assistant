import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, PanelRightClose } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatStrings } from '../chatStringsContext';
import {
	ChatStudioStringsProvider,
	useChatStudioStrings,
} from '../chatStudioStringsContext';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';
import { usePortalContainer } from '@/ui/react/PortalContainerContext';
import { useServiceContext } from '@/ui/context/ServiceContext';
import type {
	ChatArtifactReceipt,
	TurnExecutionReceipt,
} from '@/core/types/chat-studio';
import {
	buildOutlineItems,
	buildResourceRows,
	filterOutlineItems,
	filterStarredOutlineItems,
	filterResourceRows,
	flattenOutline,
	DEFAULT_RESOURCE_FILTER,
	type ResourceFilter,
	type ResourceRow,
	type OutlineItem,
} from './conversation-index/outlineModel';
import { OutlineTab } from './conversation-index/OutlineTab';
import { ResourcesTab } from './conversation-index/ResourcesTab';
import { ResourcesFilterBar } from './conversation-index/ResourcesFilterBar';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

/**
 * ConversationIndex — right-side navigator with Outline / Starred / Resources tabs.
 *
 * Spec: chat-studio §10 (right column) + §12.2 (ChatArtifactReceipt) +
 * §17.4 RIGHT-01..03.
 *
 * - Outline: user / assistant / process / error / artifact anchors, grouped by
 *   topic (else strict time order), no filter chrome. Scroll spy highlights
 *   the topmost visible message's outline row.
 * - Starred: current-conversation saved turns only; click locates the source.
 * - Resources: direction × type filters, receipt-driven rows. Empty state
 *   explains the active filters.
 *
 * Derivation lives in `conversation-index/outlineModel.ts` (pure) so the
 * unit test `chat-studio-right-index.test.ts` can exercise the ordering,
 * grouping, direction/type filter, and RIGHT-01 "Outline ignores Resources
 * filters" contract without a React runtime.
 *
 * Click any row → scrolls the chat body to `[data-message-id]` in the leaf's
 * own document (popout-safe via usePortalContainer + ownerDocument).
 */

type TabId = 'outline' | 'starred' | 'resources';

// ── Scroll helpers (kept from prior implementation) ─────────────────────────

const HIGHLIGHT_CLASS = 'pkchat-idx-target-flash';

function scrollToMessageInDoc(messageId: string, doc: Document): void {
	// `doc` is the leaf-scoped document: in the main window it's `document`; in
	// a popout window (Studio etc.) it's the popout's own document. Using the
	// global `document` here misses messages rendered in a popout — they live
	// in a different document and querySelector returns null.
	const win = doc.defaultView ?? window;
	win.requestAnimationFrame(() => {
		const escapedId = win.CSS.escape(messageId);
		const el = doc.querySelector(
			`[data-message-id="${escapedId}"]`,
		) as HTMLElement | null;
		if (!el) return;
		el.scrollIntoView({ behavior: 'smooth', block: 'start' });
		// Class-based flash so themes can override; also avoids clobbering
		// inline background-color set by other renderers.
		el.classList.add(HIGHLIGHT_CLASS);
		win.setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), 900);
	});
}

function useScrollToMessage(): (messageId: string) => void {
	const chatNavigation = useChatNavigation();
	const portalContainer = usePortalContainer();
	return useCallback(
		(messageId: string) => {
			void chatNavigation.revealChatView();
			const doc = portalContainer?.ownerDocument ?? document;
			scrollToMessageInDoc(messageId, doc);
		},
		[portalContainer, chatNavigation],
	);
}

// ── Scroll spy ───────────────────────────────────────────────────────────────

/**
 * Watch every `[data-message-id]` in the chat body document; whenever the
 * topmost visible one changes, report that messageId back. Uses an
 * IntersectionObserver bound to the container's ownerDocument.defaultView so
 * detached windows work — the global `IntersectionObserver` would miss
 * intersections in a popout.
 *
 * `activeMessageId` is intentionally the LAST message whose top edge has
 * crossed above the viewport top (or the first partially visible one when
 * scrolled to the very top). This mirrors the reader's intent — "which row am
 * I currently looking at" — better than picking the largest intersection ratio.
 */
function useMessageScrollSpy(dependency: unknown): string | null {
	const portalContainer = usePortalContainer();
	const messages = useChatDataStore((s) => s.messages);
	const [activeId, setActiveId] = useState<string | null>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);
	const visibleRef = useRef<Set<string>>(new Set());
	const observedRef = useRef<Set<Element>>(new Set());

	useEffect(() => {
		const doc = portalContainer?.ownerDocument ?? document;
		const win = doc.defaultView ?? window;
		const IOC = (win as Window & typeof globalThis).IntersectionObserver;
		if (!IOC) return;

		visibleRef.current = new Set();
		observedRef.current = new Set();

		const recomputeActive = (): void => {
			// Choose the earliest visible message (top of the viewport) as the
			// active row. When multiple are intersecting we pick the one with
			// the smallest DOM position — that matches "which topic am I reading
			// right now" on a normal top-down scroll.
			const ids = Array.from(visibleRef.current);
			if (ids.length === 0) return;
			let bestId: string | null = null;
			let bestTop = Number.POSITIVE_INFINITY;
			for (const id of ids) {
				const escapedId = win.CSS.escape(id);
				const el = doc.querySelector(
					`[data-message-id="${escapedId}"]`,
				) as HTMLElement | null;
				if (!el) continue;
				const top = el.getBoundingClientRect().top;
				if (top < bestTop) {
					bestTop = top;
					bestId = id;
				}
			}
			if (bestId) setActiveId(bestId);
		};

		const obs = new IOC((entries) => {
			for (const entry of entries) {
				const id = (entry.target as HTMLElement).getAttribute('data-message-id');
				if (!id) continue;
				if (entry.isIntersecting) visibleRef.current.add(id);
				else visibleRef.current.delete(id);
			}
			recomputeActive();
		}, {
			// A small top margin biases toward the row just below the header,
			// which is what the reader treats as "current" when scrolling.
			rootMargin: '-8% 0px -70% 0px',
			threshold: [0, 0.1, 0.5],
		});
		observerRef.current = obs;

		// Sync observed set with the DOM. RIGHT-02: streaming/incremental
		// message insertion or deletion must add new targets and drop removed
		// ones — not just observe once at mount.
		const reconcile = () => {
			const nodes = doc.querySelectorAll('[data-message-id]');
			const current = new Set<Element>();
			nodes.forEach((n) => current.add(n));
			// Add new nodes.
			current.forEach((n) => {
				if (!observedRef.current.has(n)) {
					obs.observe(n);
					observedRef.current.add(n);
				}
			});
			// Drop nodes that disappeared.
			observedRef.current.forEach((n) => {
				if (!current.has(n)) {
					obs.unobserve(n);
					observedRef.current.delete(n);
					const id = (n as HTMLElement).getAttribute('data-message-id');
					if (id) visibleRef.current.delete(id);
				}
			});
		};
		// Defer one frame so newly-rendered messages exist in the DOM.
		win.requestAnimationFrame(reconcile);

		return () => {
			obs.disconnect();
			observerRef.current = null;
			observedRef.current.clear();
			visibleRef.current.clear();
		};
		// `dependency` re-runs the spy when the conversation switches; the
		// message list length change forces a reconcile so streaming turns are
		// observed as they arrive (RIGHT-02).
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [portalContainer, dependency, messages.length]);

	return activeId;
}

// ── Component ────────────────────────────────────────────────────────────────

interface ConversationIndexProps {
	/** When provided, a collapse control (PanelRightClose) renders at the right
	 *  edge of the topline. Studio wires this to persist `rightCollapsed`; the
	 *  restore entry lives in the centre-column Header (owned by the shell). The
	 *  sidebar leaf omits it (nothing to collapse into). */
	onCollapse?: () => void;
	/** Compact layout for the narrow Obsidian right-sidebar leaf: centers the
	 *  Outline / Starred / Resources tabs. Studio's wider right column omits this prop and
	 *  keeps the left-aligned tabs layout. */
	compact?: boolean;
}

/**
 * Public entry point. The inner component reads `useChatStudioStrings` for the
 * rightIndex.* labels, so we wrap with a provider here. It's safe to nest
 * providers — an outer `ChatStudioStringsProvider` (view-Messages) will simply
 * be overridden by our inner one with the same loaded value.
 */
export const ConversationIndex: React.FC<ConversationIndexProps> = (props) => (
	<ChatStudioStringsProvider>
		<ConversationIndexInner {...props} />
	</ChatStudioStringsProvider>
);

const ConversationIndexInner: React.FC<ConversationIndexProps> = ({ onCollapse, compact = false }) => {
	const legacyStrings = useChatStrings();
	const studio = useChatStudioStrings();
	const rightStrings = studio.rightIndex;
	const messages = useChatDataStore((s) => s.messages);
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const conversationId = activeConversation?.meta.id ?? null;
	const { manager, vaultNavigation } = useServiceContext();
	const portalContainer = usePortalContainer();

	// Tab + filter state. `compact` and conversation switch both reset filters
	// (spec §10.3: new conversation clears selection; tab MAY persist but we
	// keep it simple by resetting to 'outline' too).
	const [tab, setTab] = useState<TabId>('outline');
	const [query, setQuery] = useState('');
	const [resourceFilter, setResourceFilter] = useState<ResourceFilter>(DEFAULT_RESOURCE_FILTER);
	const tabsRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	useRovingComposite(tabsRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => setTab(item.dataset.chatIndexTab as TabId),
	});
	useRovingComposite(listRef, {
		itemSelector: '[data-peak-chat-index-item]',
		orientation: 'vertical',
		pageSize: 8,
	});

	useEffect(() => {
		setTab('outline');
		setQuery('');
		setResourceFilter(DEFAULT_RESOURCE_FILTER);
	}, [conversationId]);

	// ── Load receipts ─────────────────────────────────────────────────────
	const [artifactReceipts, setArtifactReceipts] = useState<ChatArtifactReceipt[]>([]);
	const [turnReceipts, setTurnReceipts] = useState<TurnExecutionReceipt[]>([]);

	useEffect(() => {
		if (!conversationId) {
			setArtifactReceipts([]);
			setTurnReceipts([]);
			return;
		}
		let cancelled = false;
		const load = async () => {
			try {
				const [arts, turns] = await Promise.all([
					manager.conv.listArtifactReceiptsByConversation(conversationId),
					manager.conv.listTurnReceipts(conversationId),
				]);
				if (cancelled) return;
				setArtifactReceipts(arts);
				setTurnReceipts(turns);
			} catch {
				if (cancelled) return;
				// Receipts are optional context — a failing load must never blank
				// out the Outline (messages alone still produce useful anchors).
				setArtifactReceipts([]);
				setTurnReceipts([]);
			}
		};
		void load();
		// Reload when the message count changes — new turn = new receipts.
		return () => { cancelled = true; };
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [manager, conversationId, messages.length]);

	// ── Derivation (pure model) ───────────────────────────────────────────
	// RIGHT-01: outline building takes NO filter input. `resourceFilter` is
	// deliberately absent from the deps of `outlineGroups`.
	const outlineGroups = useMemo(
		() => buildOutlineItems(messages, artifactReceipts),
		[messages, artifactReceipts],
	);
	const outlineFiltered = useMemo(
		() => filterOutlineItems(outlineGroups, query),
		[outlineGroups, query],
	);
	const starredGroups = useMemo(
		() => filterOutlineItems(filterStarredOutlineItems(outlineGroups), query),
		[outlineGroups, query],
	);
	const resourceRows = useMemo(
		() => buildResourceRows(messages, artifactReceipts, turnReceipts),
		[messages, artifactReceipts, turnReceipts],
	);
	const resourceFiltered = useMemo(
		() => filterResourceRows(resourceRows, { ...resourceFilter, query }),
		[resourceRows, resourceFilter, query],
	);

	// ── Scroll spy ────────────────────────────────────────────────────────
	const activeMessageId = useMessageScrollSpy(conversationId);

	// ── Actions ───────────────────────────────────────────────────────────
	const scrollToMessage = useScrollToMessage();

	const onOutlineSelect = useCallback((item: OutlineItem) => {
		scrollToMessage(item.messageId);
	}, [scrollToMessage]);

	const onResourceSelect = useCallback((row: ResourceRow) => {
		if (row.messageId) scrollToMessage(row.messageId);
	}, [scrollToMessage]);

	const onResourceOpen = useCallback((row: ResourceRow) => {
		if (!row.target) return;
		if (row.target.kind === 'vault') {
			void vaultNavigation.openVaultPath(row.target.path);
			return;
		}
		// URL — prefer the portal document's window so a popout opens the tab
		// in the same browser session; fall back to global `window.open`.
		const doc = portalContainer?.ownerDocument ?? document;
		const win = doc.defaultView ?? window;
		try {
			win.open(row.target.url, '_blank', 'noopener,noreferrer');
		} catch {
			vaultNavigation.openExternalUrl(row.target.url);
		}
	}, [vaultNavigation, portalContainer]);

	const searchPlaceholder = rightStrings.searchPlaceholder;
	const queryActive = Boolean(query.trim());

	// Flatten to derive an outline-total for empty-state discrimination.
	const outlineTotal = useMemo(() => flattenOutline(outlineGroups).length, [outlineGroups]);
	// Filtered counts drive the footer bar (mock: filtered count, not total).
	const outlineFilteredCount = useMemo(
		() => flattenOutline(outlineFiltered).length,
		[outlineFiltered],
	);
	const starredCount = useMemo(() => flattenOutline(starredGroups).length, [starredGroups]);

	const footerCount = tab === 'outline'
		? rightStrings.footerOutlineCount.replace('{count}', String(outlineFilteredCount))
		: tab === 'starred'
			? rightStrings.footerStarredCount.replace('{count}', String(starredCount))
			: rightStrings.footerResourceCount.replace('{count}', String(resourceFiltered.length));

	const resourcesStrings = {
		directionAll: rightStrings.directionAll,
		directionInput: rightStrings.directionInput,
		directionGenerated: rightStrings.directionGenerated,
		groupInput: rightStrings.groupInput,
		groupGenerated: rightStrings.groupGenerated,
		typeAll: rightStrings.typeAll,
		typeMessage: rightStrings.typeMessage,
		typeImage: rightStrings.typeImage,
		typeAudio: rightStrings.typeAudio,
		typeVideo: rightStrings.typeVideo,
		typeDocument: rightStrings.typeDocument,
		typeUrl: rightStrings.typeUrl,
		typeVault: rightStrings.typeVault,
		typeTable: rightStrings.typeTable,
		typeCode: rightStrings.typeCode,
		typeDiagram: rightStrings.typeDiagram,
		typeBase: rightStrings.typeBase,
		typeProcess: rightStrings.typeProcess,
		typeDataview: rightStrings.typeDataview,
		typeExtract: rightStrings.typeExtract,
		typeReminder: rightStrings.typeReminder,
		emptyFiltered: rightStrings.emptyFiltered,
		emptyFilteredSub: rightStrings.emptyFilteredSub,
		emptyEmpty: rightStrings.emptyResources,
		emptyEmptySub: rightStrings.emptyResourcesSub,
		openLabel: rightStrings.openLabel,
		locateLabel: rightStrings.footerLocateHint,
	};

	return (
		<div className="pkchat-idx">
			<div className="pkchat-idx__topline">
				<div className="pkchat-idx__search">
					<Search aria-hidden />
					<input
						type="text"
						value={query}
						placeholder={searchPlaceholder}
						onChange={(e) => setQuery(e.target.value)}
						aria-label={searchPlaceholder}
					/>
				</div>
				{onCollapse && (
					<IconButton
						label={rightStrings.collapseLabel}
						title={rightStrings.collapseLabel}
						onClick={onCollapse}
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.chatStudio.index.collapse}
						data-peak-keytip-label={rightStrings.collapseLabel}
					>
						<PanelRightClose />
					</IconButton>
				)}
			</div>

			<div
				ref={tabsRef}
				className={`pkchat-idx__tabs${compact ? ' pkchat-idx__tabs--centered' : ''}`}
				role="tablist"
				aria-label={legacyStrings.index.panelTitle}
			>
				{(
					[
						['outline', rightStrings.outlineTab],
						['starred', rightStrings.starredTab],
						['resources', rightStrings.resourcesTab],
					] as Array<[TabId, string]>
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						role="tab"
						data-chat-index-tab={value}
						aria-selected={tab === value}
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.chatStudio.index[value]}
						data-peak-keytip-label={label}
						tabIndex={tab === value ? 0 : -1}
						className={`pkchat-idx__tab${tab === value ? ' pkchat-idx__tab--active' : ''}`}
						onClick={() => setTab(value)}
					>
						<span className="pkchat-idx__tab-label">{label}</span>
					</button>
				))}
			</div>

			{tab === 'resources' && (
				<ResourcesFilterBar
					filter={resourceFilter}
					onFilterChange={setResourceFilter}
					strings={resourcesStrings}
				/>
			)}

			<div ref={listRef} className="pkchat-idx__list">
				{tab === 'outline' && (
					<OutlineTab
						groups={outlineFiltered}
						activeMessageId={activeMessageId}
						onSelect={onOutlineSelect}
						emptyTitle={
							outlineTotal === 0
								? rightStrings.emptyOutline
								: rightStrings.emptyFiltered
						}
						emptySub={
							outlineTotal === 0
								? rightStrings.emptyOutlineSub
								: rightStrings.emptyFilteredSub
						}
						untopicedLabel={legacyStrings.index.topicNoTopic}
						forceExpanded={queryActive}
					/>
				)}
				{tab === 'starred' && (
					<OutlineTab
						groups={starredGroups}
						activeMessageId={activeMessageId}
						onSelect={onOutlineSelect}
						emptyTitle={rightStrings.emptyStarred}
						emptySub={rightStrings.emptyStarredSub}
						untopicedLabel={legacyStrings.index.topicNoTopic}
						forceExpanded={queryActive}
					/>
				)}
				{tab === 'resources' && (
					<ResourcesTab
						rows={resourceRows}
						filteredRows={resourceFiltered}
						filter={resourceFilter}
						strings={resourcesStrings}
						onSelect={onResourceSelect}
						onOpen={onResourceOpen}
					/>
				)}
			</div>

			<div className="pkchat-idx__foot">
				<span className="pkchat-idx__foot-count">{footerCount}</span>
				<span className="pkchat-idx__foot-hint">{rightStrings.footerLocateHint}</span>
			</div>
		</div>
	);
};
