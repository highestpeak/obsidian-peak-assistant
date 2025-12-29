import React from 'react';
import { cn } from '@/ui/react/lib/utils';
import { usePromptInputContext } from './PromptInput';
import { X, Paperclip, Image as ImageIcon, FileText, type LucideIcon } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
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
		<div className={cn('pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-2 pktw-px-3 pktw-pt-3 pktw-pb-2 pktw-border-b-0', className)}>
			{attachments.files.map((file) => {
				const config = FILE_TYPE_CONFIG[file.type];
				const Icon = config.icon;

				return (
					<div
						key={file.id}
						className={cn(
							'pktw-group pktw-relative pktw-flex pktw-items-center pktw-gap-2 pktw-rounded-md',
							'pktw-border pktw-border-border pktw-bg-secondary pktw-px-2 pktw-py-1.5',
							'pktw-transition-colors hover:pktw-bg-accent',
							config.containerClassName
						)}
					>
						{config.showPreview && file.preview ? (
							<img
								src={file.preview}
								alt={file.file.name}
								className="pktw-h-8 pktw-w-8 pktw-rounded pktw-object-cover"
							/>
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
								file.type === 'pdf' && 'pktw-text-white'
							)}
							onClick={() => attachments.remove(file.id)}
							type="button"
						>
							<X className="pktw-size-3" />
						</Button>
					</div>
				);
			})}
		</div>
	);
};

