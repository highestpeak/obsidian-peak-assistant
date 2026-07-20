import React, { useState } from 'react';
import { FileText, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { ConnectedSection } from './ConnectedSection';
import { DiscoveredSection } from './DiscoveredSection';
import { AIGraphSection } from './AIGraphSection';
import { HubSection } from './HubSection';
import { useVaultSearchStore } from '../../store';
import { renderSnippetContent } from '../snippet/renderSnippetHighlights';

/**
 * Renders the current file's search-hit snippet at the top of the inspector.
 * Only shown in Tree view — List rows already render the snippet inline, so
 * showing it again in the inspector would be duplication; Graph view users
 * see labels/tooltips instead. Reads the corresponding `SearchResultItem`
 * from the vault-search store (matched by path). Returns `null` when there's
 * no matching result (e.g. inspecting a hub target the query didn't hit).
 */
const InspectorSnippetBlock: React.FC<{ currentPath: string }> = ({ currentPath }) => {
	const resultView = useVaultSearchStore((s) => s.resultView);
	const result = useVaultSearchStore((s) => s.lastSearchResults.find((r) => r.path === currentPath) ?? null);
	if (resultView !== 'tree') return null;
	if (!result?.highlight?.text) return null;
	return (
		<div className="pktw-px-4 pktw-py-2.5 pktw-border-b pktw-border-pk-border pktw-bg-pk-surface-sunken/40">
			<div className="pktw-text-pk-md pktw-leading-relaxed pktw-text-pk-foreground pktw-line-clamp-4">
				{renderSnippetContent(result.highlight)}
			</div>
		</div>
	);
};

/** Collapsible section wrapper used by InspectorSidePanel. */
const CollapsibleSection: React.FC<{
	title: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="pktw-border-b pktw-border-pk-border">
			<div
				onClick={() => setOpen(!open)}
				className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-4 pktw-py-2 pktw-cursor-pointer hover:pktw-bg-pk-surface-raised"
			>
				{open
					? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-muted" />
					: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-muted" />}
				<span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted pktw-uppercase pktw-tracking-wide">
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
	/** Open the target doc in the vault (Search modal stays open). */
	onOpenDocument: (notePath: string) => void;
	/** Re-target the inspector panel to another doc without opening it. */
	onInspectInPanel: (notePath: string) => void;
}

/**
 * Side-panel inspector shown next to search results (340px).
 * Contains collapsible Hub / Connected / Discovered / AI Graph sections.
 */
export const InspectorSidePanel: React.FC<InspectorSidePanelProps> = ({
	currentPath, searchQuery, onClose, onOpenDocument, onInspectInPanel,
}) => {
	if (!currentPath) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-h-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-pk-foreground-muted pktw-p-4">
				Select a note to inspect
			</div>
		);
	}

	const title = currentPath.split('/').pop()?.replace(/\.md$/, '') ?? currentPath;

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			{/* Sticky header */}
			<div className="pktw-sticky pktw-top-0 pktw-z-10 pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-2.5 pktw-bg-pk-background pktw-border-b pktw-border-pk-border">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-pk-accent" />
				<span
					className="pktw-flex-1 pktw-text-sm pktw-font-medium pktw-text-pk-foreground pktw-truncate"
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
					<X className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-muted" />
				</Button>
			</div>

			{/* Scrollable content with collapsible sections */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto">
				{/* Snippet block — mirrors the inline snippet the List view shows
				    per row, so Tree/Graph users don't lose that context. Hidden
				    when the current path isn't in the result set (e.g. inspecting
				    a hub target the query didn't hit). */}
				<InspectorSnippetBlock currentPath={currentPath} />
				<CollapsibleSection title="Connected">
					<ConnectedSection
						currentPath={currentPath}
						searchQuery={searchQuery}
						onOpenDocument={onOpenDocument}
						onInspectInPanel={onInspectInPanel}
					/>
				</CollapsibleSection>
				<CollapsibleSection title="Discovered">
					<DiscoveredSection
						currentPath={currentPath}
						searchQuery={searchQuery}
						onOpenDocument={onOpenDocument}
						onInspectInPanel={onInspectInPanel}
					/>
				</CollapsibleSection>
				<CollapsibleSection title="Hubs">
					<HubSection
						currentPath={currentPath}
						onOpenDocument={onOpenDocument}
						onInspectInPanel={onInspectInPanel}
					/>
				</CollapsibleSection>
				<CollapsibleSection title="AI Graph">
					<AIGraphSection currentPath={currentPath} searchQuery={searchQuery} />
				</CollapsibleSection>
			</div>
		</div>
	);
};
