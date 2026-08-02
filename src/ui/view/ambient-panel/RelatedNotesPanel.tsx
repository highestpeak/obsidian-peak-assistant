import React, { useEffect, useState } from 'react';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { SessionContextService } from '@/service/context/SessionContextService';
import type { WorkingTheme } from '@/service/context/types';
import { Bug, FileText, Sparkles } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useDebugTraceCopy } from '@/ui/hooks/useDebugTraceCopy';
import { Button } from '@/ui/component/shared-ui/button';

type RelatedNotesPanelProps = Record<string, never>;

/**
 * Legacy Related Notes projection. New Ambient presentation belongs to
 * Composer Intelligence; this component remains only for compatibility with
 * previously saved workspace leaves and is never mounted as a floating panel.
 */
export const RelatedNotesPanel: React.FC<RelatedNotesPanelProps> = () => {
	const items = useAmbientPushStore((s) => s.items);
	const sourceFilePath = useAmbientPushStore((s) => s.sourceFilePath);
	const [theme, setTheme] = useState<WorkingTheme | null>(null);
	const { debugTracePort, vaultNavigation } = useServiceContext();
	const copyDebugTrace = useDebugTraceCopy();

	useEffect(() => {
		let cancelled = false;
		const refresh = () => {
			try {
				const ctx = SessionContextService.getInstance();
				if (!cancelled) setTheme(ctx.getWorkingContext().workingTheme);
			} catch {
				// SessionContextService may not be initialized yet.
			}
		};
		refresh();
		const timer = window.setInterval(refresh, 15_000);
		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, []);

	const summary = theme?.llmInferred?.summary?.trim() || theme?.ruleBased.summary?.trim() || '';

	return (
		<div className="peak-related-notes-panel">
			<header className="peak-related-notes-header">
				<Sparkles size={14} />
				<span className="peak-related-notes-title">Related Notes</span>
				{debugTracePort?.isEnabled() && items.length > 0 && (
					<Button
						type="button"
						variant="unstyled"
						size="xs"
						className="peak-related-notes-debug-btn"
						title="Copy ambient push debug trace"
						aria-label="Copy ambient push debug trace"
						onClick={() => {
							const recent = debugTracePort.listRecent(5);
							const ambientRun = recent.find((r) => r.surface === 'ambient');
							void copyDebugTrace(ambientRun?.runId);
						}}
						style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
					>
						<Bug size={12} />
					</Button>
				)}
			</header>

			{summary.length > 0 && (
				<section className="peak-related-notes-summary" aria-label="Working theme">
					<span className="peak-related-notes-summary-label">Working theme</span>
					<span className="peak-related-notes-summary-text">{summary}</span>
				</section>
			)}

			{items.length === 0 ? (
				<div className="peak-related-notes-empty">
					{sourceFilePath
						? 'No related notes suggested for this document yet.'
						: 'Open a note to see related suggestions.'}
				</div>
			) : (
				<ul className="peak-related-notes-list">
					{items.map((item) => (
						<li key={item.filePath} className="peak-related-notes-item">
							<Button
								type="button"
								variant="unstyled"
								size="xs"
								className="peak-related-notes-link"
								onClick={() => {
									if (vaultNavigation) void vaultNavigation.openVaultPath(item.filePath);
								}}
							>
								<FileText size={12} />
								<span className="peak-related-notes-item-title">{item.title || item.filePath}</span>
							</Button>
							{item.explanation && (
								<span className="peak-related-notes-item-explanation">{item.explanation}</span>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
};
