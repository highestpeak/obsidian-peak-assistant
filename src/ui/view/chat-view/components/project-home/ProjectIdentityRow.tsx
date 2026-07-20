import React from 'react';
import { Folder, SquarePen } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import type { ChatProject } from '@/service/chat/types';

interface ProjectIdentityRowProps {
	project: ChatProject;
	onNewConversation: () => void;
	/** Rendered inside the copy column, beneath the project name. */
	description?: React.ReactNode;
	/** When the description editor is open the hero switches to top alignment. */
	isEditing?: boolean;
}

/**
 * Project hero (chat-studio §9 / PROJ-01, audit P3). Three-column grid:
 *   [34px accent icon] [copy: PROJECT eyebrow + name + description] [actions].
 * The primary "New conversation" action is a solid-accent CTA (audit P1).
 */
export const ProjectIdentityRow: React.FC<ProjectIdentityRowProps> = ({
	project,
	onNewConversation,
	description,
	isEditing = false,
}) => {
	const strings = useChatStudioStrings().projectHome;
	return (
		<div className={`pkchat-projhero${isEditing ? ' pkchat-projhero--editing' : ''}`}>
			<span className="pkchat-projhero__icon" aria-hidden>
				<Folder />
			</span>
			<div className="pkchat-projhero__copy">
				<span className="pkchat-projhero__eyebrow">{strings.eyebrow}</span>
				<span className="pkchat-projhero__name">{project.meta.name}</span>
				{description}
			</div>
			<div className="pkchat-projhero__actions">
				<Button
					variant="primary"
					className="pkchat-projhero__action"
					onClick={onNewConversation}
					aria-label={strings.newConversationLabel}
				>
					<SquarePen />
					<span>{strings.newConversationLabel}</span>
				</Button>
			</div>
		</div>
	);
};
