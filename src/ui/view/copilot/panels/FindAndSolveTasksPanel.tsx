import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { useCopilotPanelVault } from '@/ui/view/copilot/hooks/useCopilotPanelVault';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { CheckCircle2, FileText, Lightbulb, ExternalLink } from 'lucide-react';
import { CopilotPanelShell } from '@/ui/view/copilot/components/CopilotPanelShell';
import { PanelEmptyState } from '@/ui/view/copilot/components/FindingsBodyParts';

export interface SolvedTask {
	filePath: string;
	lineNumber: number;
	taskText: string;
	suggestedAnswer: string;
	sourceNotePath: string;
	sourceNoteTitle: string;
	confidence: number;
}

export interface FindAndSolveTasksResult {
	tasks: SolvedTask[];
	totalTasksScanned: number;
	summary: string;
}

interface FindAndSolveTasksPanelProps {
	result: FindAndSolveTasksResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const FindAndSolveTasksPanel: React.FC<FindAndSolveTasksPanelProps> = ({ result, onClose }) => {
	const { vault } = useCopilotPanelVault();
	const [completedTasks, setCompletedTasks] = useState<Set<number>>(() => new Set());

	const openNote = (path: string): Promise<void> => vault.openNote(path, { newLeaf: false });

	const markAsDone = async (task: SolvedTask, index: number) => {
		const file = vault.findFileByPath(task.filePath);
		if (!file) {
			new Notice(`File not found: ${task.filePath}`);
			return;
		}
		try {
			const content = await vault.readFileContent(file);
			const lines = content.split('\n');
			const lineIdx = task.lineNumber - 1;
			if (lineIdx >= 0 && lineIdx < lines.length) {
				const updatedLine = lines[lineIdx].replace(/^(\s*)-\s\[\s\]/, '$1- [x]')
					+ ` (Answer: ${task.suggestedAnswer} — via [[${task.sourceNotePath.replace(/\.md$/, '')}]])`;
				lines[lineIdx] = updatedLine;
				await vault.replaceFileContent(file, lines.join('\n'));
				setCompletedTasks((prev) => new Set([...prev, index]));
				new Notice('Task marked as done with answer appended.');
			}
		} catch (e) {
			new Notice(`Failed: ${(e as Error).message}`);
		}
	};

	const formatConfidence = (confidence: number) => {
		const pct = Math.round(confidence * 100);
		if (pct >= 80) return { label: `${pct}%`, className: 'pktw-text-[var(--pk-success)]' };
		if (pct >= 50) return { label: `${pct}%`, className: 'pktw-text-accent' };
		return { label: `${pct}%`, className: 'pktw-text-muted-foreground' };
	};

	return (
		<CopilotPanelShell
			icon={Lightbulb}
			title="Tasks with Answers"
			badge={`${result.tasks.length} found`}
			subtitle={`${result.totalTasksScanned} tasks scanned`}
			footerSummary={result.summary}
			onClose={onClose}
		>
			{result.tasks.length === 0 ? (
				<PanelEmptyState message="No solvable tasks found in the vault." />
			) : (
				result.tasks.map((task, i) => {
					const isDone = completedTasks.has(i);
					const confidenceInfo = formatConfidence(task.confidence);
					return (
						<div
							key={i}
							className={`pktw-border pktw-border-border pktw-rounded-lg pktw-mb-3 pktw-overflow-hidden pktw-transition-opacity ${isDone ? 'pktw-opacity-50' : ''}`}
						>
							<div className="pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border">
								<div className="pktw-flex pktw-items-start pktw-gap-2">
									<CheckCircle2 className={`pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0 pktw-mt-0.5 ${isDone ? 'pktw-text-[var(--pk-success)]' : 'pktw-text-muted-foreground'}`} />
									<div className="pktw-flex-1 pktw-min-w-0">
										<span className="pktw-text-[12px] pktw-font-semibold pktw-block">{task.taskText}</span>
										<div
											className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mt-1 pktw-cursor-pointer"
											onClick={() => openNote(task.filePath)}
										>
											<FileText className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
											<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-truncate">{task.filePath}:L{task.lineNumber}</span>
										</div>
									</div>
								</div>
							</div>
							<div className="pktw-px-3.5 pktw-py-2.5">
								<div className="pktw-flex pktw-items-start pktw-gap-2">
									<Lightbulb className="pktw-w-3 pktw-h-3 pktw-text-accent pktw-flex-shrink-0 pktw-mt-0.5" />
									<div className="pktw-flex-1 pktw-min-w-0">
										<span className="pktw-text-[12px] pktw-block pktw-leading-relaxed">{task.suggestedAnswer}</span>
										<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-1.5">
											<div
												className="pktw-flex pktw-items-center pktw-gap-1 pktw-cursor-pointer"
												onClick={() => openNote(task.sourceNotePath)}
											>
												<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-accent" />
												<span className="pktw-text-[10px] pktw-text-accent">{task.sourceNoteTitle}</span>
											</div>
											<span className={`pktw-text-[10px] pktw-font-bold ${confidenceInfo.className}`}>{confidenceInfo.label}</span>
										</div>
									</div>
								</div>
								{!isDone && (
									<div className="pktw-flex pktw-justify-end pktw-mt-2">
										<Button
											size="sm"
											className="pktw-h-6 pktw-text-[10px] pktw-px-3"
											onClick={() => markAsDone(task, i)}
										>
											<CheckCircle2 className="pktw-w-3 pktw-h-3 pktw-mr-1" />
											Mark Done
										</Button>
									</div>
								)}
							</div>
						</div>
					);
				})
			)}
		</CopilotPanelShell>
	);
};
