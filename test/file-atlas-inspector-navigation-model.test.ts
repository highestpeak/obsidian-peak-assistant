import assert from 'node:assert/strict';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind as Kind } from '@/core/document/atlas/types';
import type { AtlasCopilotSuggestion } from '@/ui/view/file-atlas/FileAtlasHostPort';
import {
	atlasBlockForSuggestion,
	atlasScopeKind,
	buildAtlasElementContext,
	compactStructuredPreviewRows,
	filterAtlasQuickActions,
	groupAtlasCopilotSuggestions,
} from '@/ui/view/file-atlas/atlasInspectorModel';

function block(
	id: string,
	kind: DocumentBlock['kind'],
	from: number,
	to: number,
	children: DocumentBlock[] = [],
): DocumentBlock {
	return {
		id,
		kind,
		title: id,
		source: id,
		anchor: {
			filePath: 'fixture.md',
			blockId: id,
			nearestHeading: null,
			blockType: kind,
			ordinalInHeading: 0,
			contentHash: id,
			lineStart: 1,
			lineEnd: 1,
			sourceFrom: from,
			sourceTo: to,
			status: 'active',
		},
		...(children.length > 0 ? { children } : {}),
	};
}

function suggestion(
	findingId: string,
	targetFrom: number | null,
	targetTo: number | null,
	targetBlockId: string | null = null,
): AtlasCopilotSuggestion {
	return {
		findingId,
		targetBlockId,
		targetFrom,
		targetTo,
		title: findingId,
		summary: '',
		targetLabel: findingId,
		evidenceLabel: 'fixture',
		state: 'active',
		priority: 1,
	};
}

const resource = block('resource-a', Kind.VaultLink, 27, 31);
const itemA = block('item-a', Kind.ListItem, 24, 35, [resource]);
const itemB = block('item-b', Kind.Task, 36, 45);
const list = block('list', Kind.List, 22, 48, [itemA, itemB]);
const intro = block('intro', Kind.Paragraph, 10, 20);
const section = block('section', Kind.Heading, 0, 9, [intro, list]);
const other = block('other', Kind.Heading, 101, 109, [
	block('other-copy', Kind.Paragraph, 110, 150),
]);
const blocks = [section, other];

const context = buildAtlasElementContext(blocks, itemA.id);
assert.deepEqual(context.breadcrumb.map((candidate) => candidate.id), ['section', 'list', 'item-a']);
assert.equal(context.parent?.id, list.id);
assert.equal(context.section?.id, section.id);
assert.deepEqual(context.nearby.map((candidate) => candidate.id), [itemB.id]);
assert.deepEqual(context.children.map((candidate) => candidate.id), [resource.id]);
assert.deepEqual(context.resources.map((candidate) => candidate.id), [resource.id]);

const direct = suggestion('direct', 28, 29);
const sameSection = suggestion('same-section', 12, 14);
const elsewhere = suggestion('elsewhere', 120, 125);
const documentOnly = suggestion('document-only', null, null);
const groups = groupAtlasCopilotSuggestions(
	[direct, sameSection, elsewhere, documentOnly],
	itemA,
	context.section,
);
assert.deepEqual(groups.selection.map((candidate) => candidate.findingId), ['direct']);
assert.deepEqual(groups.section.map((candidate) => candidate.findingId), ['same-section']);
assert.deepEqual(
	groups.document.map((candidate) => candidate.findingId),
	['elsewhere', 'document-only'],
);

const sectionGroups = groupAtlasCopilotSuggestions([direct, sameSection], section, section);
assert.deepEqual(
	sectionGroups.selection.map((candidate) => candidate.findingId),
	[],
	'a heading selection owns only its heading line, not every descendant finding',
);
assert.deepEqual(
	sectionGroups.section.map((candidate) => candidate.findingId),
	['direct', 'same-section'],
);

assert.deepEqual(
	compactStructuredPreviewRows(section).map((candidate) => candidate.id),
	['intro', 'item-a', 'item-b'],
	'compact previews flatten list containers and omit repeated extracted resources',
);

const quickActions = [
	{ capabilityId: 'composer.prose.polish', title: '润色文本' },
	{ capabilityId: 'composer.link.tidy', title: '整理链接' },
] as const;
assert.deepEqual(
	filterAtlasQuickActions([...quickActions], Kind.VaultLink).map((action) => action.capabilityId),
	['composer.link.tidy'],
	'a Vault Link does not expose owner-paragraph prose actions as element actions',
);
assert.equal(filterAtlasQuickActions([...quickActions], Kind.Paragraph).length, 2);

assert.equal(atlasBlockForSuggestion(blocks, direct)?.id, resource.id);
assert.equal(atlasBlockForSuggestion(blocks, suggestion('exact', 0, 200, itemB.id))?.id, itemB.id);
assert.equal(atlasBlockForSuggestion(blocks, documentOnly), null);
assert.equal(atlasScopeKind(section), 'section');
assert.equal(atlasScopeKind(itemA), 'item');
assert.equal(atlasScopeKind(resource), 'resource');
assert.equal(atlasScopeKind(intro), 'block');

console.log('PASS: File Atlas Inspector context and Copilot navigation model');
