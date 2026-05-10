import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { CheckCircle2, FileText, Lightbulb, ExternalLink } from 'lucide-react';

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

export const FindAndSolveTasksPanel: React.FC<FindAndSolveTasksPanelProps> = ({
	result, ctx, onClose,
}) => {
	const [completedTasks, setCompletedTasks] = useState<Set<number>>(() => new Set());

	const openNote = async (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file && 'extension' in file) {
			await app.workspace.getLeaf(false).openFile(file as any);
		}
	};

	const markAsDone = async (task: SolvedTask, index: number) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(task.filePath);
		if (!file || !('extension' in file)) {
			new Notice(`File not found: ${task.filePath}`);
			return;
		}

		try {
			const content = await app.vault.read(file as any);
			const lines = content.split('\n');
			const lineIdx = task.lineNumber - 1;

			if (lineIdx >= 0 && lineIdx < lines.length) {
				// Replace `- [ ]` with `- [x]` and append answer
				const originalLine = lines[lineIdx];
				const updatedLine = originalLine.replace(
					/^(\s*)-\s\[\s\]/,
					'$1- [x]'
				) + ` (Answer: ${task.suggestedAnswer} — via [[${task.sourceNotePath.replace(/\.md$/, '')}]])`;
				lines[lineIdx] = updatedLine;
				await app.vault.modify(file as any, lines.join('\n'));
				setCompletedTasks(prev => new Set([...prev, index]));
				new Notice('Task marked as done with answer appended.');
			}
		} catch (e) {
			new Notice(`Failed: ${(e as Error).message}`);
		}
	};

	const formatConfidence = (confidence: number) => {
		const pct = Math.round(confidence * 100);
		if (pct >= 80) return { label: `${pct}%`, className: 'pktw-text-[var(--pk-success,#22c55e)]' };
		if (pct >= 50) return { label: `${pct}%`, className: 'pktw-text-accent' };
		return { label: `${pct}%`, className: 'pktw-text-muted-foreground' };
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<Lightbulb className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Tasks with Answers</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{result.tasks.length} found
					</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">
					{result.totalTasksScanned} tasks scanned
				</span>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{result.tasks.length === 0 ? (
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No solvable tasks found in the vault.
					</div>
				) : (
					result.tasks.map((task, i) => {
						const isDone = completedTasks.has(i);
						const confidenceInfo = formatConfidence(task.confidence);
						return (
							<div
								key={i}
								className={`pktw-border pktw-border-border pktw-rounded-lg pktw-mb-3 pktw-overflow-hidden pktw-transition-opacity ${
									isDone ? 'pktw-opacity-50' : ''
								}`}
							>
								{/* Task header */}
								<div className="pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border">
									<div className="pktw-flex pktw-items-start pktw-gap-2">
										<CheckCircle2 className={`pktw-w-3.5 pktw-h-3.5 pktw-flex-shrink-0 pktw-mt-0.5 ${
											isDone ? 'pktw-text-[var(--pk-success,#22c55e)]' : 'pktw-text-muted-foreground'
										}`} />
										<div className="pktw-flex-1 pktw-min-w-0">
											<span className="pktw-text-[12px] pktw-font-semibold pktw-block">{task.taskText}</span>
											<div
												className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mt-1 pktw-cursor-pointer"
												onClick={() => openNote(task.filePath)}
											>
												<FileText className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
												<span className="pktw-text-[10px] pktw-text-muted-foreground/60 pktw-truncate">
													{task.filePath}:L{task.lineNumber}
												</span>
											</div>
										</div>
									</div>
								</div>

								{/* Answer */}
								<div className="pktw-px-3.5 pktw-py-2.5">
									<div className="pktw-flex pktw-items-start pktw-gap-2">
										<Lightbulb className="pktw-w-3 pktw-h-3 pktw-text-accent pktw-flex-shrink-0 pktw-mt-0.5" />
										<div className="pktw-flex-1 pktw-min-w-0">
											<span className="pktw-text-[12px] pktw-block pktw-leading-relaxed">
												{task.suggestedAnswer}
											</span>
											<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-1.5">
												<div
													className="pktw-flex pktw-items-center pktw-gap-1 pktw-cursor-pointer"
													onClick={() => openNote(task.sourceNotePath)}
												>
													<ExternalLink className="pktw-w-3 pktw-h-3 pktw-text-accent" />
													<span className="pktw-text-[10px] pktw-text-accent">
														{task.sourceNoteTitle}
													</span>
												</div>
												<span className={`pktw-text-[10px] pktw-font-bold ${confidenceInfo.className}`}>
													{confidenceInfo.label}
												</span>
											</div>
										</div>
									</div>

									{/* Action */}
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
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{result.summary}
				</span>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
			</div>
		</div>
	);
};
