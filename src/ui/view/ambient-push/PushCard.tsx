import React from 'react';
import { MarkdownView } from 'obsidian';
import { FileText, Link, ExternalLink, X, Sparkles } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import type { AmbientPushItem } from '@/service/ambient/types';

interface PushCardProps {
	item: AmbientPushItem;
	sourceFilePath: string;
}

export const PushCard: React.FC<PushCardProps> = ({ item, sourceFilePath }) => {
	const title = item.title?.trim() || item.filePath.replace(/^.*\//, '').replace(/\.md$/, '');
	const excerpt = item.excerpt?.trim() || title;
	const explanation = item.explanation?.trim() || 'Related content';

	async function handleOpen() {
		const app = AppContext.getApp();
		await app.workspace.openLinkText(item.filePath, '', true);
		useAmbientPushStore.getState().recordAction(sourceFilePath, item.filePath, 'opened');
	}

	function handleInsertLink() {
		const app = AppContext.getApp();
		const mdView = app.workspace.getActiveViewOfType(MarkdownView);
		if (!mdView) return;
		const editor = mdView.editor;
		const cursor = editor.getCursor();
		editor.replaceRange(`[[${title}]]`, cursor);
		useAmbientPushStore.getState().recordAction(sourceFilePath, item.filePath, 'linked');
	}

	function handleDismiss() {
		const store = useAmbientPushStore.getState();
		store.dismissItem(item.filePath);
		store.recordAction(sourceFilePath, item.filePath, 'dismissed');
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

			{/* Explanation badge */}
			<span
				className="pktw-mt-1.5 pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded pktw-px-1.5 pktw-py-0.5 pktw-text-xs"
				style={{
					color: item.explanationType === 'llm' ? 'var(--pk-text-primary)' : 'var(--pk-accent-text)',
					backgroundColor: item.explanationType === 'llm'
						? 'color-mix(in srgb, var(--pk-accent) 12%, transparent)'
						: 'color-mix(in srgb, var(--pk-accent-text) 12%, transparent)',
				}}
			>
				{item.explanationType === 'llm' && (
					<Sparkles className="pktw-h-3 pktw-w-3" />
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
