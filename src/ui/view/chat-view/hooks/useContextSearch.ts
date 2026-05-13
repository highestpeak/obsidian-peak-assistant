import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { getFileIcon } from '@/ui/view/shared/file-utils';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';
import type { SearchResultItem } from '@/service/search/types';
import { CopilotActionRegistry } from '@/service/copilot/CopilotActionRegistry';
import { cn } from '@/ui/react/lib/utils';
import { useChatViewStore } from '../store/chatViewStore';

const RECENT_FILES_COUNT = 3;
const SEARCH_RESULTS_TOP_K = 20;
const MIN_CONTEXT_SEARCH_CHARS = 2;

/** Approximate word count from content length (avg ~5 chars/word). */
function formatWordCount(content: string | undefined): string | undefined {
	if (!content) return undefined;
	const words = Math.round(content.length / 5);
	if (words < 1000) return `${words}w`;
	return `${(words / 1000).toFixed(1)}kw`;
}

/** Derive a short metadata badge from a search result. */
function deriveMetaBadge(item: SearchResultItem): string | undefined {
	switch (item.type) {
		case 'pdf': return 'PDF';
		case 'image': return 'Image';
		case 'docx': return 'DOCX';
		case 'xlsx': return 'XLSX';
		case 'pptx': return 'PPTX';
		case 'canvas': return 'Canvas';
		case 'excalidraw': return 'Draw';
		case 'folder': return undefined;
		default:
			return formatWordCount(item.content);
	}
}

export function useContextSearch() {
	const { searchClient } = useServiceContext();
	const promptsSuggest = useChatViewStore((s) => s.promptsSuggest);
	const [menuContextItems, setMenuContextItems] = useState<NavigableMenuItem[]>([]);
	const [folderStack, setFolderStack] = useState<string[]>([]);
	const contextCacheRef = useRef<Map<string, NavigableMenuItem[]>>(new Map());
	const menuContextItemsRef = useRef<NavigableMenuItem[]>([]);
	menuContextItemsRef.current = menuContextItems;

	const handleSearchContext = useCallback(async (query: string, currentFolder?: string): Promise<NavigableMenuItem[]> => {
		if (!searchClient) return [];
		const normalizedQuery = query.trim();
		const cacheKey = `${currentFolder ?? ''}\n${normalizedQuery.toLowerCase()}`;
		const cached = contextCacheRef.current.get(cacheKey);
		if (cached) return cached;
		const shouldSearchVault = Boolean(currentFolder) || normalizedQuery.length >= MIN_CONTEXT_SEARCH_CHARS;

		if (normalizedQuery && !shouldSearchVault) {
			const fallbackKey = `${currentFolder ?? ''}\n`;
			const fallbackItems = contextCacheRef.current.get(fallbackKey) ?? menuContextItemsRef.current;
			const lq = normalizedQuery.toLowerCase();
			return fallbackItems.filter((item) =>
				item.label.toLowerCase().includes(lq) ||
				item.description?.toLowerCase().includes(lq) ||
				item.value.toLowerCase().includes(lq),
			);
		}

		try {
			const isInitial = !normalizedQuery && !currentFolder;
			let results: SearchResultItem[] = [];
			let recentCount = 0;

			if (isInitial) {
				results = await searchClient.getRecent(RECENT_FILES_COUNT);
				recentCount = results.length;
			}

			if (shouldSearchVault) {
				const searchResults = await searchClient.search({
					text: normalizedQuery,
					scopeMode: currentFolder ? 'inFolder' : 'vault',
					scopeValue: currentFolder ? { folderPath: currentFolder } : undefined,
					topK: SEARCH_RESULTS_TOP_K,
					searchMode: 'fulltext',
				});
				results.push(...(searchResults.items || []));
			}
			const seen = new Set<string>();
			const unique = results.filter((item) => {
				const key = item.path || item.id;
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
			const items = unique.map((item, idx) => ({
				id: item.path || item.id,
				label: item.title || item.path || item.id,
				description: item.path || item.id,
				value: item.path || item.id,
				icon: (isSelected: boolean) => getFileIcon(item.type, isSelected),
				showArrow: item.type === 'folder',
				group: isInitial && idx < recentCount ? 'Recent' : undefined,
				meta: deriveMetaBadge(item),
			}));
			contextCacheRef.current.set(cacheKey, items);
			return items;
		} catch (error) {
			console.error('Error searching files:', error);
			return [];
		}
	}, [searchClient]);

	useEffect(() => {
		handleSearchContext('', undefined).then(setMenuContextItems);
	}, [handleSearchContext]);

	const handleSearchPrompts = useCallback(async (query: string): Promise<NavigableMenuItem[]> => {
		// Build copilot action items as built-in quick actions
		const copilotItems: NavigableMenuItem[] = CopilotActionRegistry.getInstance().getAll().map((action) => ({
			id: action.id,
			label: action.label,
			description: action.description,
			value: action.label,
			group: 'Quick Actions',
			icon: (isSelected: boolean) => {
				return React.createElement(action.icon, {
					className: cn('pktw-w-4 pktw-h-4', isSelected ? 'pktw-text-inherit' : 'pktw-text-[var(--text-muted)]'),
				});
			},
		}));

		// User templates from promptsSuggest
		const templateItems: NavigableMenuItem[] = promptsSuggest.map((p) => ({
			...p,
			group: p.group ?? 'My Templates',
		}));

		// Combine both lists
		let results: NavigableMenuItem[] = [...copilotItems, ...templateItems];

		// Filter by query
		if (query.trim()) {
			const lq = query.toLowerCase();
			results = results.filter((p) =>
				p.label.toLowerCase().includes(lq) || p.description?.toLowerCase().includes(lq) || p.value.toLowerCase().includes(lq),
			);
		}

		// Deduplicate by value
		const seen = new Set<string>();
		return results.filter((item) => {
			if (seen.has(item.value)) return false;
			seen.add(item.value);
			return true;
		});
	}, [promptsSuggest]);

	const handleMenuSelect = useCallback(async (triggerChar: string, selectedItem?: any) => {
		const isContextTrigger = triggerChar === '@' || triggerChar === '[[';
		if (isContextTrigger && selectedItem?.showArrow) {
			const folderPath = selectedItem.value as string;
			setFolderStack((prev) => [...prev, folderPath]);
			try {
				const folderContents = await handleSearchContext('', folderPath);
				setMenuContextItems(folderContents);
			} catch {
				setMenuContextItems([]);
			}
		}
	}, [handleSearchContext]);

	const handleFolderUp = useCallback(async () => {
		setFolderStack((prev) => {
			const next = prev.slice(0, -1);
			const parentFolder = next.length > 0 ? next[next.length - 1] : undefined;
			handleSearchContext('', parentFolder).then(setMenuContextItems).catch(() => setMenuContextItems([]));
			return next;
		});
	}, [handleSearchContext]);

	return { menuContextItems, folderStack, handleSearchContext, handleSearchPrompts, handleMenuSelect, handleFolderUp };
}
