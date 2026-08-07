import React, { useState } from 'react';
import { FileText, Map, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { ConnectedSection } from './ConnectedSection';
import { DiscoveredSection } from './DiscoveredSection';
import { AIGraphSection } from './AIGraphSection';
import { useVaultSearchStore } from '../../store';
import { renderSnippetContent } from '../snippet/renderSnippetHighlights';
import { CommandCenterPinControl } from './CommandCenterPinControl';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

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
	keyTipKey: string;
	defaultOpen?: boolean;
	children: React.ReactNode;
}> = ({ title, keyTipKey, defaultOpen = true, children }) => {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="pktw-border-b pktw-border-pk-border">
			<Button
				variant="unstyled"
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				data-peak-keytip-key={keyTipKey}
				data-peak-keytip-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
				className="pktw-flex pktw-w-full pktw-items-center pktw-justify-start pktw-gap-1.5 pktw-rounded-none pktw-px-4 pktw-py-2 hover:pktw-bg-pk-surface-raised"
			>
				{open
					? <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-muted" />
					: <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-muted" />}
				<span className="pktw-text-xs pktw-font-medium pktw-text-pk-foreground-muted pktw-uppercase pktw-tracking-wide">
					{title}
				</span>
			</Button>
			{open && <div className="pktw-px-4 pktw-pb-3">{children}</div>}
		</div>
	);
};

export interface InspectorSidePanelProps {
	currentPath: string | null;
	searchQuery: string;
	onClose: () => void;
	/** Search owns an optional query snippet; list-first external hosts disable it. */
	showSearchSnippet?: boolean;
	/** Open the target doc in the vault (Search modal stays open). */
	onOpenDocument: (notePath: string) => void;
	/** Re-target the inspector panel to another doc without opening it. */
	onInspectInPanel: (notePath: string) => void;
	/** Hand the selected result to File Atlas, the canonical local-graph owner. */
	onOpenFileAtlas: (notePath: string) => void;
	/** Search surfaces explicitly opt into Command Center curation. */
	showCommandCenterPin?: boolean;
}

/**
 * Side-panel inspector shown next to search results (340px).
 * Contains search-owned Connected / Discovered / AI Graph sections and a
 * handoff to File Atlas for document hubs and neighborhood graphs.
 */
export const InspectorSidePanel: React.FC<InspectorSidePanelProps> = ({
	currentPath, searchQuery, onClose, showSearchSnippet = true, onOpenDocument, onInspectInPanel,
	onOpenFileAtlas, showCommandCenterPin = false,
}) => {
	const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
	if (!currentPath) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-h-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-pk-foreground-muted pktw-p-4">
				Select a note to inspect
			</div>
		);
	}

	const title = currentPath.split('/').pop()?.replace(/\.md$/, '') ?? currentPath;

	return (
		<div className="pktw-relative pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
			<div ref={setPortalContainer} className="pk-inspector-local-portal" />
			{/* Sticky header */}
			<div className="pktw-sticky pktw-top-0 pktw-z-10 pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-2.5 pktw-bg-pk-background pktw-border-b pktw-border-pk-border">
				<FileText className="pktw-w-4 pktw-h-4 pktw-text-pk-accent" />
				<span
					className="pktw-flex-1 pktw-text-sm pktw-font-medium pktw-text-pk-foreground pktw-truncate"
					title={currentPath}
				>
					{title}
				</span>
				{showCommandCenterPin ? <CommandCenterPinControl path={currentPath} portalContainer={portalContainer} /> : null}
				<Button
					variant="unstyled"
					size="icon"
					geometry="toolbar-icon"
					title="Open in File Atlas"
					aria-label="Open in File Atlas"
					className="pk-icon-btn pk-inspector-icon-button pktw-shadow-none"
					onClick={() => onOpenFileAtlas(currentPath)}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.search.inspector.openAtlas}
					data-peak-keytip-label="Open in File Atlas"
				>
					<Map className="pktw-h-4 pktw-w-4" />
				</Button>
				<Button
					variant="unstyled"
					size="icon"
					geometry="toolbar-icon"
					title="Close inspector"
					aria-label="Close inspector"
					className="pk-icon-btn pk-inspector-icon-button pktw-shadow-none"
					onClick={onClose}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.search.inspector.close}
					data-peak-keytip-label="Close inspector"
				>
					<X className="pktw-h-4 pktw-w-4" />
				</Button>
			</div>

			{/* Scrollable content with collapsible sections */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto">
				{/* Snippet block — mirrors the inline snippet the List view shows
				    per row, so Tree/Graph users don't lose that context. Hidden
				    when the current path isn't in the result set (e.g. inspecting
				    a hub target the query didn't hit). */}
				{showSearchSnippet && <InspectorSnippetBlock currentPath={currentPath} />}
				<CollapsibleSection
					title="Connected"
					keyTipKey={PEAK_CONTROL_KEY_TIP_KEYS.search.inspector.connected}
				>
					<ConnectedSection
						currentPath={currentPath}
						searchQuery={searchQuery}
						onOpenDocument={onOpenDocument}
						onInspectInPanel={onInspectInPanel}
					/>
				</CollapsibleSection>
				<CollapsibleSection
					title="Discovered"
					keyTipKey={PEAK_CONTROL_KEY_TIP_KEYS.search.inspector.discovered}
				>
					<DiscoveredSection
						currentPath={currentPath}
						searchQuery={searchQuery}
						onOpenDocument={onOpenDocument}
						onInspectInPanel={onInspectInPanel}
					/>
				</CollapsibleSection>
				<CollapsibleSection
					title="AI Graph"
					keyTipKey={PEAK_CONTROL_KEY_TIP_KEYS.search.inspector.aiGraph}
				>
					<AIGraphSection currentPath={currentPath} searchQuery={searchQuery} />
				</CollapsibleSection>
			</div>
		</div>
	);
};
