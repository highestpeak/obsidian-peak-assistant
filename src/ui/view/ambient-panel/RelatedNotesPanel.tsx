import React, { useEffect, useState } from 'react';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { SessionContextService } from '@/service/context/SessionContextService';
import type { WorkingTheme } from '@/service/context/types';
import { FileText, Sparkles } from 'lucide-react';
import type { App } from 'obsidian';

interface RelatedNotesPanelProps {
	app: App;
}

/**
 * Stable Ambient / Related Notes panel — the canonical surface for Ambient
 * Push under the 2026-07 direction. Renders:
 *   - the current WorkingTheme summary (LLM-inferred if available, else rule-based)
 *   - the top related notes for the active file
 *   - a graceful empty state when nothing is queued
 *
 * Design intent: no animation, no flashing, no auto-open modal. Users open
 * this panel from the ribbon or command palette; once open, it updates in
 * place without demanding attention.
 */
export const RelatedNotesPanel: React.FC<RelatedNotesPanelProps> = ({ app }) => {
	const items = useAmbientPushStore((s) => s.items);
	const sourceFilePath = useAmbientPushStore((s) => s.sourceFilePath);
	const [theme, setTheme] = useState<WorkingTheme | null>(null);

	// Poll WorkingTheme every 15s while the panel is open. This is a stable
	// surface — no store subscription flicker.
	useEffect(() => {
		let cancelled = false;
		const refresh = () => {
			try {
				const ctx = SessionContextService.getInstance();
				if (!cancelled) setTheme(ctx.getWorkingContext().workingTheme);
			} catch {
				// SessionContextService not initialized yet — try again next tick.
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
			</header>

			{summary.length > 0 && (
				<section className="peak-related-notes-summary" aria-label="Working theme">
					<span className="peak-related-notes-summary-label">Working theme</span>
					<p className="peak-related-notes-summary-text">{summary}</p>
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
							<button
								type="button"
								className="peak-related-notes-link"
								onClick={() => {
									void app.workspace.openLinkText(item.filePath, '', false);
								}}
							>
								<FileText size={12} />
								<span className="peak-related-notes-item-title">{item.title || item.filePath}</span>
							</button>
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
