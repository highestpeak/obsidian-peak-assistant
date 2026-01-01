import React, { useState } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { usePromptInputContext } from './PromptInput';
import { X, Paperclip, Image as ImageIcon, FileText, type LucideIcon } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/component/shared-ui/tooltip';
import type { FileAttachment } from './types';

export interface PromptInputAttachmentsProps {
	className?: string;
}

/**
 * Default icon className for all file types
 */
const DEFAULT_ICON_CLASSNAME = 'pktw-size-4 pktw-text-muted-foreground';

/**
 * File type configuration map
 * Defines how different file types should be displayed
 */
interface FileTypeConfig {
	icon: LucideIcon;
	iconClassName?: string; // Only specify if different from default
	containerClassName?: string;
	showPreview?: boolean; // Whether to show image preview if available
}

const FILE_TYPE_CONFIG: Record<FileAttachment['type'], FileTypeConfig> = {
	image: {
		icon: ImageIcon,
		showPreview: true,
	},
	pdf: {
		icon: FileText,
		containerClassName: 'pktw-bg-[#c92a2a] pktw-border-[#ca1f1f] pktw-text-white',
	},
	file: {
		icon: Paperclip,
	},
};

/**
 * Individual attachment item component
 */
const AttachmentItem: React.FC<{
	file: FileAttachment;
	onRemove: (id: string) => void;
}> = ({ file, onRemove }) => {
	const config = FILE_TYPE_CONFIG[file.type];
	const Icon = config.icon;
	const [showImagePreview, setShowImagePreview] = useState(false);

	return (
		<div
			className={cn(
				'pktw-group pktw-relative pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-md',
				'pktw-border pktw-border-border pktw-bg-secondary pktw-px-2 pktw-py-1.5',
				'pktw-transition-colors hover:pktw-bg-accent',
				config.containerClassName
			)}
		>
			{config.showPreview && file.preview ? (
				<Tooltip open={showImagePreview} onOpenChange={setShowImagePreview}>
					<TooltipTrigger asChild>
						<img
							src={file.preview}
							alt={file.file.name}
							className="pktw-h-8 pktw-w-8 pktw-rounded pktw-object-cover pktw-cursor-pointer"
							onMouseEnter={() => setShowImagePreview(true)}
							onMouseLeave={() => setShowImagePreview(false)}
						/>
					</TooltipTrigger>
					<TooltipContent 
						side="top" 
						sideOffset={4}
						className="pktw-p-0 pktw-border-0 pktw-bg-transparent pktw-shadow-none pktw-max-w-[min(400px,calc(100vw-2rem))]"
						align="start"
						avoidCollisions={true}
						collisionPadding={8}
					>
						<img
							src={file.preview}
							alt={file.file.name}
							className="pktw-max-h-[400px] pktw-max-w-[400px] pktw-w-full pktw-h-auto pktw-rounded-lg pktw-border pktw-border-border pktw-shadow-lg pktw-object-contain"
						/>
					</TooltipContent>
				</Tooltip>
			) : (
				<Icon className={config.iconClassName || DEFAULT_ICON_CLASSNAME} />
			)}
			<span className={cn(
				'pktw-text-sm pktw-font-medium pktw-truncate pktw-max-w-[120px]',
				file.type === 'pdf' && 'pktw-text-white'
			)}>
				{file.file.name}
			</span>
			<Button
				variant="ghost"
				size="icon"
				className={cn(
					'pktw-h-5 pktw-w-5 pktw-opacity-0 pktw-transition-opacity group-hover:pktw-opacity-100',
					'pktw-rounded-full pktw-bg-destructive/90 pktw-backdrop-blur-sm hover:pktw-bg-destructive',
					'pktw-text-destructive-foreground pktw-border pktw-border-destructive-foreground/20'
				)}
				onClick={(e) => {
					e.stopPropagation();
					onRemove(file.id);
				}}
				type="button"
				aria-label="Remove attachment"
			>
				<X className="pktw-size-3" />
			</Button>
		</div>
	);
};

/**
 * Display attachments above the textarea
 */
export const PromptInputAttachments: React.FC<PromptInputAttachmentsProps> = ({
	className,
}) => {
	const { attachments } = usePromptInputContext();

	if (attachments.files.length === 0) {
		return null;
	}

	return (
		<TooltipProvider>
			<div className={cn('pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-2 pktw-px-3 pktw-pt-3 pktw-pb-2 pktw-border-b-0', className)}>
				{attachments.files.map((file) => (
					<AttachmentItem
						key={file.id}
						file={file}
						onRemove={attachments.remove}
					/>
				))}
			</div>
		</TooltipProvider>
	);
};

