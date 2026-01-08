import React, { useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { usePromptInputContext } from './PromptInput';
import { Plus, Upload, FileText, Check } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useProjectStore } from '@/ui/store/projectStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { HoverButton } from '@/ui/component/mine';

export interface PromptInputFileButtonProps {
	className?: string;
}

/**
 * File upload button with hover menu for upload options
 */
export const PromptInputFileButton: React.FC<PromptInputFileButtonProps> = ({
	className,
}) => {
	const { attachments } = usePromptInputContext();
	const { manager } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const [isHovered, setIsHovered] = useState(false);

	// Get effective attachment handling mode
	const attachmentHandlingMode = activeConversation?.meta.attachmentHandlingOverride ?? manager.getSettings().attachmentHandlingDefault ?? 'degrade_to_text';

	const handleUploadMode = async (mode: 'direct' | 'degrade_to_text') => {
		if (!activeConversation) return;

		await manager.updateConversationAttachmentHandling({
			conversationId: activeConversation.meta.id,
			attachmentHandlingOverride: mode,
		});
	};

	const handleModeSelect = async (mode: 'direct' | 'degrade_to_text') => {
		if (!activeConversation) return;
		await manager.updateConversationAttachmentHandling({
			conversationId: activeConversation.meta.id,
			attachmentHandlingOverride: mode,
		});
	};

	const menuContent = (
		<div className="pktw-flex pktw-flex-col pktw-gap-3">
			<div className="pktw-text-sm pktw-font-medium pktw-text-foreground">
				Upload Mode
			</div>

			<div className="pktw-flex pktw-flex-col pktw-gap-2">
				{/* Summarize First Option */}
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-justify-start pktw-h-12 pktw-px-3 pktw-text-xs pktw-font-normal pktw-relative',
						attachmentHandlingMode === 'degrade_to_text'
							? 'pktw-bg-accent pktw-text-accent-foreground'
							: 'hover:pktw-bg-accent/50'
					)}
					onClick={() => handleModeSelect('degrade_to_text')}
				>
					<FileText className={cn(
						'pktw-w-4 pktw-h-4 pktw-mr-3',
						attachmentHandlingMode === 'degrade_to_text'
							? 'pktw-text-accent-foreground'
							: 'pktw-text-green-500'
					)} />
					<div className="pktw-flex pktw-flex-col pktw-items-start">
						<span className="pktw-text-sm pktw-font-medium">Summarize First</span>
						<span className={cn(
							'pktw-text-xs',
							attachmentHandlingMode === 'degrade_to_text'
								? 'pktw-text-accent-foreground'
								: 'pktw-text-muted-foreground'
						)}>Convert files to summaries first</span>
					</div>
					{attachmentHandlingMode === 'degrade_to_text' && (
						<Check className="pktw-w-4 pktw-h-4 pktw-absolute pktw-right-3 pktw-top-1/2 pktw-transform pktw--translate-y-1/2 pktw-text-accent-foreground" />
					)}
				</Button>

				{/* Direct Upload Option */}
				<Button
					variant="ghost"
					size="sm"
					className={cn(
						'pktw-justify-start pktw-h-12 pktw-px-3 pktw-text-xs pktw-font-normal pktw-relative',
						attachmentHandlingMode === 'direct'
							? 'pktw-bg-accent pktw-text-accent-foreground'
							: 'hover:pktw-bg-accent/50'
					)}
					onClick={() => handleModeSelect('direct')}
				>
					<Upload className={cn(
						'pktw-w-4 pktw-h-4 pktw-mr-3',
						attachmentHandlingMode === 'direct'
							? 'pktw-text-accent-foreground'
							: 'pktw-text-blue-500'
					)} />
					<div className="pktw-flex pktw-flex-col pktw-items-start">
						<span className="pktw-text-sm pktw-font-medium">Direct Upload</span>
						<span className={cn(
							'pktw-text-xs',
							attachmentHandlingMode === 'direct'
								? 'pktw-text-accent-foreground'
								: 'pktw-text-muted-foreground'
						)}>Upload files directly</span>
					</div>
					{attachmentHandlingMode === 'direct' && (
						<Check className="pktw-w-4 pktw-h-4 pktw-absolute pktw-right-3 pktw-top-1/2 pktw-transform pktw--translate-y-1/2 pktw-text-accent-foreground" />
					)}
				</Button>
			</div>
		</div>
	);

	return (
		<HoverButton
			icon={Plus}
			menuId="file-upload-options"
			onClick={attachments.openFileDialog}
			hoverMenuContent={menuContent}
		/>
	);
};