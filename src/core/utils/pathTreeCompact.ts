/**
 * Path tree compaction: build a prefix tree from paths and serialize with common prefix once,
 * indented segments, and [file1, file2, ...] per directory. Used to reduce token usage in prompts.
 */

/** Tree node: one path segment; files listed at the directory that contains them. */
interface PathTreeNode {
	segment: string;
	files: string[];
	children: Map<string, PathTreeNode>;
}

/** Tree node for path+suffix: files carry a display suffix (e.g. " (1 hour ago)", ": 4154 words"). */
interface PathTreeWithSuffixNode {
	segment: string;
	files: Array<{ name: string; suffix: string }>;
	children: Map<string, PathTreeWithSuffixNode>;
}

const INDENT_STEP = '        '; // 8 spaces per level

/** Build path tree from full paths; each node = one segment, files at containing dir. */
function buildPathTree(paths: string[]): PathTreeNode {
	const root: PathTreeNode = { segment: '', files: [], children: new Map() };
	for (const p of paths) {
		const i = p.lastIndexOf('/');
		const dirPath = i >= 0 ? p.slice(0, i) : '';
		const file = i >= 0 ? p.slice(i + 1) : p;
		const segments = dirPath ? dirPath.split('/') : [];
		let node = root;
		for (const seg of segments) {
			if (!node.children.has(seg)) {
				node.children.set(seg, { segment: seg, files: [], children: new Map() });
			}
			node = node.children.get(seg)!;
		}
		node.files.push(file);
	}
	return root;
}

/** Single chain from root (common prefix) until first branch or file list. */
function getCommonPrefixPath(node: PathTreeNode): string[] {
	const path: string[] = [];
	let cur: PathTreeNode = node;
	while (cur.children.size === 1 && cur.files.length === 0) {
		const onlyChild = Array.from(cur.children.entries())[0];
		path.push(onlyChild[0]);
		cur = onlyChild[1];
	}
	return path;
}

export type PathWithSuffix = { path: string; suffix: string };

/** Build path tree from path+suffix items; each file stores its suffix for serialization. */
function buildPathTreeWithSuffix(items: PathWithSuffix[]): PathTreeWithSuffixNode {
	const root: PathTreeWithSuffixNode = { segment: '', files: [], children: new Map() };
	for (const { path: p, suffix } of items) {
		const i = p.lastIndexOf('/');
		const dirPath = i >= 0 ? p.slice(0, i) : '';
		const name = i >= 0 ? p.slice(i + 1) : p;
		const segments = dirPath ? dirPath.split('/') : [];
		let node = root;
		for (const seg of segments) {
			if (!node.children.has(seg)) {
				node.children.set(seg, { segment: seg, files: [], children: new Map() });
			}
			node = node.children.get(seg)!;
		}
		node.files.push({ name, suffix });
	}
	return root;
}

function getCommonPrefixPathWithSuffix(node: PathTreeWithSuffixNode): string[] {
	const path: string[] = [];
	let cur: PathTreeWithSuffixNode = node;
	while (cur.children.size === 1 && cur.files.length === 0) {
		const onlyChild = Array.from(cur.children.entries())[0];
		path.push(onlyChild[0]);
		cur = onlyChild[1];
	}
	return path;
}

type SerializeWithSuffixCtx = SerializeCtx;

function serializePathTreeWithSuffix(
	node: PathTreeWithSuffixNode,
	indent: string,
	segmentPrefix: string,
	ctx: SerializeWithSuffixCtx,
): void {
	const sortedChildEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
	const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
	const hasChildren = sortedChildEntries.length > 0;
	const hasFiles = sortedFiles.length > 0;

	if (node.segment) {
		if (hasFiles && !hasChildren) {
			const filePart = sortedFiles.map((f) => f.name + f.suffix).join(', ');
			const line = indent + segmentPrefix + node.segment + '/[' + filePart + ']';
			if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
			ctx.lines.push(line);
			ctx.pathsShown += sortedFiles.length;
			ctx.totalChars += line.length + 1;
			return;
		}
		if (hasChildren || hasFiles) {
			const line = indent + segmentPrefix + node.segment + '/';
			if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
			ctx.lines.push(line);
			ctx.totalChars += line.length + 1;
		}
	}
	if (hasFiles && hasChildren) {
		const filePart = sortedFiles.map((f) => f.name + f.suffix).join(', ');
		const line = indent + '[' + filePart + ']';
		if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
		ctx.lines.push(line);
		ctx.pathsShown += sortedFiles.length;
		ctx.totalChars += line.length + 1;
	}
	const nextIndent = indent + INDENT_STEP;
	for (const [, child] of sortedChildEntries) {
		if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
		serializePathTreeWithSuffix(child, nextIndent, '/', ctx);
	}
}

/**
 * Same as compactPathsForPrompt but each path has a suffix (e.g. " (1 hour ago)", ": 4154 words")
 * so the output tree shows path + suffix per file. Used for Statistics sections in explore_folder.
 */
export function compactPathsWithSuffix(
	items: PathWithSuffix[],
	maxLines = 40,
	maxChars = 3500,
): string {
	if (items.length === 0) return '';
	const root = buildPathTreeWithSuffix(items);
	const ctx: SerializeWithSuffixCtx = { lines: [], totalChars: 0, pathsShown: 0, maxLines, maxChars, totalPaths: items.length };

	const commonSegments = getCommonPrefixPathWithSuffix(root);
	const commonPrefix = commonSegments.length > 0 ? commonSegments.join('/') + '/' : '';
	let node: PathTreeWithSuffixNode = root;
	for (const seg of commonSegments) {
		node = node.children.get(seg)!;
	}

	if (commonPrefix && (node.files.length > 0 || node.children.size > 0)) {
		const line = commonPrefix;
		if (ctx.totalChars + line.length + 1 <= ctx.maxChars) {
			ctx.lines.push(line);
			ctx.totalChars += line.length + 1;
		}
	}

	const sortedEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
	const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
	if (sortedFiles.length > 0) {
		const filePart = sortedFiles.map((f) => f.name + f.suffix).join(', ');
		const line = INDENT_STEP + '[' + filePart + ']';
		if (ctx.lines.length < ctx.maxLines && ctx.totalChars + line.length + 1 <= ctx.maxChars) {
			ctx.lines.push(line);
			ctx.pathsShown += sortedFiles.length;
			ctx.totalChars += line.length + 1;
		}
	}
	for (const [, child] of sortedEntries) {
		if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
		serializePathTreeWithSuffix(child, INDENT_STEP, '', ctx);
	}

	if (ctx.pathsShown < items.length && ctx.lines.length < maxLines) {
		const remaining = items.length - ctx.pathsShown;
		const tail = '... and ' + remaining + ' more';
		if (ctx.totalChars + tail.length + 1 <= ctx.maxChars) ctx.lines.push(tail);
	}
	return ctx.lines.join('\n');
}

type SerializeCtx = {
	lines: string[];
	totalChars: number;
	pathsShown: number;
	maxLines: number;
	maxChars: number;
	totalPaths: number;
};

/** Serialize path tree with indentation; common prefixes appear once. Respects maxLines/maxChars. */
function serializePathTree(
	node: PathTreeNode,
	indent: string,
	segmentPrefix: string,
	ctx: SerializeCtx,
): void {
	const sortedChildEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
	const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b));
	const hasChildren = sortedChildEntries.length > 0;
	const hasFiles = sortedFiles.length > 0;

	if (node.segment) {
		if (hasFiles && !hasChildren) {
			const line = indent + segmentPrefix + node.segment + '/[' + sortedFiles.join(', ') + ']';
			if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
			ctx.lines.push(line);
			ctx.pathsShown += sortedFiles.length;
			ctx.totalChars += line.length + 1;
			return;
		}
		if (hasChildren || hasFiles) {
			const line = indent + segmentPrefix + node.segment + '/';
			if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
			ctx.lines.push(line);
			ctx.totalChars += line.length + 1;
		}
	}
	if (hasFiles && hasChildren) {
		const line = indent + '[' + sortedFiles.join(', ') + ']';
		if (ctx.lines.length >= ctx.maxLines || ctx.totalChars + line.length + 1 > ctx.maxChars) return;
		ctx.lines.push(line);
		ctx.pathsShown += sortedFiles.length;
		ctx.totalChars += line.length + 1;
	}
	const nextIndent = indent + INDENT_STEP;
	for (const [, child] of sortedChildEntries) {
		if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
		serializePathTree(child, nextIndent, '/', ctx);
	}
}

/**
 * Format paths as a compact tree: common prefix once, then indented segments and [files] per dir.
 * Truncates when over maxLines or maxChars.
 */
export function compactPathsForPrompt(paths: string[], maxLines = 60, maxChars = 4000): string {
	if (paths.length === 0) return '';
	const root = buildPathTree(paths);
	const ctx: SerializeCtx = { lines: [], totalChars: 0, pathsShown: 0, maxLines, maxChars, totalPaths: paths.length };

	const commonSegments = getCommonPrefixPath(root);
	const commonPrefix = commonSegments.length > 0 ? commonSegments.join('/') + '/' : '';
	let node: PathTreeNode = root;
	for (const seg of commonSegments) {
		node = node.children.get(seg)!;
	}

	if (commonPrefix && (node.files.length > 0 || node.children.size > 0)) {
		const line = commonPrefix;
		if (ctx.totalChars + line.length + 1 <= ctx.maxChars) {
			ctx.lines.push(line);
			ctx.totalChars += line.length + 1;
		}
	}

	const sortedEntries = Array.from(node.children.entries()).sort(([a], [b]) => a.localeCompare(b));
	const sortedFiles = [...node.files].sort((a, b) => a.localeCompare(b));
	if (sortedFiles.length > 0) {
		const line = INDENT_STEP + '[' + sortedFiles.join(', ') + ']';
		if (ctx.lines.length < ctx.maxLines && ctx.totalChars + line.length + 1 <= ctx.maxChars) {
			ctx.lines.push(line);
			ctx.pathsShown += sortedFiles.length;
			ctx.totalChars += line.length + 1;
		}
	}
	for (const [, child] of sortedEntries) {
		if (ctx.lines.length >= ctx.maxLines || ctx.totalChars >= ctx.maxChars) break;
		serializePathTree(child, INDENT_STEP, '', ctx);
	}

	if (ctx.pathsShown < paths.length && ctx.lines.length < maxLines) {
		const remaining = paths.length - ctx.pathsShown;
		const tail = '... and ' + remaining + ' more path(s)';
		if (ctx.totalChars + tail.length + 1 <= ctx.maxChars) ctx.lines.push(tail);
	}
	return ctx.lines.join('\n');
}
