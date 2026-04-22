import React, { useCallback, useMemo } from 'react';
import { App } from 'obsidian';
import { ChatMessage } from '@/service/chat/types';
import { cn } from '@/ui/react/lib/utils';
import { FileText } from 'lucide-react';
import {
	MessageAttachment,
} from '@/ui/component/ai-elements';
import { TooltipProvider } from '@/ui/component/shared-ui/tooltip';
import { ResourcePreviewHover } from '@/ui/component/mine';
import { isUrl, getExtensionFromSource, getImageMimeType } from '@/core/document/helper/FileTypeUtils';

/** File attachment UI part (standalone definition, formerly from 'ai' package). */
interface FileUIPart { type: 'file'; filename?: string; mediaType: string; url: string; }
import { ChatResourceRef } from '@/service/chat/types';
import { ResourceKind } from '@/core/document/types';
import { openFile } from '@/core/utils/obsidian-utils';

/**
 * UI representation of a resource attachment
 */
interface ResourceUIAttachment extends FileUIPart {
	resource: ChatResourceRef;
	fileType: ResourceKind;
}

/**
 * Component for rendering message attachments
 */
export const MessageAttachmentsList: React.FC<{
	message: ChatMessage;
	app: App;
}> = ({ message, app }) => {
	const fileAttachments = useMemo(() => {
		if (!message.resources || message.resources.length === 0) {
			return [];
		}

		return message.resources.map((resource) => {
			const source = resource.source;
			const extension = getExtensionFromSource(source);

			let mediaType: string;
			if (resource.kind === 'image') {
				mediaType = getImageMimeType(extension);
			} else if (resource.kind === 'pdf') {
				mediaType = 'application/pdf';
			} else {
				mediaType = 'application/octet-stream';
			}

			return {
				type: 'file' as const,
				url: source,
				filename: source.split('/').pop() || source,
				mediaType: mediaType,
				resource: resource,
				fileType: resource.kind,
			};
		});
	}, [message.resources, app]);

	/**
	 * Handle opening a resource based on its type
	 */
	const handleOpenResource = useCallback(async (attachment: ResourceUIAttachment) => {
		const url = attachment.url;
		if (!url) return;

		// Handle URL resources - open in new tab
		if (isUrl(url)) {
			window.open(url, '_blank', 'noopener,noreferrer');
			return;
		}

		// Handle file resources
		await openFile(url, false, app);
	}, [app]);

	if (fileAttachments.length === 0) {
		return null;
	}

	/**
	 * Render a single attachment with preview hover
	 */
	const renderAttachment = (attachment: ResourceUIAttachment, index: number, isImage: boolean) => {
		const isPdf = attachment.fileType === 'pdf';

		const handleClick = async (e: React.MouseEvent) => {
			e.stopPropagation();
			await handleOpenResource(attachment);
		};

		const wrappedContent = (
			<ResourcePreviewHover
				resource={attachment.resource}
				app={app}
				previewClassName="pktw-z-[100]"
			>
				<div
					className={cn(
						"pktw-cursor-pointer pktw-transition-opacity hover:pktw-opacity-90",
						isPdf || !isImage ? "pktw-w-full" : "pktw-flex-shrink-0"
					)}
					onClick={handleClick}
				>
					{isPdf ? (
						<div className="pktw-flex pktw-flex-row pktw-w-full pktw-shrink-0 pktw-items-center pktw-rounded-lg pktw-border-1 pktw-border-solid pktw-border-gray-200 dark:pktw-border-gray-600 pktw-bg-white pktw-px-1.5 pktw-py-1.5 pktw-gap-3 pktw-min-h-[48px]">
							<div className="pktw-flex-shrink-0 pktw-w-8 pktw-h-8 pktw-bg-red-500 pktw-rounded pktw-flex pktw-items-center pktw-justify-center">
								<FileText className="pktw-size-4 pktw-text-white" />
							</div>
							<div className="pktw-flex-1 pktw-flex pktw-flex-col pktw-gap-1 pktw-min-w-0">
								<span className="pktw-text-sm pktw-font-medium pktw-text-gray-900 pktw-truncate">
									{attachment.filename}
								</span>
								<span className="pktw-text-xs pktw-text-gray-500 pktw-uppercase pktw-font-medium">
									PDF
								</span>
							</div>
						</div>
					) : (
						<MessageAttachment data={attachment} onClick={handleClick} />
					)}
				</div>
			</ResourcePreviewHover>
		);

		// Only wrap with TooltipProvider for non-PDF files
		if (isPdf) {
			return <React.Fragment key={`attachment-${index}`}>{wrappedContent}</React.Fragment>;
		}

		return (
			<TooltipProvider key={`attachment-${index}`}>
				{wrappedContent}
			</TooltipProvider>
		);
	};

	// Group attachments by type for layout
	const imageAttachments = fileAttachments.filter(att => att.fileType === 'image');
	const otherAttachments = fileAttachments.filter(att => att.fileType !== 'image');

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-w-full pktw-max-w-full pktw-min-w-0">
			{/* Images: horizontal layout with wrapping */}
			{imageAttachments.length > 0 && (
				<div className="pktw-flex pktw-flex-wrap pktw-gap-2 pktw-w-full pktw-max-w-full pktw-min-w-0">
					{imageAttachments.map((attachment, index) => renderAttachment(attachment, index, true))}
				</div>
			)}
			{/* Other attachments (PDFs, etc.): vertical layout, full width */}
			{otherAttachments.length > 0 && (
				<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-w-full pktw-max-w-full pktw-min-w-0">
					{otherAttachments.map((attachment, index) => renderAttachment(attachment, index, false))}
				</div>
			)}
		</div>
	);
};
