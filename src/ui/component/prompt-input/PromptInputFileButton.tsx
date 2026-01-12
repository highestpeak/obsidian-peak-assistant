import React, { useState } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { usePromptInputContext } from './PromptInput';
import { Plus, Upload, FileText, Check } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { HoverButton } from '@/ui/component/mine';

export interface PromptInputFileButtonProps {
	className?: string;

	// Attachment handling mode - controlled externally
	attachmentHandlingMode?: 'direct' | 'degrade_to_text';

	// Callback when attachment handling mode changes
	onAttachmentHandlingModeChange?: (mode: 'direct' | 'degrade_to_text') => void;
}

/**
 * File upload button with hover menu for upload options
 * Attachment handling mode is controlled externally
 */
export const PromptInputFileButton: React.FC<PromptInputFileButtonProps> = ({
	className,
	attachmentHandlingMode = 'degrade_to_text',
	onAttachmentHandlingModeChange,
}) => {
	const { attachments } = usePromptInputContext();
	const prevFilesRef = React.useRef(attachments.files);
	const [forceCloseMenu, setForceCloseMenu] = React.useState(false);
	const [fileDialogOpened, setFileDialogOpened] = React.useState(false);

	const handleModeSelect = (mode: 'direct' | 'degrade_to_text') => {
		if (onAttachmentHandlingModeChange) {
			onAttachmentHandlingModeChange(mode);
		}
	};

	// Handle upload click - open file dialog and mark dialog as opened
	const handleUploadClick = () => {
		setFileDialogOpened(true);
		attachments.openFileDialog();
	};

	// Close hover menu when file dialog interaction completes
	React.useEffect(() => {
		const currentFiles = attachments.files;
		const prevFiles = prevFilesRef.current;

		// If file dialog was opened and files array changed (user completed file selection)
		if (fileDialogOpened && currentFiles !== prevFiles) {
			setForceCloseMenu(true);
			setFileDialogOpened(false);

			// Reset force close after a short delay to allow normal hover behavior again
			setTimeout(() => {
				setForceCloseMenu(false);
			}, 1000); // Allow normal behavior after 1 second
		}

		prevFilesRef.current = currentFiles;
	}, [attachments.files, fileDialogOpened]);

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
						'pktw-w-4 pktw-h-4 pktw-mr-3 pktw-flex-shrink-0',
						attachmentHandlingMode === 'degrade_to_text'
							? 'pktw-text-accent-foreground'
							: 'pktw-text-blue-500'
					)} />
					<div className="pktw-flex pktw-flex-col pktw-items-start">
						<span className="pktw-text-sm pktw-font-medium">Summarize First</span>
						<span className={cn(
							'pktw-text-xs',
							attachmentHandlingMode === 'degrade_to_text'
								? 'pktw-text-accent-foreground'
								: 'pktw-text-muted-foreground'
						)}>Summaries then send.</span>
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
						'pktw-w-4 pktw-h-4 pktw-mr-3 pktw-flex-shrink-0',
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
			onClick={handleUploadClick}
			hoverMenuContent={forceCloseMenu ? null : menuContent}
		/>
	);
};