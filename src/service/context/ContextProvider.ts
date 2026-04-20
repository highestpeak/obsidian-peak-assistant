import type { App, TFile, CachedMetadata } from 'obsidian';

export interface VaultContext {
	activeDocumentTitle: string | null;
	activeDocumentPath: string | null;
	currentFolder: string | null;
	documentTags: string | null;
	vaultName: string;
	documentKeywords: string | null;
	firstHeading: string | null;
	frontmatterProperties: string | null;
	documentType: string | null;
	outgoingLinks: string | null;
	backlinks: string | null;
	linkContext: string | null;
	recentDocuments: string | null;
	recentFolders: string | null;
	documentAge: string | null;
}

export interface FillParams {
	activeFile: TFile | null;
	metadata: CachedMetadata | null;
	backlinks: string[];
	recentFiles: string[];
	vaultName: string;
}

function dedupe<T>(items: T[]): T[] {
	return [...new Set(items)];
}

function folderOf(filePath: string): string {
	const idx = filePath.lastIndexOf('/');
	return idx >= 0 ? filePath.slice(0, idx) : '';
}

export function fillVaultContext(params: FillParams): VaultContext {
	const { activeFile, metadata, backlinks, recentFiles, vaultName } = params;

	// recentDocuments — top 5 paths
	const top5Recent = recentFiles.slice(0, 5);
	const recentDocuments = top5Recent.length > 0 ? top5Recent.join(', ') : null;

	// recentFolders — deduplicated folders from recentFiles, top 5
	const recentFolderList = dedupe(recentFiles.map(folderOf).filter((f) => f !== '')).slice(0, 5);
	const recentFolders = recentFolderList.length > 0 ? recentFolderList.join(', ') : null;

	if (!activeFile) {
		return {
			activeDocumentTitle: null,
			activeDocumentPath: null,
			currentFolder: null,
			documentTags: null,
			vaultName,
			documentKeywords: null,
			firstHeading: null,
			frontmatterProperties: null,
			documentType: null,
			outgoingLinks: null,
			backlinks: backlinks.length > 0 ? backlinks.join(', ') : null,
			linkContext: null,
			recentDocuments,
			recentFolders,
			documentAge: null,
		};
	}

	const fm = metadata?.frontmatter ?? null;

	// documentTags — frontmatter.tags as array or string
	let documentTags: string | null = null;
	if (fm?.tags != null) {
		if (Array.isArray(fm.tags)) {
			documentTags = fm.tags.length > 0 ? (fm.tags as string[]).join(', ') : null;
		} else {
			documentTags = String(fm.tags) || null;
		}
	}

	// documentKeywords — title + H1 + H2 headings, deduplicated, top 5
	const headings = metadata?.headings ?? [];
	const headingTexts = headings
		.filter((h) => h.level === 1 || h.level === 2)
		.map((h) => h.heading);
	const keywordCandidates = dedupe([activeFile.basename, ...headingTexts]).slice(0, 5);
	const documentKeywords = keywordCandidates.length > 0 ? keywordCandidates.join(', ') : null;

	// firstHeading — first H1
	const firstH1 = headings.find((h) => h.level === 1);
	const firstHeading = firstH1?.heading ?? null;

	// frontmatterProperties — key: value pairs excluding 'tags' and 'position'
	let frontmatterProperties: string | null = null;
	if (fm) {
		const pairs = Object.entries(fm)
			.filter(([key]) => key !== 'tags' && key !== 'position')
			.map(([key, value]) => `${key}: ${value}`);
		frontmatterProperties = pairs.length > 0 ? pairs.join(', ') : null;
	}

	// documentType
	const documentType: string | null = fm?.type ?? fm?.category ?? null;

	// outgoingLinks
	const links = metadata?.links ?? [];
	const outgoingLinks = links.length > 0 ? links.map((l) => l.link).join(', ') : null;

	// backlinks
	const backlinkStr = backlinks.length > 0 ? backlinks.join(', ') : null;

	// documentAge — days since ctime
	let documentAge: string | null = null;
	if (activeFile.stat?.ctime != null) {
		const msPerDay = 1000 * 60 * 60 * 24;
		const days = Math.floor((Date.now() - activeFile.stat.ctime) / msPerDay);
		documentAge = String(days);
	}

	// currentFolder
	const currentFolder = activeFile.parent?.path ?? folderOf(activeFile.path) ?? null;

	return {
		activeDocumentTitle: activeFile.basename,
		activeDocumentPath: activeFile.path,
		currentFolder: currentFolder || null,
		documentTags,
		vaultName,
		documentKeywords,
		firstHeading,
		frontmatterProperties,
		documentType,
		outgoingLinks,
		backlinks: backlinkStr,
		linkContext: null,
		recentDocuments,
		recentFolders,
		documentAge,
	};
}

export class ContextProvider {
	constructor(private readonly app: App) {}

	collect(): VaultContext {
		const activeFile = this.app.workspace.getActiveFile();
		const metadata = activeFile
			? this.app.metadataCache.getFileCache(activeFile)
			: null;

		// Resolve backlinks: find all files that link to activeFile
		const backlinks: string[] = [];
		if (activeFile) {
			const resolvedLinks = this.app.metadataCache.resolvedLinks;
			for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
				if (targets[activeFile.path] != null) {
					backlinks.push(sourcePath);
				}
			}
		}

		const recentFiles: string[] =
			(this.app.workspace as any).getLastOpenFiles?.() ?? [];

		const vaultName = this.app.vault.getName();

		return fillVaultContext({
			activeFile,
			metadata,
			backlinks,
			recentFiles,
			vaultName,
		});
	}
}
