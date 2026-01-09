import React, { useState, useCallback } from 'react';
import { FileChange } from '@/service/chat/types';
import { Button } from '@/ui/component/shared-ui/button';
import { X, Check, FileText, Image, File, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

/**
 * Get appropriate icon for file type
 */
const getFileIcon = (extension?: string) => {
	if (!extension) return File;

	const lowerExt = extension.toLowerCase();
	if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(lowerExt)) {
		return Image;
	}
	if (['md', 'txt', 'json', 'js', 'ts', 'py', 'java', 'cpp', 'c', 'css', 'html', 'xml', 'yaml', 'yml'].includes(lowerExt)) {
		return FileText;
	}
	return File;
};

/**
 * Component for displaying a single file change item
 */
const FileChangeItem: React.FC<{
	change: FileChange;
	onAccept: (id: string) => void;
	onDiscard: (id: string) => void;
}> = ({ change, onAccept, onDiscard }) => {
	const [isHovered, setIsHovered] = useState(false);
	const fileName = change.filePath.split('/').pop() || change.filePath;
	const extension = fileName.split('.').pop();
	const IconComponent = getFileIcon(extension);

	return (
		<div
			className="pktw-flex pktw-items-center pktw-justify-between pktw-px-4 pktw-py-2 pktw-transition-all pktw-duration-200 hover:pktw-bg-blue-500/10 hover:pktw-shadow-sm"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-flex-1 pktw-min-w-0">
				<IconComponent className="pktw-w-4 pktw-h-4 pktw-text-black pktw-flex-shrink-0" />
				<span className=" pktw-truncate pktw-text-black">
					{fileName}
				</span>
				<div className="pktw-whitespace-nowrap pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-gap-1">
					{change.addedLines > 0 && (
						<span className="pktw-text-green-600">
							+{change.addedLines}
						</span>
					)}
					&nbsp;
					{change.removedLines > 0 && (
						<span className="pktw-text-red-600">
							-{change.removedLines}
						</span>
					)}
				</div>
			</div>

			<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-flex-shrink-0">
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"pktw-h-6 pktw-w-6 pktw-p-0 pktw-transition-opacity pktw-duration-200",
						isHovered ? "pktw-opacity-100" : "pktw-opacity-0 pktw-pointer-events-none"
					)}
					onClick={() => onDiscard(change.id)}
					title="Discard changes"
				>
					<X className="pktw-w-4 pktw-h-4 pktw-text-black hover:pktw-text-white" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"pktw-h-6 pktw-w-6 pktw-p-0 pktw-transition-opacity pktw-duration-200",
						isHovered ? "pktw-opacity-100" : "pktw-opacity-0 pktw-pointer-events-none"
					)}
					onClick={() => onAccept(change.id)}
					title="Accept changes"
				>
					<Check className="pktw-w-4 pktw-h-4 pktw-text-black hover:pktw-text-white" />
				</Button>
			</div>
		</div>
	);
};

/**
 * Component for displaying list of file changes with bulk actions
 */
export const FileChangesList: React.FC<{
	changes: FileChange[];
	onAcceptAll: () => void;
	onDiscardAll: () => void;
	onAcceptChange: (id: string) => void;
	onDiscardChange: (id: string) => void;
}> = ({ changes, onAcceptAll, onDiscardAll, onAcceptChange, onDiscardChange }) => {
	const [isExpanded, setIsExpanded] = useState(true);

	if (changes.length === 0) {
		return null;
	}

	const toggleExpanded = useCallback(() => {
		setIsExpanded(prev => !prev);
	}, []);

	return (
		<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-mx-4">
			{/* Header */}
			<div className={cn(
				"pktw-flex pktw-items-center pktw-justify-between pktw-px-4 pktw-py-3 pktw-border-b pktw-border-border pktw-bg-blue-500/15",
				isExpanded ? "pktw-rounded-t-lg" : "pktw-rounded-lg"
			)}>
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="pktw-h-6 pktw-w-6 pktw-p-0 pktw-text-black hover:pktw-text-white"
						onClick={toggleExpanded}
						title={isExpanded ? 'Collapse' : 'Expand'}
					>
						{isExpanded ? (
							<ChevronUp className="pktw-w-4 pktw-h-4" />
						) : (
							<ChevronDown className="pktw-w-4 pktw-h-4" />
						)}
					</Button>
					<span className="pktw-text-black">
						{changes.length} File{changes.length !== 1 ? 's' : ''}
					</span>
				</div>
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="pktw-text-black hover:pktw-text-white"
						onClick={onDiscardAll}
					>
						Undo all
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="pktw-text-black hover:pktw-text-white"
						onClick={onAcceptAll}
					>
						Keep all
					</Button>
				</div>
			</div>

			{/* File list with smooth transition */}
			<div
				className={cn(
					"pktw-overflow-hidden pktw-transition-all pktw-duration-300 pktw-ease-in-out",
					isExpanded ? "pktw-max-h-60 pktw-opacity-100" : "pktw-max-h-0 pktw-opacity-0"
				)}
			>
				<div className="pktw-max-h-60 pktw-overflow-y-auto pktw-bg-blue-500/15 pktw-rounded-b-lg">
					{changes.map((change) => (
						<FileChangeItem
							key={change.id}
							change={change}
							onAccept={onAcceptChange}
							onDiscard={onDiscardChange}
						/>
					))}
				</div>
			</div>
		</div>
	);
};