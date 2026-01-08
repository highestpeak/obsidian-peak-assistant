import React, { useState, useEffect, useMemo } from 'react';
import { NavigableMenu, type NavigableMenuItem } from '../../mine/NavigableMenu';
import { FileText, Search, Image as ImageIcon, Folder, Hash, Archive, FileType, ChevronRight } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';
import { MarkdownIcon } from '../../icon/MarkdownIcon';

/**
 * Context menu props
 */
export interface ContextMenuProps {
	query?: string; // For filtering files
	onSelect: (fileReference: string) => void;
	onClose: () => void;
	className?: string;
	maxItems?: number;
	currentFolder?: string; // Current folder path for navigation
	onNavigateFolder?: (folderPath: string) => void; // Callback when navigating into a folder
}

/**
 * Context menu component for @ and [[ ]] commands
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
	query = '',
	onSelect,
	onClose,
	className,
	maxItems = 10,
	currentFolder,
	onNavigateFolder,
}) => {
	const { searchClient } = useServiceContext();
	const [files, setFiles] = useState<any[]>([]);
	const [loading, setLoading] = useState(false);

	// Search for files when query changes
	useEffect(() => {
		const searchFiles = async () => {
			setLoading(true);
			try {
				if (query.trim()) {
					// Search for files matching the query
					if (searchClient) {
						const results = await searchClient.search({
							text: query,
							scopeMode: currentFolder ? 'inFolder' : 'vault',
							scopeValue: currentFolder ? { folderPath: currentFolder } : undefined,
							topK: maxItems,
							searchMode: 'fulltext'
						});
						setFiles(results.items || []);
					} else {
						setFiles([]);
					}
				} else {
					// Show recent files or folder contents when no query
					if (searchClient) {
						if (currentFolder) {
							// Show contents of current folder
							const results = await searchClient.search({
								text: '',
								scopeMode: 'inFolder',
								scopeValue: { folderPath: currentFolder },
								topK: maxItems,
								searchMode: 'fulltext'
							});
							setFiles(results.items || []);
						} else {
							// Show recent files at root level
							const recentFiles = await searchClient.getRecent(maxItems);
							setFiles(recentFiles);
						}
					} else {
						setFiles([]);
					}
				}
			} catch (error) {
				console.error('Error searching files:', error);
				setFiles([]);
			} finally {
				setLoading(false);
			}
		};

		// Debounce search
		const timeoutId = setTimeout(searchFiles, 150);
		return () => clearTimeout(timeoutId);
	}, [query, searchClient, maxItems, currentFolder]);

	const items = useMemo<NavigableMenuItem[]>(() => {
		if (loading) {
			return [{
				id: 'loading',
				label: 'Searching...',
				value: '',
				disabled: true,
			}];
		}

		if (files.length === 0) {
			return [{
				id: 'empty',
				label: query.trim() ? 'No files found' : 'Recent files will appear here',
				value: '',
				disabled: true,
			}];
		}

		// Helper function to get icon based on file type
		const getFileIcon = (type: string, isSelected: boolean) => {
			const iconClass = cn("pktw-size-4", isSelected ? "pktw-text-white" : "pktw-text-muted-foreground");

			switch (type) {
				case 'image':
					return <ImageIcon className={iconClass} />;
				case 'pdf':
					return <FileType className={iconClass} />;
				case 'folder':
					return <Folder className={iconClass} />;
				case 'tag':
					return <Hash className={iconClass} />;
				case 'category':
					return <Archive className={iconClass} />;
				case 'markdown':
					return <MarkdownIcon size={16} className={iconClass} />;
				default:
					return <FileText className={iconClass} />;
			}
		};

		// Helper function to get right icon (for folders)
		const getRightIcon = (type: string, isSelected: boolean) => {
			if (type === 'folder') {
				return <ChevronRight className={cn("pktw-size-4 pktw-flex-shrink-0", isSelected ? "pktw-text-white" : "pktw-text-muted-foreground")} />;
			}
			return null;
		};

		return files.map(file => ({
			id: file.path || file.id,
			label: file.title || file.path || file.id,
			description: file.path,
			icon: (isSelected: boolean) => getFileIcon(file.type, isSelected),
			rightIcon: (isSelected: boolean) => getRightIcon(file.type, isSelected),
			value: file.path || file.id, // Use path as the reference
		}));
	}, [files, loading, query]);

	const handleSelect = (item: NavigableMenuItem) => {
		if (item.disabled) return;

		// Find the original file to check its type
		const originalFile = files.find(f => (f.path || f.id) === item.value);

		// If it's a folder and we have navigation callback, navigate into it
		if (originalFile?.type === 'folder' && onNavigateFolder) {
			onNavigateFolder(item.value);
			return;
		}

		// Otherwise, format as [[file path]] for wiki links
		const wikiLink = `[[${item.value}]]`;
		onSelect(wikiLink);
	};

	return (
		<NavigableMenu
			items={items}
			onSelect={(item) => handleSelect(item)}
			onClose={onClose}
			className={className}
			isTagStyle={false}
			emptyMessage={query.trim() ? "No files found" : "Start typing to search files..."}
		/>
	);
};
