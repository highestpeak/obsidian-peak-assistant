import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface ProjectSummaryProps {
	summaryText?: string;
	summaryExpanded: boolean;
	onSummaryExpandedChange: (expanded: boolean) => void;
}

/**
 * Project summary collapsible component
 */
export const ProjectSummary: React.FC<ProjectSummaryProps> = ({
	summaryText,
	summaryExpanded,
	onSummaryExpandedChange,
}) => {
	if (!summaryText) {
		return null;
	}

	// Place here to make Tabs seem more balanced. Make ui more balanced. Choose Conv Tabs because it has more content.
	return (
		<div className="pktw-mb-6 pktw-border pktw-rounded-lg pktw-bg-secondary pktw-shadow-md pktw-overflow-hidden">
			<div
				className="pktw-flex pktw-items-center pktw-justify-between pktw-p-4 pktw-cursor-pointer hover:pktw-bg-muted/50 pktw-transition-colors"
				onClick={() => onSummaryExpandedChange(!summaryExpanded)}
			>
				<h3 className="pktw-text-base pktw-font-semibold pktw-text-foreground pktw-m-0">Project Summary</h3>
				<div className="pktw-transition-transform pktw-duration-200 pktw-ease-in-out">
					{summaryExpanded ? (
						<ChevronDown className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground" />
					) : (
						<ChevronRight className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground" />
					)}
				</div>
			</div>
			<div
				className={`pktw-transition-all pktw-duration-300 pktw-ease-in-out pktw-overflow-hidden ${summaryExpanded
						? 'pktw-max-h-96 pktw-opacity-100'
						: 'pktw-max-h-0 pktw-opacity-0'
					}`}
			>
				<div className="pktw-px-4 pktw-pb-4 pktw-text-sm pktw-text-foreground/90 pktw-leading-relaxed">
					{summaryText}
				</div>
			</div>
		</div>
	);
};