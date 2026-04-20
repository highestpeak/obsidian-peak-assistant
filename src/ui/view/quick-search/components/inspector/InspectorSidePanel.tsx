import React, { useState } from 'react';
import { FileText, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';

/** Collapsible section wrapper used by InspectorSidePanel. */
const CollapsibleSection: React.FC<{
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="pktw-border-b pktw-border-[#e5e7eb]">
			<div
				onClick={() => setOpen(!open)}
				className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-4 pktw-py-2 pktw-cursor-pointer hover:pktw-bg-[#fafafa]"
			>
				{open
					? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
					: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />}
				<span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-uppercase pktw-tracking-wide">
					{title}
				</span>
			</div>
			{open && <div className="pktw-px-4 pktw-pb-3">{children}</div>}
		</div>
	);
};

export interface InspectorSidePanelProps {
	currentPath: string | null;
	searchQuery: string;
	onClose: () => void;
	onNavigate: (notePath: string) => void;
}

/**
 * Side-panel inspector shown next to search results (340px).
 * Contains collapsible Connected / Discovered / AI Graph sections.
 * Section contents are placeholders — real components land in VS-7/9/10.
 */
export const InspectorSidePanel: React.FC<InspectorSidePanelProps> = ({
	currentPath, searchQuery, onClose, onNavigate,
}) => {
	if (!currentPath) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-h-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-[#9ca3af] pktw-p-4">
				Select a note to inspect
			</div>
		);
	}

	const title = currentPath.split('/').pop()?.replace(/\.md$/, '') ?? currentPath;

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Sticky header */}
			<div className="pktw-sticky pktw-top-0 pktw-z-10 pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-2.5 pktw-bg-white pktw-border-b pktw-border-[#e5e7eb]">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
				<span
					className="pktw-flex-1 pktw-text-sm pktw-font-medium pktw-text-[#374151] pktw-truncate"
					title={currentPath}
				>
					{title}
				</span>
				<Button
					variant="ghost"
					size="xs"
					className="pktw-shadow-none !pktw-w-6 !pktw-h-6"
					onClick={onClose}
				>
					<X className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
				</Button>
			</div>

			{/* Scrollable content with collapsible sections */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto">
				<CollapsibleSection title="Connected">
					<span className="pktw-text-xs pktw-text-[#9ca3af]">Loading connections...</span>
				</CollapsibleSection>
				<CollapsibleSection title="Discovered">
					<span className="pktw-text-xs pktw-text-[#9ca3af]">Loading discoveries...</span>
				</CollapsibleSection>
				<CollapsibleSection title="AI Graph" defaultOpen={false}>
					<span className="pktw-text-xs pktw-text-[#9ca3af]">No AI Graph data</span>
				</CollapsibleSection>
			</div>
		</div>
	);
};
