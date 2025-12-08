import React from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../store/chatViewStore';
import { getFileTypeFromPath, FileType } from '@/ui/view/shared/file-utils';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogClose,
} from '@/ui/component/shared-ui/dialog';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { X, FileText, Image, File } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { EventBus, OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { App } from 'obsidian';

/**
 * Modal for displaying conversation resources
 */
export const ResourcesModal: React.FC = () => {
	const conversation = useProjectStore((state) => state.activeConversation);
	const showResourcesModal = useChatViewStore((state) => state.showResourcesModal);
	const setShowResourcesModal = useChatViewStore((state) => state.setShowResourcesModal);
	const app = (window as any).app as App;
	const eventBus = EventBus.getInstance(app);

	const resources = React.useMemo(() => {
		if (!conversation) return [];
		
		const resourceMap = new Map<string, FileType>();
		
		for (const message of conversation.messages) {
			if (message.attachments && message.attachments.length > 0) {
				for (const attachmentPath of message.attachments) {
					if (!resourceMap.has(attachmentPath)) {
						const type = getFileTypeFromPath(attachmentPath);
						resourceMap.set(attachmentPath, type);
					}
				}
			}
		}
		
		return Array.from(resourceMap.entries()).map(([path, type]) => ({
			path,
			type,
		}));
	}, [conversation]);

	if (!conversation) return null;

	const pdfs = resources.filter((r) => r.type === 'pdf');
	const images = resources.filter((r) => r.type === 'image');
	const files = resources.filter((r) => r.type === 'file');

	const handleResourceClick = (path: string) => {
		if (!path) return;
		const cleaned = path.replace(/^\[\[|\]\]$/g, '');
		const normalized = cleaned.startsWith('/') ? cleaned.slice(1) : cleaned;
		eventBus.dispatch(new OpenLinkEvent({ path: normalized }));
	};

	return (
		<Dialog open={showResourcesModal} onOpenChange={setShowResourcesModal}>
			<DialogContent className="pktw-max-w-2xl pktw-max-h-[80vh] pktw-overflow-y-auto">
				<DialogHeader>
					<div className="pktw-flex pktw-items-center pktw-justify-between">
						<DialogTitle>Conversation Resources</DialogTitle>
						<DialogClose asChild>
							<IconButton
								size="lg"
								onClick={() => setShowResourcesModal(false)}
							>
								<X />
							</IconButton>
						</DialogClose>
					</div>
				</DialogHeader>
				<div className="pktw-space-y-4">
					{resources.length === 0 ? (
						<div className="pktw-text-sm pktw-text-muted-foreground pktw-text-center pktw-py-8">
							No resources attached to this conversation.
						</div>
					) : (
						<>
							{/* PDF Files */}
							{pdfs.length > 0 && (
								<div>
									<h4 className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-mb-2">
										PDF Files ({pdfs.length})
									</h4>
									<div className="pktw-space-y-2">
										{pdfs.map((resource) => (
											<ResourceItem
												key={resource.path}
												path={resource.path}
												type={resource.type}
												onClick={() => handleResourceClick(resource.path)}
											/>
										))}
									</div>
								</div>
							)}

							{/* Images */}
							{images.length > 0 && (
								<div>
									<h4 className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-mb-2">
										Images ({images.length})
									</h4>
									<div className="pktw-space-y-2">
										{images.map((resource) => (
											<ResourceItem
												key={resource.path}
												path={resource.path}
												type={resource.type}
												onClick={() => handleResourceClick(resource.path)}
											/>
										))}
									</div>
								</div>
							)}

							{/* Other Files */}
							{files.length > 0 && (
								<div>
									<h4 className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-mb-2">
										Other Files ({files.length})
									</h4>
									<div className="pktw-space-y-2">
										{files.map((resource) => (
											<ResourceItem
												key={resource.path}
												path={resource.path}
												type={resource.type}
												onClick={() => handleResourceClick(resource.path)}
											/>
										))}
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};

interface ResourceItemProps {
	path: string;
	type: FileType;
	onClick: () => void;
}

const ResourceItem: React.FC<ResourceItemProps> = ({ path, type, onClick }) => {
	const fileName = path.split('/').pop() || path;
	
	const getIcon = () => {
		switch (type) {
			case 'pdf':
				return <FileText className="pktw-w-4 pktw-h-4" />;
			case 'image':
				return <Image className="pktw-w-4 pktw-h-4" />;
			default:
				return <File className="pktw-w-4 pktw-h-4" />;
		}
	};

	return (
		<div
			className={cn(
				'pktw-flex pktw-items-center pktw-gap-3 pktw-p-2 pktw-rounded pktw-cursor-pointer',
				'pktw-transition-colors hover:pktw-bg-muted'
			)}
			onClick={onClick}
		>
			<div className="pktw-text-muted-foreground">{getIcon()}</div>
			<div className="pktw-flex-1 pktw-min-w-0">
				<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-truncate">
					{fileName}
				</div>
				<div className="pktw-text-xs pktw-text-muted-foreground pktw-truncate">
					{path}
				</div>
			</div>
		</div>
	);
};

