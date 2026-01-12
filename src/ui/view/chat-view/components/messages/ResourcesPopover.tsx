import React, { useMemo } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/component/shared-ui/hover-card';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { Button } from '@/ui/component/shared-ui/button';
import { LibraryBig, ExternalLink } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { EventBus, OpenLinkEvent } from '@/core/eventBus';
import { App } from 'obsidian';
import { FileType, getFileIcon } from '@/ui/view/shared/file-utils';
import { FilePreviewHover } from '@/ui/component/mine/resource-preview-hover';
import { detectPreviewFileType, getFileTypeFromResourceKind } from '@/core/document/helper/FileTypeUtils';

/**
 * Popover component for displaying conversation resources as a list
 */
export const ResourcesPopover: React.FC = () => {
	const conversation = useProjectStore((state) => state.activeConversation);
	const app = (window as any).app as App;
	const eventBus = EventBus.getInstance(app);

	// Use conversation ID and message count as dependencies, but get latest values from store inside useMemo
	// to avoid stale closure issues while preventing circular reference problems.
	const conversationId = conversation?.meta.id;
	const messageCount = conversation?.messages?.length ?? 0;

	const resources = useMemo(() => {
		// Get latest values from store to avoid stale closure
		const latestConversation = useProjectStore.getState().activeConversation;
		if (!latestConversation) return [];

		const resourceMap = new Map<string, { type: FileType; kind?: string; summaryNotePath?: string }>();

		for (const message of latestConversation.messages) {
			if (message.resources && message.resources.length > 0) {
				for (const resource of message.resources) {
					if (!resourceMap.has(resource.source)) {
						const type = getFileTypeFromResourceKind(resource.kind, resource.source);
						resourceMap.set(resource.source, {
							type,
							kind: resource.kind,
							summaryNotePath: resource.summaryNotePath
						});
					}
				}
			}
		}

		return Array.from(resourceMap.entries()).map(([path, data]) => ({
			path,
			type: data.type,
			kind: data.kind,
			summaryNotePath: data.summaryNotePath,
		}));
	}, [conversationId, messageCount]);

	const handleResourceClick = (path: string) => {
		if (!path) return;
		const cleaned = path.replace(/^\[\[|\]\]$/g, '');
		const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
		eventBus.dispatch(new OpenLinkEvent({ path: normalized }));
		// Don't close popover when clicking a resource, let user continue viewing
		// The auto-close will be handled by mouse leave event
	};

	if (!conversation) {
		return null;
	}

	return (
		<HoverCard openDelay={200} closeDelay={300}>
			<HoverCardTrigger asChild>
				<IconButton
					size="lg"
					title="View conversation resources"
					className="hover:pktw-bg-gray-200"
				>
					<LibraryBig className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground group-hover:pktw-text-black" />
				</IconButton>
			</HoverCardTrigger>
			<HoverCardContent
				className="pktw-w-[320px] pktw-p-0 pktw-bg-white pktw-shadow-lg"
				align="end"
				side="bottom"
				sideOffset={8}
				collisionPadding={16}
			>
				<div className="pktw-flex pktw-flex-col pktw-max-h-[400px] pktw-overflow-y-auto">
					<div className="pktw-px-3 pktw-py-2 pktw-border-b pktw-border-border">
						<span className="pktw-text-lg pktw-font-semibold">
							Resources
						</span>
					</div>
					{resources.length === 0 ? (
						<div className="pktw-p-4 pktw-text-center pktw-text-sm">
							No resources available
						</div>
					) : (
						<div className="pktw-flex pktw-flex-col">
							{resources.map((resource) => (
								<ResourceItem
									key={resource.path}
									path={resource.path}
									type={resource.type}
									kind={resource.kind}
									summaryNotePath={resource.summaryNotePath}
									onClick={() => handleResourceClick(resource.path)}
								/>
							))}
						</div>
					)}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
};

interface ResourceItemProps {
	path: string;
	type: FileType;
	kind?: string;
	summaryNotePath?: string;
	onClick: () => void;
}

const ResourceItem: React.FC<ResourceItemProps> = ({ path, type, kind, summaryNotePath, onClick }) => {
	const app = (window as any).app as App;
	const eventBus = EventBus.getInstance(app);
	const fileName = path.split('/').pop() || path;

	// Normalize path (remove [[ ]] and leading /)
	const normalizedPath = useMemo(() => {
		const cleaned = path.replace(/^\[\[|\]\]$/g, '');
		return cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
	}, [path]);

	// Map FileType to preview fileType
	// Use resource.kind if available, otherwise use detectPreviewFileType
	const previewFileType = useMemo(() => {
		// If we have resource.kind, use it directly
		if (kind === 'image') return 'image' as const;
		if (kind === 'pdf') return 'pdf' as const;
		// Otherwise, use detectPreviewFileType to identify from path
		const detected = detectPreviewFileType(normalizedPath);
		// Only return preview types (image, pdf, markdown), not 'file'
		if (detected === 'file') {
			return undefined;
		}
		return detected;
	}, [kind, normalizedPath]);


	const handleOpenSummary = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (summaryNotePath) {
			const normalized = summaryNotePath.startsWith('/') ? summaryNotePath.slice(1) : summaryNotePath;
			eventBus.dispatch(new OpenLinkEvent({ path: normalized }));
		}
	};

	const itemContent = (
		<div
			className={cn(
				'pktw-flex pktw-items-center pktw-gap-3 pktw-p-3 pktw-border-b pktw-border-border last:pktw-border-b-0',
				'pktw-transition-colors hover:pktw-bg-muted pktw-cursor-pointer'
			)}
			onClick={onClick}
		>
			<div className="pktw-flex-shrink-0">{getFileIcon(type)}</div>
			<div className="pktw-flex-1 pktw-min-w-0">
				<div className="pktw-text-sm pktw-font-medium pktw-truncate">
					{fileName}
				</div>
				{/* <div className="pktw-text-xs pktw-truncate">
					{path}
				</div> */}
			</div>
			{summaryNotePath && (
				<Button
					variant="ghost"
					size="sm"
					onClick={handleOpenSummary}
					className="pktw-shrink-0 pktw-h-6 pktw-w-6 pktw-p-0"
					title="Open Resource Summary"
				>
					<ExternalLink className="pktw-w-3.5 pktw-h-3.5" />
				</Button>
			)}
		</div>
	);

	// Wrap with FilePreviewHover if preview is supported
	if (previewFileType) {
		return (
			<FilePreviewHover
				filePath={normalizedPath}
				fileType={previewFileType}
				app={app}
			>
				{itemContent}
			</FilePreviewHover>
		);
	}

	return itemContent;
};

