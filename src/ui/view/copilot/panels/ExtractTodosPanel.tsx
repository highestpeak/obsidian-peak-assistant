import React, { useState, useMemo } from 'react';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { CheckSquare, FileText, Filter, Copy } from 'lucide-react';
import { Notice } from 'obsidian';

export interface TodoItem {
	filePath: string;
	text: string;
	lineNumber: number;
	tags: string[];
}

export interface ExtractTodosResult {
	todos: TodoItem[];
	totalFiles: number;
	summary: string;
}

interface ExtractTodosPanelProps {
	result: ExtractTodosResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const ExtractTodosPanel: React.FC<ExtractTodosPanelProps> = ({
	result, ctx, onClose,
}) => {
	const [filterTag, setFilterTag] = useState<string | null>(null);
	const [filterFolder, setFilterFolder] = useState<string | null>(null);

	// Collect unique tags and top-level folders from todos
	const { allTags, allFolders } = useMemo(() => {
		const tagSet = new Set<string>();
		const folderSet = new Set<string>();
		for (const todo of result.todos) {
			for (const tag of todo.tags) tagSet.add(tag);
			const folder = todo.filePath.split('/').slice(0, -1).join('/') || '/';
			folderSet.add(folder);
		}
		return {
			allTags: Array.from(tagSet).sort(),
			allFolders: Array.from(folderSet).sort(),
		};
	}, [result.todos]);

	// Filter todos
	const filtered = useMemo(() => {
		let items = result.todos;
		if (filterTag) {
			items = items.filter(t => t.tags.includes(filterTag));
		}
		if (filterFolder) {
			items = items.filter(t => t.filePath.startsWith(filterFolder));
		}
		return items;
	}, [result.todos, filterTag, filterFolder]);

	// Group by file
	const grouped = useMemo(() => {
		const map = new Map<string, TodoItem[]>();
		for (const item of filtered) {
			const arr = map.get(item.filePath) ?? [];
			arr.push(item);
			map.set(item.filePath, arr);
		}
		return Array.from(map.entries());
	}, [filtered]);

	const navigateToLine = async (filePath: string, lineNumber: number) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(filePath);
		if (!file || !('extension' in file)) return;
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file as any);
		// Scroll to line
		const view = leaf.view as any;
		if (view?.editor) {
			view.editor.setCursor({ line: lineNumber - 1, ch: 0 });
			view.editor.scrollIntoView(
				{ from: { line: lineNumber - 1, ch: 0 }, to: { line: lineNumber - 1, ch: 0 } },
				true,
			);
		}
	};

	const handleCopy = async () => {
		const lines = filtered.map(t => `- [ ] ${t.text} (${t.filePath}:${t.lineNumber})`);
		await navigator.clipboard.writeText(lines.join('\n'));
		new Notice('Todos copied to clipboard.');
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					<CheckSquare className="pktw-w-4 pktw-h-4" />
					<span className="pktw-text-sm pktw-font-semibold">Vault Todos</span>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
						{filtered.length} / {result.todos.length}
					</span>
				</div>
				<span className="pktw-text-[11px] pktw-text-muted-foreground">
					{result.totalFiles} files scanned
				</span>
			</div>

			{/* Filters */}
			{(allTags.length > 0 || allFolders.length > 1) && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-5 pktw-py-2 pktw-border-b pktw-border-border pktw-flex-wrap">
					<Filter className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground pktw-flex-shrink-0" />
					{allTags.length > 0 && (
						<select
							className="pktw-text-[11px] pktw-bg-secondary pktw-border pktw-border-border pktw-rounded pktw-px-2 pktw-py-1"
							value={filterTag ?? ''}
							onChange={e => setFilterTag(e.target.value || null)}
						>
							<option value="">All tags</option>
							{allTags.map(tag => (
								<option key={tag} value={tag}>{tag}</option>
							))}
						</select>
					)}
					{allFolders.length > 1 && (
						<select
							className="pktw-text-[11px] pktw-bg-secondary pktw-border pktw-border-border pktw-rounded pktw-px-2 pktw-py-1"
							value={filterFolder ?? ''}
							onChange={e => setFilterFolder(e.target.value || null)}
						>
							<option value="">All folders</option>
							{allFolders.map(folder => (
								<option key={folder} value={folder}>{folder}</option>
							))}
						</select>
					)}
				</div>
			)}

			{/* Body */}
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
				{grouped.length === 0 ? (
					<div className="pktw-text-center pktw-text-muted-foreground pktw-py-8 pktw-text-sm">
						No todos found{filterTag || filterFolder ? ' matching filter' : ''}.
					</div>
				) : (
					grouped.map(([filePath, todos]) => (
						<div key={filePath} className="pktw-mb-4">
							<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1.5">
								<FileText className="pktw-w-3 pktw-h-3 pktw-text-muted-foreground" />
								<span className="pktw-text-[11px] pktw-font-semibold pktw-text-muted-foreground pktw-truncate">
									{filePath}
								</span>
								<span className="pktw-text-[9px] pktw-text-muted-foreground/50 pktw-flex-shrink-0">
									({todos.length})
								</span>
							</div>
							{todos.map((todo, i) => (
								<div
									key={i}
									className="pktw-flex pktw-items-start pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-rounded pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
									onClick={() => navigateToLine(filePath, todo.lineNumber)}
								>
									<CheckSquare className="pktw-w-3 pktw-h-3 pktw-text-accent pktw-flex-shrink-0 pktw-mt-0.5" />
									<span className="pktw-text-[12px] pktw-flex-1 pktw-min-w-0">{todo.text}</span>
									<span className="pktw-text-[9px] pktw-text-muted-foreground/40 pktw-flex-shrink-0 pktw-font-mono">
										L{todo.lineNumber}
									</span>
								</div>
							))}
						</div>
					))
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
				<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
					{result.summary}
				</span>
				<Button variant="ghost" onClick={handleCopy}>
					<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
					Copy
				</Button>
				<Button variant="ghost" onClick={onClose}>Dismiss</Button>
			</div>
		</div>
	);
};
