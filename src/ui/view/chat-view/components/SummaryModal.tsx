import React, { useEffect } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../store/chatViewStore';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogClose,
} from '@/ui/component/shared-ui/dialog';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { X } from 'lucide-react';

/**
 * Modal for displaying conversation summary
 */
export const SummaryModal: React.FC = () => {
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const showSummaryModal = useChatViewStore((state) => state.showSummaryModal);
	const setShowSummaryModal = useChatViewStore((state) => state.setShowSummaryModal);

	const summary = activeConversation?.context?.shortSummary;

	// Close modal when conversation changes
	useEffect(() => {
		setShowSummaryModal(false);
	}, [activeConversation?.meta.id, setShowSummaryModal]);

	if (!summary) return null;

	return (
		<Dialog open={showSummaryModal} onOpenChange={setShowSummaryModal}>
			<DialogContent className="pktw-max-w-2xl">
				<DialogHeader>
					<div className="pktw-flex pktw-items-center pktw-justify-between">
						<DialogTitle>Conversation Summary</DialogTitle>
						<DialogClose asChild>
							<IconButton
								size="lg"
								onClick={() => setShowSummaryModal(false)}
							>
								<X />
							</IconButton>
						</DialogClose>
					</div>
				</DialogHeader>
				<div className="pktw-whitespace-pre-wrap pktw-text-sm pktw-text-foreground">
					{summary}
				</div>
			</DialogContent>
		</Dialog>
	);
};

