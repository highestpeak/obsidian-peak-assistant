import React, { useEffect, useState } from 'react';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import { SessionContextService } from '@/service/context/SessionContextService';
import type { WorkingTheme } from '@/service/context/types';
import { Bug, FileText, Sparkles } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useDebugTraceCopy } from '@/ui/hooks/useDebugTraceCopy';

// UI stays app-agnostic — link opening routes through the vaultNavigation
// port already published on ServiceContext, so we no longer need `app: App`
// as a prop (which forced callers in `src/ui/**` to import from `@/app/**`,
// violating the T11P / T11Q boundary).
type RelatedNotesPanelProps = Record<string, never>;

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
export const RelatedNotesPanel: React.FC<RelatedNotesPanelProps> = () => {
	const items = useAmbientPushStore((s) => s.items);
	const sourceFilePath = useAmbientPushStore((s) => s.sourceFilePath);
	const [theme, setTheme] = useState<WorkingTheme | null>(null);
	const { debugTracePort, vaultNavigation } = useServiceContext();
	const copyDebugTrace = useDebugTraceCopy();

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
				{debugTracePort?.isEnabled() && items.length > 0 && (
					<button
						type="button"
						className="peak-related-notes-debug-btn"
						title="Copy ambient push debug trace"
						aria-label="Copy ambient push debug trace"
						onClick={() => {
							// The runtime opens one debug run per trigger. Take the most
							// recent ambient run — normally the one that produced the
							// items currently rendered.
							const recent = debugTracePort.listRecent(5);
							const ambientRun = recent.find((r) => r.surface === 'ambient');
							void copyDebugTrace(ambientRun?.runId);
						}}
						style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', padding: 2 }}
					>
						<Bug size={12} />
					</button>
				)}
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
									// Route through vaultNavigation port instead of
									// touching Obsidian's workspace directly. Fires-and-
									// forgets on null port (SSR / test doubles).
									if (vaultNavigation) {
										void vaultNavigation.openVaultPath(item.filePath);
									}
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
