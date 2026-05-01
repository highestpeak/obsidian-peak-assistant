import React, { useState, useCallback } from 'react';
import { FileChange } from '@/service/chat/types';
import { Button } from '@/ui/component/shared-ui/button';
import { X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { FileIcon, pathToFileIconType } from '@/ui/view/shared/file-utils';
import { useChatViewStore } from '../../store/chatViewStore';


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

	return (
		<div
			className="pktw-group pktw-flex pktw-items-center pktw-justify-between pktw-px-4 pktw-py-2 pktw-transition-all pktw-duration-200 hover:pktw-bg-muted hover:pktw-shadow-sm"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-flex-1 pktw-min-w-0">
				<FileIcon type={pathToFileIconType(change.filePath)} className="pktw-text-foreground pktw-flex-shrink-0" size={16} />
				<span className="pktw-truncate pktw-text-foreground">
					{fileName}
				</span>
				<div className="pktw-whitespace-nowrap pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-gap-1">
					{change.addedLines > 0 && change.removedLines === 0 && (
						<span className="pktw-text-[8px] pktw-font-bold pktw-px-1 pktw-py-0.5 pktw-rounded pktw-bg-[var(--pk-success,#22c55e)]/10 pktw-text-[var(--pk-success,#22c55e)]">NEW</span>
					)}
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
						"pktw-h-6 pktw-w-6 pktw-p-0 pktw-transition-opacity pktw-duration-200 pktw-opacity-0 group-hover:pktw-opacity-100",
						isHovered ? "pktw-opacity-100" : "pktw-opacity-0 pktw-pointer-events-none"
					)}
					onClick={() => onDiscard(change.id)}
					title="Discard changes"
				>
					<X className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground hover:pktw-text-foreground" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						"pktw-h-6 pktw-w-6 pktw-p-0 pktw-transition-opacity pktw-duration-200 pktw-opacity-0 group-hover:pktw-opacity-100",
						isHovered ? "pktw-opacity-100" : "pktw-opacity-0 pktw-pointer-events-none"
					)}
					onClick={() => onAccept(change.id)}
					title="Accept changes"
				>
					<Check className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground hover:pktw-text-foreground" />
				</Button>
			</div>
		</div>
	);
};

/**
 * Component for displaying list of file changes with bulk actions
 */
export const FileChangesList: React.FC = () => {
	const {
		fileChanges,
		acceptAllFileChanges,
		discardAllFileChanges,
		acceptFileChange,
		discardFileChange
	} = useChatViewStore();

	const [isExpanded, setIsExpanded] = useState(true);

	if (fileChanges.length === 0) {
		return null;
	}

	const toggleExpanded = useCallback(() => {
		setIsExpanded(prev => !prev);
	}, []);

	return (
		<div className="pktw-border pktw-border-border pktw-rounded-lg pktw-mx-4">
			{/* Header */}
			<div className={cn(
				"pktw-flex pktw-items-center pktw-justify-between pktw-px-4 pktw-py-3 pktw-border-b pktw-border-border pktw-bg-secondary",
				isExpanded ? "pktw-rounded-t-lg" : "pktw-rounded-lg"
			)}>
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="pktw-h-6 pktw-w-6 pktw-p-0 pktw-text-muted-foreground hover:pktw-text-foreground"
						onClick={toggleExpanded}
						title={isExpanded ? 'Collapse' : 'Expand'}
					>
						{isExpanded ? (
							<ChevronUp className="pktw-w-4 pktw-h-4" />
						) : (
							<ChevronDown className="pktw-w-4 pktw-h-4" />
						)}
					</Button>
					<span className="pktw-text-foreground">
						{fileChanges.length} File{fileChanges.length !== 1 ? 's' : ''}
					</span>
				</div>
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Button
						variant="ghost"
						size="sm"
						className="pktw-text-muted-foreground hover:pktw-text-foreground"
						onClick={discardAllFileChanges}
					>
						Undo all
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="pktw-text-muted-foreground hover:pktw-text-foreground"
						onClick={acceptAllFileChanges}
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
				<div className="pktw-max-h-60 pktw-overflow-y-auto pktw-bg-secondary pktw-rounded-b-lg">
					{fileChanges.map((change) => (
						<FileChangeItem
							key={change.id}
							change={change}
							onAccept={acceptFileChange}
							onDiscard={discardFileChange}
						/>
					))}
				</div>
			</div>
		</div>
	);
};