import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, FileQuestion, Link2, Copy, Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { getInspectorLinks, type InspectorLinkItem, type InspectorLinksPayload } from '@/service/search/inspectorService';
import { Button } from '@/ui/component/shared-ui/button';
import { createOpenSourceCallback } from '../../callbacks/open-source-file';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { AppContext } from '@/app/context/AppContext';
import { DEFAULT_INSPECTOR_LINKS_SETTINGS } from '@/app/settings/types';
import { humanReadableTime } from '@/core/utils/date-utils';
import { tokenizePathOrLabel } from '@/service/search/support/segmenter';
import { getFileIcon, pathToFileIconType } from '@/ui/view/shared/file-utils';

type LinkKind = 'physical' | 'semantic';

export type EnrichedItem = InspectorLinkItem & { kind: LinkKind };

export type FirstLayerMode = 'all' | 'keywords' | 'tags';
export type GroupMode = 'flat' | 'bypath';
export type SortBy = 'name' | 'time' | 'backlinks' | 'similarity';

export function parseSimilarity(s: string | undefined): number {
	if (s == null) return 0;
	const n = parseFloat(String(s).replace(/%/, ''));
	return Number.isFinite(n) ? n : 0;
}

function checkFileExists(path: string | null): boolean {
	if (!path?.trim()) return false;
	try {
		const app = AppContext.getInstance?.()?.app;
		return Boolean(app?.vault?.getAbstractFileByPath?.(path));
	} catch {
		return false;
	}
}

/** Extract keywords from path/label via segmenter; dedupe and drop short/pure-numeric. */
export function extractKeywords(item: EnrichedItem): string[] {
	const tokens = tokenizePathOrLabel(`${item.path ?? ''} ${item.label ?? ''}`);
	return [...new Set(tokens)].filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

/** Group by first N path segments. Prefixes with only 1 item go to "Other". */
export function groupByPathPrefix(
	items: EnrichedItem[],
	maxDepth: number
): Array<{ groupLabel: string; items: EnrichedItem[] }> {
	const getPrefix = (path: string): string => {
		const dir = path.includes('/') ? path.replace(/\/[^/]+$/, '') : '';
		if (!dir) return 'Root';
		const parts = dir.split('/').filter(Boolean);
		const n = Math.min(parts.length, Math.max(1, maxDepth));
		return parts.slice(0, n).join('/');
	};
	const byPrefix = new Map<string, EnrichedItem[]>();
	for (const item of items) {
		const p = getPrefix(item.path);
		const arr = byPrefix.get(p) ?? [];
		arr.push(item);
		byPrefix.set(p, arr);
	}
	const groups: Array<{ groupLabel: string; items: EnrichedItem[] }> = [];
	const other: EnrichedItem[] = [];
	for (const [label, arr] of [...byPrefix.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
		if (arr.length === 1) {
			other.push(...arr);
		} else {
			groups.push({ groupLabel: label, items: arr });
		}
	}
	if (other.length > 0) {
		groups.push({ groupLabel: 'Other', items: other });
	}
	return groups;
}

/**
 * Links tab: loads from currentPath (or uses initialPayload when provided), two-level filters, folder grouping.
 * When initialPayload is provided (e.g. desktop mock), no fetch is performed and that data is used.
 */
export const LinksTab: React.FC<{
	currentPath: string | null;
	linksIncludeSemantic: boolean;
	/** When set, use this data instead of fetching; used for desktop mock / paste-and-preview. */
	initialPayload?: InspectorLinksPayload | null;
	className?: string;
	onClose?: () => void;
}> = ({ currentPath, linksIncludeSemantic, initialPayload, className, onClose }) => {
	const [physical, setPhysical] = useState<InspectorLinkItem[]>(() => initialPayload?.physical ?? []);
	const [semantic, setSemantic] = useState<InspectorLinkItem[]>(() => initialPayload?.semantic ?? []);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [mode, setMode] = useState<FirstLayerMode>('all');
	const [kinds, setKinds] = useState({ semantic: true, physical: true });
	const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
	const [groupMode, setGroupMode] = useState<GroupMode>('flat');
	const [pathGroupsCollapsed, setPathGroupsCollapsed] = useState<Set<string>>(new Set());
	const [sortBy, setSortBy] = useState<SortBy>('similarity');
	const [justCopied, setJustCopied] = useState(false);
	const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const prevGroupModeRef = useRef<GroupMode>(groupMode);

	const insSettings = AppContext.getInstance()?.plugin?.settings?.search?.inspectorLinks ?? DEFAULT_INSPECTOR_LINKS_SETTINGS;

	const togglePathGroup = useCallback((groupLabel: string) => {
		setPathGroupsCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(groupLabel)) next.delete(groupLabel);
			else next.add(groupLabel);
			return next;
		});
	}, []);

	const loadAllLinks = useCallback(async () => {
		if (initialPayload != null) return;
		if (!currentPath?.trim()) {
			setPhysical([]);
			setSemantic([]);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const { physical: p, semantic: s } = await getInspectorLinks(currentPath, {
				includeSemantic: linksIncludeSemantic,
				includeMetadata: true,
			});
			setPhysical(p);
			setSemantic(s);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to load links');
			setPhysical([]);
			setSemantic([]);
		} finally {
			setLoading(false);
		}
	}, [currentPath, linksIncludeSemantic, initialPayload]);

	useEffect(() => {
		loadAllLinks();
	}, [loadAllLinks]);

	useEffect(() => {
		if (initialPayload != null) {
			setPhysical(initialPayload.physical ?? []);
			setSemantic(initialPayload.semantic ?? []);
			setError(null);
		}
	}, [initialPayload]);

	useEffect(() => () => {
		if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
	}, []);

	const mergedItems: EnrichedItem[] = useMemo(
		() => [
			...physical.map((item) => ({ ...item, kind: 'physical' as LinkKind })),
			...semantic.map((item) => ({ ...item, kind: 'semantic' as LinkKind })),
		],
		[physical, semantic]
	);

	const kindFilteredItems = useMemo(() => {
		return mergedItems.filter((item) => {
			const isSem = item.kind === 'semantic' || item.alsoSemantic;
			const isPhys = item.kind === 'physical';
			if (kinds.semantic && kinds.physical) return true;
			if (kinds.semantic && isSem) return true;
			if (kinds.physical && isPhys) return true;
			return false;
		});
	}, [mergedItems, kinds]);

	const topKeywords = useMemo(() => {
		const count = new Map<string, number>();
		for (const item of kindFilteredItems) {
			for (const kw of extractKeywords(item)) {
				count.set(kw, (count.get(kw) ?? 0) + 1);
			}
		}
		return [...count.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, insSettings.keywordTopN)
			.map(([k]) => k);
	}, [kindFilteredItems, insSettings.keywordTopN]);

	const topTags = useMemo(() => {
		const count = new Map<string, number>();
		for (const item of kindFilteredItems) {
			for (const t of item.tags ?? []) {
				if (t) count.set(t, (count.get(t) ?? 0) + 1);
			}
		}
		return [...count.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, insSettings.tagTopN)
			.map(([t]) => t);
	}, [kindFilteredItems, insSettings.tagTopN]);

	const filteredItems = useMemo(() => {
		let items = kindFilteredItems;
		if (mode === 'keywords' && selectedTokens.size > 0) {
			items = items.filter((item) => {
				const kws = new Set(extractKeywords(item).map((k) => k.toLowerCase()));
				return [...selectedTokens].every((t) => kws.has(t.toLowerCase()));
			});
		}
		if (mode === 'tags' && selectedTokens.size > 0) {
			items = items.filter((item) => {
				const ts = new Set((item.tags ?? []).map((t) => t.toLowerCase()));
				return [...selectedTokens].every((t) => ts.has(t.toLowerCase()));
			});
		}
		return items;
	}, [kindFilteredItems, mode, selectedTokens]);

	const sortedItems = useMemo(() => {
		const list = [...filteredItems];
		const sim = (x: EnrichedItem) => parseSimilarity(x.similarity);
		const mtime = (x: EnrichedItem) => x.mtime ?? 0;
		const backlinks = (x: EnrichedItem) => x.backlinks ?? 0;
		const nameStr = (x: EnrichedItem) => (x.label || x.path || '').toLowerCase();
		if (sortBy === 'name') {
			list.sort((a, b) => nameStr(a).localeCompare(nameStr(b), undefined, { numeric: true }));
		} else if (sortBy === 'time') {
			list.sort((a, b) => mtime(b) - mtime(a));
		} else if (sortBy === 'backlinks') {
			list.sort((a, b) => backlinks(b) - backlinks(a));
		} else {
			list.sort((a, b) => {
				const simA = sim(a);
				const simB = sim(b);
				if (simA !== simB) return simB - simA;
				return mtime(b) - mtime(a);
			});
		}
		return list;
	}, [filteredItems, sortBy]);

	const groupedByPath = useMemo(() => {
		if (groupMode !== 'bypath' || !insSettings.folderGroupingEnabled) return null;
		const groups = groupByPathPrefix(sortedItems, insSettings.folderGroupMaxDepth);
		const sim = (x: EnrichedItem) => parseSimilarity(x.similarity);
		const mtime = (x: EnrichedItem) => x.mtime ?? 0;
		const backlinks = (x: EnrichedItem) => x.backlinks ?? 0;
		groups.sort((a, b) => {
			if (sortBy === 'name') {
				return a.groupLabel.localeCompare(b.groupLabel, undefined, { numeric: true });
			}
			if (sortBy === 'time') {
				const maxA = Math.max(...a.items.map(mtime), 0);
				const maxB = Math.max(...b.items.map(mtime), 0);
				return maxB - maxA;
			}
			if (sortBy === 'backlinks') {
				const sumA = a.items.reduce((s, i) => s + backlinks(i), 0);
				const sumB = b.items.reduce((s, i) => s + backlinks(i), 0);
				return sumB - sumA;
			}
			const maxSimA = Math.max(...a.items.map(sim), 0);
			const maxSimB = Math.max(...b.items.map(sim), 0);
			if (maxSimA !== maxSimB) return maxSimB - maxSimA;
			const maxA = Math.max(...a.items.map(mtime), 0);
			const maxB = Math.max(...b.items.map(mtime), 0);
			return maxB - maxA;
		});
		return groups;
	}, [groupMode, insSettings.folderGroupingEnabled, insSettings.folderGroupMaxDepth, sortedItems, sortBy]);

	/** When switching to By Path, collapse all groups by default */
	useEffect(() => {
		if (prevGroupModeRef.current !== 'bypath' && groupMode === 'bypath' && groupedByPath?.length) {
			setPathGroupsCollapsed(new Set(groupedByPath.map((g) => g.groupLabel)));
		}
		prevGroupModeRef.current = groupMode;
	}, [groupMode, groupedByPath]);

	const toggleKind = useCallback((k: 'semantic' | 'physical') => {
		setKinds((prev) => {
			const next = { ...prev, [k]: !prev[k] };
			if (!next.semantic && !next.physical) next[k] = true;
			return next;
		});
	}, []);

	const toggleToken = useCallback((t: string) => {
		setSelectedTokens((prev) => {
			const next = new Set(prev);
			if (next.has(t)) next.delete(t);
			else next.add(t);
			return next;
		});
	}, []);

	const handleCopyAsJson = useCallback(async () => {
		const payload: InspectorLinksPayload = { physical: [...physical], semantic: [...semantic] };
		const json = JSON.stringify(payload, null, 2);
		try {
			await navigator.clipboard.writeText(json);
			if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
			setJustCopied(true);
			copyFeedbackTimer.current = setTimeout(() => {
				setJustCopied(false);
				copyFeedbackTimer.current = null;
			}, 1500);
		} catch {
			// ignore
		}
	}, [physical, semantic]);

	const clearAllTokens = useCallback(() => setSelectedTokens(new Set()), []);

	if (loading) {
		return (
			<div className={cn('pktw-text-sm pktw-text-[#6b7280]', className)}>
				Loading links…
			</div>
		);
	}
	if (error) {
		return (
			<div className={cn('pktw-text-sm pktw-text-red-600', className)}>{error}</div>
		);
	}
	if (mergedItems.length === 0) {
		return (
			<div className={cn('pktw-text-sm pktw-text-[#6b7280]', className)}>
				No links for this note. Open a note and try again.
			</div>
		);
	}

	const chipActive =
		'pktw-font-semibold pktw-text-[#1e3a8a] pktw-bg-blue-100 pktw-border pktw-border-blue-300 pktw-rounded-md pktw-shadow-sm';
	const chipInactive = 'pktw-text-[#6b7280] pktw-bg-transparent';

	const showTier3 = mode === 'keywords' || mode === 'tags';
	const tier3Tokens = mode === 'keywords' ? topKeywords : topTags;

	return (
		<div className={cn('pktw-flex pktw-flex-col pktw-gap-3', className)}>
			{/* Header: total count + Copy */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2">
				<div className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280]">
					All ({mergedItems.length})
				</div>
				<Button
					size="sm"
					variant="ghost"
					className={cn(
						'pktw-h-6 pktw-px-2 pktw-text-xs pktw-min-w-[4.5rem]',
						justCopied ? 'pktw-text-emerald-600' : 'pktw-text-[#6b7280]'
					)}
					title={justCopied ? 'Copied' : 'Copy links as JSON'}
					onClick={() => void handleCopyAsJson()}
				>
					{justCopied ? (
						<>
							<Check className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
							Copied
						</>
					) : (
						<>
							<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
							Copy
						</>
					)}
				</Button>
			</div>

			{/* 3-tier cascading filter card */}
			<div className="pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-[#f9fafb] pktw-p-2.5 pktw-flex pktw-flex-col pktw-gap-2.5">
				{/* Step 1: All | Keywords | Tags */}
				<div className="pktw-flex pktw-flex-wrap pktw-gap-2 pktw-items-center">
					{(['all', 'keywords', 'tags'] as const).map((m) => (
						<Button
							key={m}
							size="sm"
							variant="ghost"
							className={cn(
								'pktw-h-6 pktw-px-2 pktw-text-xs pktw-bg-transparent',
								mode === m ? chipActive : chipInactive
							)}
							onClick={() => {
								setMode(m);
								if (m === 'all') setSelectedTokens(new Set());
							}}
						>
							{m === 'all' ? 'All' : m === 'keywords' ? 'Keywords' : 'Tags'}
						</Button>
					))}
				</div>

				{/* Step 2: Semantic | Physical | Flat | By Path */}
				<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-items-center">
					<span className="pktw-text-xs pktw-text-[#9ca3af] pktw-mr-0.5">Filter:</span>
					<Button
						size="sm"
						variant="ghost"
						className={cn(
							'pktw-h-6 pktw-px-2 pktw-text-xs pktw-bg-transparent',
							kinds.semantic ? chipActive : chipInactive
						)}
						onClick={() => toggleKind('semantic')}
					>
						Semantic
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className={cn(
							'pktw-h-6 pktw-px-2 pktw-text-xs pktw-bg-transparent',
							kinds.physical ? chipActive : chipInactive
						)}
						onClick={() => toggleKind('physical')}
					>
						Physical
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className={cn(
							'pktw-h-6 pktw-px-2 pktw-text-xs pktw-bg-transparent',
							groupMode === 'flat' ? chipActive : chipInactive
						)}
						onClick={() => setGroupMode('flat')}
					>
						Flat
					</Button>
					<Button
						size="sm"
						variant="ghost"
						className={cn(
							'pktw-h-6 pktw-px-2 pktw-text-xs pktw-bg-transparent',
							groupMode === 'bypath' ? chipActive : chipInactive
						)}
						onClick={() => setGroupMode('bypath')}
					>
						By Path
					</Button>
				</div>

				{/* Step 3: Sub-items (only when Keywords/Tags active) */}
				{showTier3 && tier3Tokens.length > 0 && (
					<div className="pktw-rounded pktw-border pktw-border-[#e5e7eb] pktw-p-2 pktw-flex pktw-flex-col pktw-gap-2">
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2 pktw-flex-wrap">
							<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-items-center pktw-min-w-0">
								{tier3Tokens.map((token) => {
									const selected = selectedTokens.has(token);
									return (
										<Button
											key={token}
											size="sm"
											variant="ghost"
											onClick={() => toggleToken(token)}
											className={cn(
												selected ? chipActive : chipInactive,
												"pktw-px-2 pktw-h-6 pktw-text-xs"
											)}
										>
											{token}
											{selected && <X className="pktw-w-3 pktw-h-3 pktw-shrink-0" />}
										</Button>
									);
								})}
								{selectedTokens.size > 0 && (
									<Button
										size="sm"
										variant="ghost"
										className="pktw-h-6 pktw-px-2 pktw-text-xs pktw-text-[#6b7280]"
										onClick={clearAllTokens}
									>
										Clear All
									</Button>
								)}
							</div>
						</div>
					</div>
				)}

				<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-flex-wrap">
					<span className="pktw-text-xs pktw-text-[#9ca3af]">Sort:</span>
					{(['name', 'time', 'backlinks', 'similarity'] as const).map((s) => (
						<Button
							key={s}
							variant="ghost"
							className={cn(
								sortBy === s ? chipActive : chipInactive,
								"pktw-text-xs pktw-h-6 pktw-px-2"
							)}
							onClick={() => setSortBy(s)}
						>
							{s === 'name' ? 'Name' : s === 'time' ? 'Time' : s === 'backlinks' ? 'Links' : 'Similarity'}
						</Button>
					))}
				</div>
			</div>

			{/* Results + Sort */}
			<div className="pktw-flex pktw-flex-col pktw-gap-1">
				<div className="pktw-flex pktw-items-center pktw-justify-start pktw-gap-2 pktw-flex-wrap">
					<div className="pktw-text-[#9ca3af]">
						Results ({sortedItems.length})
					</div>
				</div>
				<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
					{groupedByPath && groupedByPath.length > 0 ? (
						groupedByPath.map(({ groupLabel, items }) => {
							const isCollapsed = pathGroupsCollapsed.has(groupLabel);
							return (
								<div key={groupLabel} className="pktw-flex pktw-flex-col pktw-gap-0.5">
									<Button
										variant="ghost"
										size="sm"
										className="pktw-w-full pktw-justify-start pktw-gap-1 pktw-py-0 pktw-px-1 pktw-text-xs pktw-font-medium "
										onClick={() => togglePathGroup(groupLabel)}
									>
										{isCollapsed ? (
											<ChevronRight className="pktw-w-4 pktw-h-4 pktw-shrink-0" />
										) : (
											<ChevronDown className="pktw-w-4 pktw-h-4 pktw-shrink-0" />
										)}
										{groupLabel} ({items.length})
									</Button>
									{!isCollapsed && (
										<div className="pktw-flex pktw-flex-col pktw-gap-0.5">
											{items.map((item, idx) => (
												<LinkItemRow key={`${item.kind}-${item.path}-${idx}`} item={item} onClose={onClose} />
											))}
										</div>
									)}
								</div>
							);
						})
					) : (
						sortedItems.map((item, idx) => (
							<LinkItemRow key={`${item.kind}-${item.path}-${idx}`} item={item} onClose={onClose} />
						))
					)}
				</div>
			</div>
		</div>
	);
};

/** Single link row - hover underline only, no background/color change */
export const LinkItemRow: React.FC<{
	item: EnrichedItem;
	onClose?: () => void;
}> = ({ item, onClose }) => {
	const isRelated = item.kind === 'semantic' || item.alsoSemantic;
	const isExternal = !checkFileExists(item.path);

	const content = (
		<Button
			variant="ghost"
			size="default"
			onClick={() => void createOpenSourceCallback(onClose, false)(item.path)}
			className="pktw-w-full pktw-justify-start pktw-rounded pktw-gap-2 pktw-group pktw-text-left pktw-h-auto pktw-py-1.5 pktw-px-2 pktw-group"
			title={item.path}
		>
			<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-min-w-0">
				{isExternal ? (
					<FileQuestion className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 group-hover:pktw-text-white" aria-hidden />
				) : (
					<span className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-inline-flex pktw-items-center pktw-justify-center [&_svg]:!pktw-w-3.5 [&_svg]:!pktw-h-3.5" aria-hidden>
						{getFileIcon(pathToFileIconType(item.path), false, "group-hover:pktw-text-white")}
					</span>
				)}
				{isRelated && (
					<Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-shrink-0 pktw-text-[#7c3aed] group-hover:pktw-text-white" aria-hidden />
				)}
				{parseSimilarity(item.similarity) > 0 && (
					<span className="pktw-tabular-nums pktw-text-xs pktw-text-[#7c3aed] pktw-font-medium group-hover:pktw-text-white">
						{item.similarity}
					</span>
				)}
				<span className="pktw-truncate pktw-font-medium group-hover:pktw-underline">{item.label || item.path}</span>
				{item.mtime != null && (
					<span className="pktw-shrink-0 pktw-text-[10px] pktw-text-[#9ca3af] group-hover:pktw-text-white">
						{humanReadableTime(item.mtime)}
					</span>
				)}
				{(item.backlinks ?? 0) > 0 && (
					<span className="pktw-shrink-0 pktw-flex pktw-items-center pktw-gap-0.5 pktw-text-[10px] pktw-text-[#7c3aed] group-hover:pktw-text-white">
						<Link2 className="pktw-w-3 pktw-h-3" />
						{item.backlinks}
					</span>
				)}
			</span>
		</Button>
	);

	if (item.summary?.trim()) {
		return (
			<HoverCard openDelay={300} closeDelay={100}>
				<HoverCardTrigger asChild>{content}</HoverCardTrigger>
				<HoverCardContent
					align="start"
					className="pktw-max-w-xs pktw-text-xs pktw-leading-relaxed pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto"
				>
					<p className="pktw-line-clamp-3">{item.summary}</p>
				</HoverCardContent>
			</HoverCard>
		);
	}

	return content;
};
