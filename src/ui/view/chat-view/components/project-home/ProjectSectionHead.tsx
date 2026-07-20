import React from 'react';
import { Button } from '@/ui/components/primitives';

interface ProjectSectionHeadProps {
	title: string;
	desc: string;
	/** Optional right-aligned secondary action (icon + label). */
	action?: {
		label: string;
		icon: React.ReactNode;
		onClick: () => void;
	};
}

/**
 * Shared project-tab section head (chat-studio §9, audit P7 / new-3): title +
 * one-line description on the left, an optional secondary action on the right.
 */
export const ProjectSectionHead: React.FC<ProjectSectionHeadProps> = ({ title, desc, action }) => (
	<div className="pkchat-projsection__head">
		<div>
			<span className="pkchat-projsection__title">{title}</span>
			<span className="pkchat-projsection__desc">{desc}</span>
		</div>
		{action && (
			<Button
				variant="ghost"
				className="pkchat-projsection__action"
				onClick={action.onClick}
				aria-label={action.label}
			>
				{action.icon}
				<span>{action.label}</span>
			</Button>
		)}
	</div>
);
