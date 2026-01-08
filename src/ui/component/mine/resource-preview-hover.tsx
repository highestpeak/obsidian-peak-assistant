import React, { useState, useEffect, useRef } from 'react';
import { App, TFile } from 'obsidian';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../shared-ui/hover-card';
import { cn } from '@/ui/react/lib/utils';
import { isUrl, detectPreviewFileType, getFileDisplayName } from '@/core/document/helper/FileTypeUtils';
import { ChatResourceRef } from '@/service/chat/types';
import { ResourceKind } from '@/core/document/types';

export interface ResourcePreviewHoverProps {
	/**
	 * Resource reference to preview (preferred)
	 */
	resource?: ChatResourceRef;
	/**
	 * File path as alternative input (for backward compatibility)
	 */
	filePath?: string;
	/**
	 * File type for determining preview strategy (only used with filePath)
	 */
	fileType?: 'image' | 'markdown' | 'pdf' | 'file';
	/**
	 * App instance
	 */
	app: App;
	/**
	 * Children to wrap with hover trigger
	 */
	children: React.ReactNode;
	/**
	 * Additional className for preview content
	 */
	previewClassName?: string;
	/**
	 * Whether to show preview (default: true)
	 */
	enabled?: boolean;
}

/**
 * Universal resource preview hover component
 * Supports preview for all resource kinds (images, markdown, PDF, URLs, etc.)
 * Can accept either a ChatResourceRef or a filePath for backward compatibility
 */
export const ResourcePreviewHover: React.FC<ResourcePreviewHoverProps> = ({
	resource,
	filePath,
	fileType,
	app,
	children,
	previewClassName,
	enabled = true,
}) => {
	const [previewContent, setPreviewContent] = useState<string | null>(null);
	const [isImagePreview, setIsImagePreview] = useState(false);
	const [isPdfPreview, setIsPdfPreview] = useState(false);
	const [isHovered, setIsHovered] = useState(false);
	const [alignOffset, setAlignOffset] = useState<number>(0);
	const blobUrlRef = useRef<string | null>(null);
	const triggerRef = useRef<HTMLElement | null>(null);

	// Determine source and resource kind
	const source = resource?.source || filePath || '';
	const resourceKind: ResourceKind | undefined = resource?.kind;
	const isUrlResource = isUrl(source);

	// Detect file type from extension if not provided
	const detectedFileType = fileType || (source ? detectPreviewFileType(source) : 'file');

	// Determine if this resource should show image preview
	const shouldShowImagePreview = (): boolean => {
		if (resourceKind) {
			return resourceKind === 'image';
		}
		return detectedFileType === 'image';
	};

	// Determine if this resource should show PDF preview
	const shouldShowPdfPreview = (): boolean => {
		if (resourceKind) {
			return resourceKind === 'pdf';
		}
		return detectedFileType === 'pdf';
	};

	// Calculate alignOffset when hovered and it's an image or PDF
	useEffect(() => {
		if (!enabled || !isHovered || (!isImagePreview && !isPdfPreview) || !triggerRef.current) {
			return;
		}
		const triggerHeight = triggerRef.current.offsetHeight;
		setAlignOffset(triggerHeight);
	}, [enabled, isHovered, isImagePreview, isPdfPreview]);

	// Load preview content when hovered
	useEffect(() => {
		if (!enabled || !isHovered || !source) {
			// Cleanup blob URL when hover ends
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
			setPreviewContent(null);
			setIsImagePreview(false);
			setIsPdfPreview(false);
			return;
		}

		const loadPreview = async () => {
			try {
				// Handle URL resources
				if (isUrlResource) {
					if (shouldShowImagePreview()) {
						setPreviewContent(source);
						setIsImagePreview(true);
						setIsPdfPreview(false);
					} else if (shouldShowPdfPreview()) {
						setPreviewContent(source);
						setIsImagePreview(false);
						setIsPdfPreview(true);
					} else {
						// For URL non-images/non-PDFs, show file name
						setPreviewContent(getFileDisplayName(source));
						setIsImagePreview(false);
						setIsPdfPreview(false);
					}
					return;
				}

				// Handle file path resources
				const normalizedPath = source.startsWith('/') ? source.slice(1) : source;
				const file = app.vault.getAbstractFileByPath(normalizedPath);
				if (!(file instanceof TFile)) {
					setPreviewContent(null);
					setIsImagePreview(false);
					setIsPdfPreview(false);
					return;
				}

				if (shouldShowImagePreview()) {
					// For images, create a blob URL for preview
					const imageData = await app.vault.readBinary(file);
					const blob = new Blob([imageData], {
						type: file.extension === 'svg' ? 'image/svg+xml' : undefined
					});
					const url = URL.createObjectURL(blob);
					blobUrlRef.current = url;
					setPreviewContent(url);
					setIsImagePreview(true);
					setIsPdfPreview(false);
				} else if (shouldShowPdfPreview()) {
					// For PDFs, use Obsidian's resource path for preview
					const resourcePath = app.vault.getResourcePath(file);
					setPreviewContent(resourcePath);
					setIsImagePreview(false);
					setIsPdfPreview(true);
				} else {
					// For all other files, try to read as text or show file name
					try {
						const content = await app.vault.read(file);
						const lines = content.split('\n').slice(0, 10).join('\n');
						setPreviewContent(lines || '(Empty file)');
						setIsImagePreview(false);
						setIsPdfPreview(false);
					} catch (readError) {
						// If reading as text fails, show file name
						setPreviewContent(getFileDisplayName(file.name));
						setIsImagePreview(false);
						setIsPdfPreview(false);
					}
				}
			} catch (error) {
				setPreviewContent(null);
				setIsImagePreview(false);
				setIsPdfPreview(false);
			}
		};

		loadPreview();

		// Cleanup blob URL when component unmounts
		return () => {
			if (blobUrlRef.current) {
				URL.revokeObjectURL(blobUrlRef.current);
				blobUrlRef.current = null;
			}
		};
	}, [source, resourceKind, isUrlResource, app, enabled, isHovered, detectedFileType]);

	if (!enabled || !source) {
		return <>{children}</>;
	}

	return (
		<HoverCard 
			openDelay={300} 
			closeDelay={200}
			onOpenChange={(open) => setIsHovered(open)}
		>
			<div
				ref={(el) => {
					triggerRef.current = el;
				}}
				className="pktw-inline-block"
			>
				<HoverCardTrigger asChild>
					{children}
				</HoverCardTrigger>
			</div>
			{previewContent && (
				<HoverCardContent
					className={cn(
						'pktw-bg-white pktw-shadow-lg pktw-border pktw-border-border',
						isPdfPreview ? 'pktw-w-[850px] pktw-max-w-[850px]' : 'pktw-w-auto pktw-max-w-sm',
						isImagePreview || isPdfPreview ? 'pktw-p-2' : 'pktw-p-3',
						previewClassName
					)}
					side="left"
					align="start"
					sideOffset={0}
					alignOffset={0}
					collisionPadding={16}
					avoidCollisions={true}
					onPointerDownOutside={(e) => e.preventDefault()}
				>
					{isImagePreview ? (
						<img
							src={previewContent}
							alt={source.split('/').pop() || 'Preview'}
							className="pktw-max-w-full pktw-max-h-[300px] pktw-object-contain pktw-rounded"
						/>
					) : isPdfPreview ? (
						<iframe
							src={previewContent}
							className="pktw-w-full pktw-max-w-full pktw-h-[700px] pktw-border-0 pktw-rounded"
							title="PDF Preview"
						/>
					) : (
						<pre className="pktw-text-xs pktw-whitespace-pre-wrap pktw-font-mono pktw-max-h-[200px] pktw-overflow-y-auto">
							{previewContent}
						</pre>
					)}
				</HoverCardContent>
			)}
		</HoverCard>
	);
};

// Export FilePreviewHover as an alias for backward compatibility
export const FilePreviewHover: React.FC<Omit<ResourcePreviewHoverProps, 'resource'> & { filePath: string }> = (props) => {
	return <ResourcePreviewHover {...props} />;
};
