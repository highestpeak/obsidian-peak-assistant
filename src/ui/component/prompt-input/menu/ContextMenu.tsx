import React, { useMemo } from 'react';
import { NavigableMenu, type NavigableMenuItem } from '../../mine/NavigableMenu';
import { FileText, Image as ImageIcon, Folder, Hash, Archive, FileType, ChevronRight } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { MarkdownIcon } from '../../icon/MarkdownIcon';

/**
 * File item structure for context menu
 */
export interface FileItem {
	id: string;
	type: string;
	title: string;
	path: string;
	lastModified?: number;
}

/**
 * Context menu props
 */
export interface ContextMenuProps {
	files: FileItem[]; // External file list (like prompts)
	query?: string; // For filtering files
	loading?: boolean; // Loading state
	onSelect: (fileReference: string) => void;
	onClose: () => void;
	className?: string;
	currentFolder?: string; // Current folder path for navigation
	onNavigateFolder?: (folderPath: string) => void; // Callback when navigating into a folder
	containerRef?: React.RefObject<HTMLElement>; // Reference to container element for position calculation
}

/**
 * Context menu component for @ and [[ ]] commands
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({
	files,
	query = '',
	loading = false,
	onSelect,
	onClose,
	className,
	currentFolder,
	onNavigateFolder,
	containerRef,
}) => {


	const items = useMemo<NavigableMenuItem[]>(() => {
		if (loading) {
			// Return empty array so NavigableMenu can show loading message
			return [];
		}

		if (!files || files.length === 0) {
			// Return empty array so NavigableMenu can show emptyMessage
			return [];
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
			isLoading={loading}
			loadingMessage="Searching..."
			emptyMessage={query.trim() ? "No files found" : "Recent files will appear here"}
			containerRef={containerRef}
		/>
	);
};
