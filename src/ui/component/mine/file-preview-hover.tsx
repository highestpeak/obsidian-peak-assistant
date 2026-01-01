import React, { useState, useEffect, useRef } from 'react';
import { App, TFile } from 'obsidian';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../shared-ui/hover-card';
import { cn } from '@/ui/react/lib/utils';

export interface FilePreviewHoverProps {
    /**
     * File path (normalized, without leading slash)
     */
    filePath: string;
    /**
     * File type for determining preview strategy
     */
    fileType?: 'image' | 'markdown' | 'file';
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
 * Universal file preview hover component
 * Supports image preview and markdown file preview
 */
export const FilePreviewHover: React.FC<FilePreviewHoverProps> = ({
    filePath,
    fileType,
    app,
    children,
    previewClassName,
    enabled = true,
}) => {
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [isImagePreview, setIsImagePreview] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const blobUrlRef = useRef<string | null>(null);

    // Detect file type from extension if not provided
    const detectedFileType = fileType || (() => {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'heif', 'ico'].includes(ext)) {
            return 'image';
        }
        if (ext === 'md') {
            return 'markdown';
        }
        return 'file';
    })();


    // Load preview content when hovered
    useEffect(() => {
        if (!enabled || !isHovered) {
            // Cleanup blob URL when hover ends
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
            setPreviewContent(null);
            setIsImagePreview(false);
            return;
        }

        const loadPreview = async () => {
            try {
                const file = app.vault.getAbstractFileByPath(filePath);
                if (!(file instanceof TFile)) {
                    setPreviewContent(null);
                    setIsImagePreview(false);
                    return;
                }

                if (detectedFileType === 'image') {
                    // For images, create a blob URL for preview
                    const imageData = await app.vault.readBinary(file);
                    const blob = new Blob([imageData], {
                        type: file.extension === 'svg' ? 'image/svg+xml' : undefined
                    });
                    const url = URL.createObjectURL(blob);
                    blobUrlRef.current = url;
                    setPreviewContent(url);
                    setIsImagePreview(true);
                } else if (detectedFileType === 'markdown') {
                    // For markdown files, show first few lines
                    const content = await app.vault.read(file);
                    const lines = content.split('\n').slice(0, 10).join('\n');
                    setPreviewContent(lines || '(Empty file)');
                    setIsImagePreview(false);
                } else {
                    // For other files, don't show preview
                    setPreviewContent(null);
                    setIsImagePreview(false);
                }
            } catch (error) {
                setPreviewContent(null);
                setIsImagePreview(false);
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
    }, [filePath, detectedFileType, app, enabled, isHovered]);

	if (!enabled || (detectedFileType !== 'image' && detectedFileType !== 'markdown')) {
		return <>{children}</>;
	}

	return (
		<HoverCard 
			openDelay={300} 
			closeDelay={200}
			onOpenChange={(open) => setIsHovered(open)}
		>
			<HoverCardTrigger asChild>
				{children}
			</HoverCardTrigger>
                {previewContent && (
                    <HoverCardContent
                        className={cn(
                            'pktw-w-auto pktw-max-w-sm pktw-bg-white pktw-shadow-lg pktw-border pktw-border-border',
                            isImagePreview ? 'pktw-p-2' : 'pktw-p-3',
                            previewClassName
                        )}
                        side="right"
                        align="start"
                        sideOffset={8}
                        collisionPadding={16}
                        avoidCollisions={true}
                        onPointerDownOutside={(e) => e.preventDefault()}
                    >
                        {isImagePreview ? (
                            <img
                                src={previewContent}
                                alt={filePath.split('/').pop() || 'Preview'}
                                className="pktw-max-w-full pktw-max-h-[300px] pktw-object-contain pktw-rounded"
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

