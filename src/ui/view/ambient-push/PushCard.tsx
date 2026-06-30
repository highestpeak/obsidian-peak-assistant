import React from 'react';
import { FileText, Link, ExternalLink, X, Sparkles } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import type { AmbientPushItem } from '@/core/types/ambient';

interface PushCardProps {
	item: AmbientPushItem;
	sourceFilePath: string;
}

export const PushCard: React.FC<PushCardProps> = ({ item, sourceFilePath }) => {
	// T8: persistence (recordAction) flows through the app-owned Ambient
	// runtime. T11N: open + editor-insert flow through the new
	// `vaultNavigation` / `editorCommands` ports instead of raw
	// `app.workspace.{openLinkText,getActiveViewOfType}` calls.
	const { vaultNavigation, editorCommands, ambientRuntime } = useServiceContext();
	const title = item.title?.trim() || item.filePath.replace(/^.*\//, '').replace(/\.md$/, '');
	const excerpt = item.excerpt?.trim() || title;
	const explanation = item.explanation?.trim() || 'Related content';

	async function handleOpen() {
		await vaultNavigation.openLink(item.filePath, { newLeaf: true });
		void ambientRuntime?.recordAction(sourceFilePath, item.filePath, 'opened');
	}

	function handleInsertLink() {
		const inserted = editorCommands.insertWikilinkAtCursor(title);
		if (!inserted) return;
		void ambientRuntime?.recordAction(sourceFilePath, item.filePath, 'linked');
	}

	function handleDismiss() {
		useAmbientPushStore.getState().dismissItem(item.filePath);
		void ambientRuntime?.recordAction(sourceFilePath, item.filePath, 'dismissed');
	}

	return (
		<div className="pktw-group pktw-rounded-md pktw-border pktw-p-3 pktw-transition-colors hover:pktw-bg-[var(--pk-state-hover)]"
			style={{ borderColor: 'var(--pk-border)' }}>
			{/* Title row */}
			<div className="pktw-flex pktw-items-center pktw-gap-1.5">
				<FileText className="pktw-h-3.5 pktw-w-3.5 pktw-shrink-0" style={{ color: 'var(--pk-text-secondary)' }} />
				<span
					className="pktw-flex-1 pktw-cursor-pointer pktw-truncate pktw-text-sm pktw-font-medium"
					style={{ color: 'var(--pk-text-primary)' }}
					onClick={handleOpen}
				>
					{title}
				</span>
			</div>

			{/* Excerpt */}
			<span
				className="pktw-mt-1 pktw-line-clamp-2 pktw-block pktw-text-xs"
				style={{ color: 'var(--pk-text-secondary)' }}
			>
				{excerpt.length > 100 ? `${excerpt.slice(0, 100)}...` : excerpt}
			</span>

			{/* Explanation badge — line-clamp keeps tall LLM explanations
				 from blowing up the card. Full text is available via the
				 native tooltip (the 500-char data-layer truncation was
				 removed in T11Y-5). */}
			<span
				className="pktw-mt-1.5 pktw-inline-flex pktw-items-start pktw-gap-1 pktw-rounded pktw-px-1.5 pktw-py-0.5 pktw-text-xs pktw-line-clamp-3"
				title={explanation}
				style={{
					color: item.explanationType === 'llm' ? 'var(--pk-text-primary)' : 'var(--pk-accent-text)',
					backgroundColor: item.explanationType === 'llm'
						? 'color-mix(in srgb, var(--pk-accent) 12%, transparent)'
						: 'color-mix(in srgb, var(--pk-accent-text) 12%, transparent)',
				}}
			>
				{item.explanationType === 'llm' && (
					<Sparkles className="pktw-h-3 pktw-w-3 pktw-shrink-0 pktw-mt-0.5" />
				)}
				{explanation}
			</span>

			{/* Action buttons — hover-reveal */}
			<div className="pktw-mt-2 pktw-flex pktw-gap-1 pktw-opacity-0 pktw-transition-opacity group-hover:pktw-opacity-100">
				<Button variant="ghost" size="xs" onClick={handleInsertLink} title="Insert link">
					<Link className="pktw-h-3 pktw-w-3" />
				</Button>
				<Button variant="ghost" size="xs" onClick={handleOpen} title="Open in new tab">
					<ExternalLink className="pktw-h-3 pktw-w-3" />
				</Button>
				<Button variant="ghost" size="xs" onClick={handleDismiss} title="Dismiss">
					<X className="pktw-h-3 pktw-w-3" />
				</Button>
			</div>
		</div>
	);
};
