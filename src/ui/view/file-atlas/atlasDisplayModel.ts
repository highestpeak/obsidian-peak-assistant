/**
 * File Atlas display projection.
 *
 * Parsing preserves source syntax, anchors, and addressable resource objects.
 * This module owns the user-facing identity grammar shared by Tree, Inspector,
 * search, and tray. It is deterministic and performs no network enrichment.
 */

import type { BlockDetail, DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind as Kind } from '@/core/document/atlas/types';
import { fileExtension } from '@/core/document/atlas/linkClassifier';
import type { FileAtlasConfig } from './config/fileAtlasConfig';

export interface AtlasDisplayIdentity {
	primary: string;
	secondary?: string;
	provenance?: string;
}

export interface AtlasDisplayOptions {
	/** Short owner text promoted into a resource row by a focused projection. */
	ownerContext?: string;
}

export interface InspectorCardPolicy {
	keywords: boolean;
	statistics: boolean;
	sourceDetails: boolean;
}

export function displayIdentity(
	block: DocumentBlock,
	config: FileAtlasConfig,
	options: AtlasDisplayOptions = {},
): AtlasDisplayIdentity {
	const identity = identityByKind(block, config);
	if (!options.ownerContext) return identity;
	if (identity.secondary?.includes(options.ownerContext)) return identity;
	return {
		...identity,
		secondary: joinParts(identity.secondary, truncate(options.ownerContext, 56)),
	};
}

function identityByKind(
	block: DocumentBlock,
	config: FileAtlasConfig,
): AtlasDisplayIdentity {
	switch (block.kind) {
		case Kind.Frontmatter:
			return frontmatterIdentity(block, config);
		case Kind.Property:
			return propertyIdentity(block, config);
		case Kind.Tag:
			return tagIdentity(block, config);
		case Kind.Heading:
		case Kind.Paragraph:
		case Kind.ListItem:
		case Kind.Quote:
			return {
				primary: cleanInlineMarkdown(block.title || block.source) || config.kinds[block.kind]?.label,
				secondary: block.detail?.htmlBlock
					? joinParts(
						config.kinds[Kind.Paragraph]?.label,
						config.identity.labels.htmlBlock,
					)
					: undefined,
			};
		case Kind.List:
			return listIdentity(block, config);
		case Kind.Task:
			return taskIdentity(block, config);
		case Kind.Callout:
			return calloutIdentity(block, config);
		case Kind.Table:
			return tableIdentity(block, config);
		case Kind.Code:
			return codeIdentity(block, config);
		case Kind.Math:
			return mathIdentity(block, config);
		case Kind.Mermaid:
			return mermaidIdentity(block, config);
		case Kind.Image:
			return imageIdentity(block, config);
		case Kind.Embed:
			return embedIdentity(block, config);
		case Kind.Attachment:
			return attachmentIdentity(block, config);
		case Kind.Footnote:
			return footnoteIdentity(block, config);
		case Kind.VaultLink:
			return vaultLinkIdentity(block, config);
		case Kind.ExternalLink:
			return externalLinkIdentity(block, config);
		default:
			return { primary: cleanInlineMarkdown(block.title || block.source) || block.kind };
	}
}

function frontmatterIdentity(
	block: DocumentBlock,
	config: FileAtlasConfig,
): AtlasDisplayIdentity {
	const properties = (block.children ?? []).filter((child) => child.kind === Kind.Property).length;
	const tags = block.detail?.frontmatterTagCount
		?? (block.children ?? []).filter((child) => child.kind === Kind.Tag).length;
	return {
		primary: config.strings.frontmatterTitle,
		secondary: joinParts(
			countLabel(
				properties,
				config.identity.labels.propertySingular,
				config.identity.labels.propertyPlural,
			),
			countLabel(
				tags,
				config.identity.labels.tagSingular,
				config.identity.labels.tagPlural,
			),
		),
	};
}

function propertyIdentity(
	block: DocumentBlock,
	config: FileAtlasConfig,
): AtlasDisplayIdentity {
	const key = block.detail?.propertyKey ?? block.title.split(':')[0];
	const value = formatPropertyValue(
		block.detail?.propertyValue ?? block.sub ?? '',
		block.detail?.propertyValueType,
		config,
	);
	return {
		primary: humanizeKey(key),
		secondary: truncate(value, 84),
		provenance: block.source,
	};
}

function tagIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const source = block.detail?.tagSource === 'frontmatter'
		? config.identity.labels.frontmatter
		: config.identity.labels.inline;
	const occurrences = block.detail?.occurrenceCount ?? 1;
	const occurrenceLabel = countLabel(
		occurrences,
		config.identity.labels.occurrenceSingular,
		config.identity.labels.occurrencePlural,
	);
	const property = block.detail?.tagSource === 'frontmatter' ? 'tags' : block.anchor.nearestHeading;
	return {
		primary: block.title.startsWith('#') ? block.title : `#${block.title}`,
		secondary: joinParts(source, property ?? undefined, occurrenceLabel),
	};
}

function listIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const count = block.detail?.itemCount ?? block.children?.length ?? 0;
	const cue = block.children?.[0]
		? cleanInlineMarkdown(block.children[0].title || block.children[0].source)
		: '';
	return {
		primary: block.detail?.ordered
			? config.identity.labels.numberedList
			: config.identity.labels.bulletedList,
		secondary: joinParts(
			countLabel(
				count,
				config.identity.labels.itemSingular,
				config.identity.labels.itemPlural,
			),
			cue ? truncate(cue, 64) : undefined,
		),
	};
}

function taskIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	return {
		primary: cleanInlineMarkdown(block.title || block.source),
		secondary: joinParts(
			block.detail?.checked ? config.identity.labels.done : config.identity.labels.open,
			block.anchor.nearestHeading ?? undefined,
		),
	};
}

function calloutIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const type = titleCase(block.detail?.calloutType ?? config.kinds[Kind.Callout]?.label ?? Kind.Callout);
	const paragraphCount = block.source
		.split(/\r?\n/)
		.slice(1)
		.filter((line) => line.replace(/^>\s?/, '').trim().length > 0)
		.length;
	return {
		primary: cleanInlineMarkdown(block.title || block.source),
		secondary: joinParts(
			type,
			countLabel(
				paragraphCount,
				config.identity.labels.paragraphSingular,
				config.identity.labels.paragraphPlural,
			),
		),
	};
}

function tableIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const headers = tableHeaders(block.source);
	const dimensions = `${block.detail?.rows ?? 0} × ${block.detail?.columns ?? headers.length}`;
	return {
		primary: config.identity.labels.table,
		secondary: joinParts(dimensions, headers.length ? truncate(headers.join(' / '), 84) : undefined),
	};
}

function codeIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const languageId = block.detail?.language?.toLowerCase() || 'text';
	const language = config.identity.languages[languageId] ?? titleCase(languageId);
	const code = unfenced(block.source);
	const declaration = declarationIdentity(code);
	const lineCount = block.detail?.lineCount ?? code.split(/\r?\n/).filter(Boolean).length;
	return {
		primary: declaration
			|| firstMeaningfulLine(code)
			|| `${language} ${config.kinds[Kind.Code]?.label}`,
		secondary: joinParts(
			language,
			countLabel(
				lineCount,
				config.identity.labels.lineSingular,
				config.identity.labels.linePlural,
			),
		),
	};
}

function mathIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const formula = humanizeFormula(block.source);
	return {
		primary: truncate(formula || config.identity.labels.displayMath, 100),
		secondary: config.identity.labels.displayMath,
	};
}

function mermaidIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const summary = mermaidSummary(block.source);
	return {
		primary: summary.primary || config.identity.labels.diagram,
		secondary: joinParts(
			config.identity.labels.flowchart,
			summary.nodeCount
				? countLabel(
					summary.nodeCount,
					config.identity.labels.nodeSingular,
					config.identity.labels.nodePlural,
				)
				: undefined,
		),
	};
}

function imageIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const target = block.detail?.fileTarget ?? block.detail?.target ?? block.title;
	const filename = basename(target);
	const extension = fileExtension(target);
	const format = extension ? extension.toUpperCase() : config.kinds[Kind.Image]?.label;
	const authored = block.detail?.authoredLabel;
	return {
		primary: authored || filename || block.title,
		secondary: joinParts(format, authored ? filename : dirname(target)),
		provenance: target,
	};
}

function embedIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const target = block.detail?.target ?? block.detail?.fileTarget ?? block.title;
	const fileTarget = block.detail?.fileTarget ?? target.split('#')[0];
	const extension = fileExtension(fileTarget);
	const fragment = readableFragment(block.detail?.linkFragment);
	if (extension === 'canvas') {
		return { primary: stem(fileTarget), secondary: config.identity.labels.canvas, provenance: target };
	}
	if (extension === 'base') {
		return { primary: stem(fileTarget), secondary: config.identity.labels.base, provenance: target };
	}
	if (fragment) {
		return {
			primary: block.detail?.authoredLabel || fragment,
			secondary: joinParts(stem(fileTarget), config.identity.labels.noteSection),
			provenance: target,
		};
	}
	return {
		primary: block.detail?.authoredLabel || stem(fileTarget),
		secondary: config.identity.labels.embeddedNote,
		provenance: target,
	};
}

function attachmentIdentity(
	block: DocumentBlock,
	config: FileAtlasConfig,
): AtlasDisplayIdentity {
	const target = block.detail?.fileTarget ?? block.detail?.target ?? block.title;
	const extension = fileExtension(target);
	const type = config.identity.fileTypes[extension] ?? config.identity.labels.attachment;
	return {
		primary: basename(target) || block.title,
		secondary: joinParts(type, dirname(target)),
		provenance: target,
	};
}

function footnoteIdentity(block: DocumentBlock, config: FileAtlasConfig): AtlasDisplayIdentity {
	const id = block.detail?.target ?? block.title.replace(/^\[\^|\]$/g, '');
	const definition = cleanInlineMarkdown(block.detail?.definitionText ?? block.source);
	const references = block.detail?.referenceCount ?? 0;
	let referenceLabel = `${references} ${config.identity.labels.references}`;
	if (references === 1) referenceLabel = config.identity.labels.referencedOnce;
	if (references === 2) referenceLabel = config.identity.labels.referencedTwice;
	return {
		primary: truncate(definition || block.title, 100),
		secondary: joinParts(id, referenceLabel),
	};
}

function vaultLinkIdentity(
	block: DocumentBlock,
	config: FileAtlasConfig,
): AtlasDisplayIdentity {
	const target = block.detail?.target ?? block.title;
	const noteTarget = target.split('#')[0];
	const fragment = readableFragment(block.detail?.linkFragment);
	const primary = block.detail?.authoredLabel || fragment || stem(noteTarget);
	const fragmentType = block.detail?.linkFragment?.startsWith('#^')
		? config.identity.labels.block
		: block.detail?.linkFragment
			? config.identity.labels.heading
			: config.identity.labels.vaultNote;
	const targetTitle = stem(noteTarget);
	const secondary = !fragment && primary === targetTitle
		? undefined
		: joinParts(targetTitle, fragmentType);
	return {
		primary,
		secondary,
		provenance: target,
	};
}

function externalLinkIdentity(
	block: DocumentBlock,
	config: FileAtlasConfig,
): AtlasDisplayIdentity {
	const target = block.detail?.target ?? block.source;
	const authored = isPlaceholderTitle(block.detail?.authoredLabel, config)
		? undefined
		: block.detail?.authoredLabel;
	const companion = cleanCompanionTitle(block.detail?.companionTitle, config);
	const url = safeUrl(target);
	const domain = block.detail?.domain ?? url?.hostname;
	const provider = providerLabel(domain, config);
	const primary =
		authored ||
		companion ||
		githubIdentity(url) ||
		decodedSlug(url) ||
		provider ||
		domain ||
		target;
	const fragment = url?.hash ? decodePart(url.hash.slice(1)) : undefined;
	return {
		primary: truncate(primary, 110),
		secondary: joinParts(provider, fragment),
		provenance: target,
	};
}

export function cleanInlineMarkdown(source: string): string {
	return source
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/%%[\s\S]*?%%/g, ' ')
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		.replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, '')
		.replace(/^\s*>\s?(?:\[![^\]]+\][+-]?\s*)?/gm, '')
		.replace(/!\[\[([^|\]#]+)(?:#[^|\]]+)?\|([^|\]]+)(?:\|[^\]]+)?\]\]/g, '$2')
		.replace(/!\[\[([^\]#|]+)(?:#[^\]|]+)?\]\]/g, '$1')
		.replace(/\[\[([^|\]#]+)(?:#[^|\]]+)?\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]#|]+)#([^|\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/\[\^[^\]]+\]/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/[*_`~]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function atlasSearchText(
	block: DocumentBlock,
	config: FileAtlasConfig,
	ownerContext?: string,
): string {
	const identity = displayIdentity(block, config, { ownerContext });
	return [
		identity.primary,
		identity.secondary,
		identity.provenance,
		block.detail?.authoredLabel,
		block.detail?.companionTitle,
		block.detail?.target,
		block.detail?.fileTarget,
		ownerContext,
	]
		.filter(Boolean)
		.join(' ')
		.toLowerCase();
}

export function inspectorCardPolicy(block: DocumentBlock): InspectorCardPolicy {
	const proseLength = cleanInlineMarkdown(block.source).length;
	const proseAnalysis = new Set<DocumentBlock['kind']>([
		Kind.Heading,
		Kind.Paragraph,
		Kind.List,
		Kind.ListItem,
		Kind.Task,
		Kind.Quote,
		Kind.Callout,
	]).has(block.kind) && proseLength > 0;
	const statistics = new Set<DocumentBlock['kind']>([
		Kind.Heading,
		Kind.Paragraph,
		Kind.List,
		Kind.ListItem,
		Kind.Task,
		Kind.Quote,
		Kind.Callout,
		Kind.Table,
		Kind.Code,
		Kind.Mermaid,
	]).has(block.kind);
	return {
		keywords: proseAnalysis,
		statistics,
		sourceDetails: true,
	};
}

export function isProjectionRow(
	block: DocumentBlock,
	visibleKinds: Set<DocumentBlock['kind']>,
	showFrontmatterSummary: boolean,
): boolean {
	if (block.detail?.commentOnly) return false;
	if (block.kind === Kind.Heading) return true;
	if (block.kind === Kind.Frontmatter) return showFrontmatterSummary;
	if (block.kind === Kind.ListItem) return visibleKinds.has(Kind.List);
	return visibleKinds.has(block.kind);
}

export function firstProjectedId(
	blocks: DocumentBlock[],
	visible: Set<string>,
	visibleKinds: Set<DocumentBlock['kind']>,
	showFrontmatterSummary: boolean,
): string | null {
	let structuralFallback: string | null = null;
	const visit = (items: DocumentBlock[]): string | null => {
		for (const item of items) {
			if (!visible.has(item.id)) continue;
			if (isProjectionRow(item, visibleKinds, showFrontmatterSummary)) {
				if (item.kind !== Kind.Heading && item.kind !== Kind.Frontmatter) return item.id;
				structuralFallback ??= item.id;
			}
			const child = visit(item.children ?? []);
			if (child) return child;
		}
		return null;
	};
	return visit(blocks) ?? structuralFallback;
}

export function formatPropertyValue(
	rawValue: string,
	valueType: BlockDetail['propertyValueType'],
	config: FileAtlasConfig,
): string {
	const value = rawValue.replace(/^(['"])(.*)\1$/, '$2').trim();
	if (valueType === 'boolean') {
		return value.toLowerCase() === 'true'
			? config.identity.labels.yes
			: config.identity.labels.no;
	}
	if (valueType === 'vault-link') return cleanInlineMarkdown(value);
	if (valueType === 'url') {
		const url = safeUrl(value);
		return joinParts(
			providerLabel(url?.hostname, config),
			decodedSlug(url),
		) ?? value;
	}
	if (valueType !== 'date') return value;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	const hasTime = /[T\s]\d{1,2}:\d{2}/.test(value);
	const options: Intl.DateTimeFormatOptions = {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC',
	};
	if (hasTime) {
		options.hour = 'numeric';
		options.minute = '2-digit';
	}
	return new Intl.DateTimeFormat('en-NZ', options)
		.format(date)
		.replace(',', ' ·');
}

function tableHeaders(source: string): string[] {
	const first = source.split(/\r?\n/).find((line) => line.trim().startsWith('|'));
	if (!first) return [];
	return first
		.trim()
		.replace(/^\||\|$/g, '')
		.split('|')
		.map((cell) => cleanInlineMarkdown(cell))
		.filter(Boolean);
}

function declarationIdentity(code: string): string {
	const declaration = code.match(
		/^\s*(?:export\s+)?(?:default\s+)?(interface|class|type|enum|function|const|let|var)\s+([A-Za-z_$][\w$]*)/m,
	);
	if (!declaration) return '';
	const [, kind, name] = declaration;
	return kind === 'interface' || kind === 'class' || kind === 'type' || kind === 'enum'
		? `${name} ${kind}`
		: `${kind} ${name}`;
}

function mermaidSummary(source: string): { primary: string; nodeCount: number } {
	const body = unfenced(source);
	const labels = new Map<string, string>();
	for (const match of body.matchAll(/\b([A-Za-z0-9_-]+)\s*[\[(\{]([^\])}]+)[\])}]/g)) {
		labels.set(match[1], cleanInlineMarkdown(match[2]));
	}
	const edges: Array<[string, string]> = [];
	for (const line of body.split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z0-9_-]+)(?:\[[^\]]+\])?\s*[-=.]+>\s*([A-Za-z0-9_-]+)/);
		if (match) edges.push([match[1], match[2]]);
	}
	const nodeIds = new Set<string>();
	const indegree = new Map<string, number>();
	const outdegree = new Map<string, number>();
	for (const [from, to] of edges) {
		nodeIds.add(from);
		nodeIds.add(to);
		indegree.set(to, (indegree.get(to) ?? 0) + 1);
		outdegree.set(from, (outdegree.get(from) ?? 0) + 1);
	}
	for (const id of labels.keys()) nodeIds.add(id);
	const root = [...nodeIds].find((id) => !indegree.has(id)) ?? edges[0]?.[0];
	const hub = [...outdegree.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? edges[0]?.[1];
	const rootLabel = root ? labels.get(root) ?? root : '';
	const hubLabel = hub ? labels.get(hub) ?? hub : '';
	return {
		primary: rootLabel && hubLabel && rootLabel !== hubLabel
			? `${rootLabel} → ${hubLabel}`
			: rootLabel || hubLabel,
		nodeCount: nodeIds.size,
	};
}

function humanizeFormula(source: string): string {
	return source
		.replace(/^\s*\$\$|\$\$\s*$/g, '')
		.replace(/\\operatorname\{([^}]+)\}\s*\{([^}]+)\}/g, '$1($2)')
		.replace(/\\operatorname\{([^}]+)\}/g, '$1')
		.replace(/\\(?:left|right)/g, '')
		.replace(/\\geq?/g, '≥')
		.replace(/\\leq?/g, '≤')
		.replace(/\\times/g, '×')
		.replace(/[{}]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function providerLabel(domain: string | undefined, config: FileAtlasConfig): string | undefined {
	if (!domain) return undefined;
	const lower = domain.toLowerCase();
	return (
		config.identity.providers[lower] ??
		config.identity.providers[lower.replace(/^www\./, '')] ??
		lower.replace(/^www\./, '')
	);
}

function githubIdentity(url: URL | null): string | undefined {
	if (!url || url.hostname.replace(/^www\./, '') !== 'github.com') return undefined;
	const parts = url.pathname.split('/').filter(Boolean);
	if (parts.length < 2) return undefined;
	return `${decodePart(parts[0])}/${decodePart(parts[1])}`;
}

function decodedSlug(url: URL | null): string | undefined {
	if (!url) return undefined;
	const parts = url.pathname.split('/').filter(Boolean);
	if (!parts.length) return undefined;
	const slug = decodePart(parts[parts.length - 1]).replace(/[_-]+/g, ' ').trim();
	if (!slug) return undefined;
	return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function cleanCompanionTitle(
	title: string | undefined,
	config: FileAtlasConfig,
): string | undefined {
	if (!title) return undefined;
	let clean = title.trim();
	for (const pattern of config.identity.companionTitleSuffixPatterns) {
		try {
			clean = clean.replace(new RegExp(pattern, 'i'), '').trim();
		} catch {
			// Invalid owner config should not break deterministic identity fallback.
		}
	}
	return clean || undefined;
}

function isPlaceholderTitle(
	title: string | undefined,
	config: FileAtlasConfig,
): boolean {
	if (!title) return false;
	for (const pattern of config.identity.placeholderTitlePatterns) {
		try {
			if (new RegExp(pattern, 'i').test(title)) return true;
		} catch {
			// Invalid owner config should not break deterministic identity fallback.
		}
	}
	return false;
}

function safeUrl(target: string): URL | null {
	try {
		return new URL(target.startsWith('//') ? `https:${target}` : target);
	} catch {
		return null;
	}
}

function readableFragment(fragment: string | undefined): string | undefined {
	if (!fragment) return undefined;
	const value = decodePart(fragment.replace(/^#\^?/, '')).trim();
	return value || undefined;
}

function humanizeKey(key: string): string {
	const clean = key.replace(/[_-]+/g, ' ').trim();
	return clean.replace(/\b\w/g, (character) => character.toUpperCase());
}

function firstMeaningfulLine(source: string): string {
	return source
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean) ?? '';
}

function unfenced(source: string): string {
	return source
		.replace(/^\s*```[^\n]*\n?/, '')
		.replace(/\n?```\s*$/, '')
		.trim();
}

function basename(target: string): string {
	const clean = target.split('#')[0].split('?')[0].replace(/\\/g, '/');
	return decodePart(clean.split('/').filter(Boolean).pop() ?? clean);
}

function stem(target: string): string {
	return basename(target).replace(/\.[^.]+$/, '');
}

function dirname(target: string): string | undefined {
	const clean = target.split('#')[0].split('?')[0].replace(/\\/g, '/');
	const parts = clean.split('/').filter(Boolean);
	if (parts.length <= 1) return undefined;
	return decodePart(parts.slice(0, -1).join('/'));
}

function decodePart(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
}

function titleCase(value: string): string {
	if (!value) return value;
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function countLabel(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function joinParts(...parts: Array<string | undefined>): string | undefined {
	const present = parts.filter((part): part is string => Boolean(part));
	return present.length ? present.join(' · ') : undefined;
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}
