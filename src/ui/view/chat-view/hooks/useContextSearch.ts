import { useCallback, useEffect, useState } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { getFileIcon } from '@/ui/view/shared/file-utils';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';
import type { SearchResultItem } from '@/service/search/types';
import { useChatViewStore } from '../store/chatViewStore';

const RECENT_FILES_COUNT = 3;
const SEARCH_RESULTS_TOP_K = 20;

export function useContextSearch() {
	const { searchClient, manager } = useServiceContext();
	const promptsSuggest = useChatViewStore((s) => s.promptsSuggest);
	const [menuContextItems, setMenuContextItems] = useState<NavigableMenuItem[]>([]);

	const handleSearchContext = useCallback(async (query: string, currentFolder?: string): Promise<NavigableMenuItem[]> => {
		if (!searchClient) return [];
		try {
			let results: SearchResultItem[] = await searchClient.getRecent(RECENT_FILES_COUNT);
			if (query.trim() || currentFolder) {
				const searchResults = await searchClient.search({
					text: query.trim() || '',
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
			return unique.map((item) => ({
				id: item.path || item.id,
				label: item.title || item.path || item.id,
				description: item.path || item.id,
				value: item.path || item.id,
				icon: (isSelected: boolean) => getFileIcon(item.type, isSelected),
				showArrow: item.type === 'folder',
			}));
		} catch (error) {
			console.error('Error searching files:', error);
			return [];
		}
	}, [searchClient]);

	useEffect(() => {
		handleSearchContext('', undefined).then(setMenuContextItems);
	}, [handleSearchContext]);

	const handleSearchPrompts = useCallback(async (query: string): Promise<NavigableMenuItem[]> => {
		const results: NavigableMenuItem[] = [];
		if (!query.trim()) {
			results.push(...promptsSuggest);
		} else {
			const lq = query.toLowerCase();
			results.push(...promptsSuggest.filter((p) =>
				p.label.toLowerCase().includes(lq) || p.description?.toLowerCase().includes(lq) || p.value.toLowerCase().includes(lq),
			));
		}
		if (query.trim()) {
			try {
				const ext = await manager.searchPrompts(query);
				results.push(...ext);
			} catch { /* ignore */ }
		}
		const seen = new Set<string>();
		return results.filter((item) => {
			if (seen.has(item.value)) return false;
			seen.add(item.value);
			return true;
		});
	}, [promptsSuggest, manager]);

	const handleMenuSelect = useCallback(async (triggerChar: string, selectedItem?: any) => {
		const isContextTrigger = triggerChar === '@' || triggerChar === '[[';
		if (isContextTrigger && selectedItem?.showArrow) {
			try {
				const folderContents = await handleSearchContext('', selectedItem.value);
				setMenuContextItems(folderContents);
			} catch {
				setMenuContextItems([]);
			}
		}
	}, [handleSearchContext]);

	return { menuContextItems, handleSearchContext, handleSearchPrompts, handleMenuSelect };
}
