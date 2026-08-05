import assert from 'assert';
import { parseDocumentBlocks } from '@/core/document/atlas/documentBlockParser';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind as Kind } from '@/core/document/atlas/types';
import {
	atlasSearchText,
	displayIdentity,
	firstProjectedId,
	inspectorCardPolicy,
	isProjectionRow,
} from '@/ui/view/file-atlas/atlasDisplayModel';
import {
	computeVisibility,
	groupFrontmatter,
} from '@/ui/view/file-atlas/atlasTreeModel';
import {
	DEFAULT_FILE_ATLAS_CONFIG as config,
} from '@/ui/view/file-atlas/config/fileAtlasConfig';

function flatten(blocks: DocumentBlock[]): DocumentBlock[] {
	const out: DocumentBlock[] = [];
	const visit = (items: DocumentBlock[]): void => {
		for (const item of items) {
			out.push(item);
			if (item.children) visit(item.children);
		}
	};
	visit(blocks);
	return out;
}

function find(blocks: DocumentBlock[], kind: DocumentBlock['kind']): DocumentBlock[] {
	return flatten(blocks).filter((block) => block.kind === kind);
}

const markdown = [
	'---',
	'created: 2026-07-30 15:55:00',
	'published: false',
	'tags: [peak/file-atlas, qa]',
	'source_note: "[[Peak Composer Visual Parity QA]]"',
	'---',
	'',
	'# Heading [[Target Note|视觉基准]]',
	'',
	'Paragraph with [OpenAI docs](https://platform.openai.com/docs/overview).',
	'',
	'- Parent [[Target Note|Composer 视觉基准]]',
	'  - nested item',
	'- [ ] Ship the Inspector',
	'',
	'> Natural quote preview.',
	'',
	'> [!warning] 长内容警告',
	'> One paragraph with [MDN](https://developer.mozilla.org/).',
	'',
	'| 能力 | 当前对象 |',
	'| --- | --- |',
	'| 导航 | Heading |',
	'',
	'```typescript',
	'interface AtlasDisplayIdentity {',
	'  primary: string;',
	'}',
	'```',
	'',
	'```mermaid',
	'flowchart LR',
	'  A[Source block] --> B[Parsed object]',
	'  B --> C[Display identity]',
	'  C --> D[Tree row]',
	'  C --> E[Inspector]',
	'```',
	'',
	'$$',
	'\\operatorname{display}{x} = \\operatorname{identity}{x}',
	'$$',
	'',
	'![Auckland 路线图](public-image/route.png)',
	'',
	'![[Assets/map.png|Auckland 路线图|720]]',
	'',
	'![[Target Note#Knowledge architecture]]',
	'',
	'![[Assets/pkm-composer.canvas]]',
	'',
	'![[Assets/pkm-composer.base]]',
	'',
	'![[A-resources/guide.pdf]]',
	'',
	'[[Target Note|PKM 产品分析]]',
	'',
	'[[Plain Note]]',
	'',
	'[[Target Note#Graph formulas|图算法与公式]]',
	'',
	'[Obsidian API repository](https://github.com/obsidianmd/obsidian-api)',
	'',
	'https://en.wikipedia.org/wiki/Personal_knowledge_management#References | 个人知识管理 - 维基百科',
	'',
	'[Fetching Title#test](https://github.com/danny0838/webscrapbook)',
	'',
	'Footnote text.[^atlas-source]',
	'',
	'Another reference.[^atlas-source]',
	'',
	'[^atlas-source]: 这是来源脚注，包含 [design reference](https://example.com/source).',
	'',
	'<div class="atlas-review-html">',
	'  这是一段 HTML block。',
	'</div>',
	'',
	'<!-- comment-only block -->',
].join('\n');

const parsed = parseDocumentBlocks(markdown, 'fixture.md');
const blocks = groupFrontmatter(parsed.blocks, config.strings.frontmatterTitle);

const metadata = blocks[0];
assert.strictEqual(displayIdentity(metadata, config).primary, 'Metadata');
assert.strictEqual(displayIdentity(metadata, config).secondary, '4 properties · 2 tags');
assert.strictEqual(metadata.detail?.frontmatterTagCount, 2);
assert.ok(
	(metadata.children ?? []).every((block) => block.kind !== Kind.Tag),
	'frontmatter tag values remain summarized by the Tags property instead of repeating as rows',
);

const properties = find(blocks, Kind.Property);
const created = properties.find((block) => block.detail?.propertyKey === 'created')!;
const published = properties.find((block) => block.detail?.propertyKey === 'published')!;
assert.strictEqual(displayIdentity(created, config).primary, 'Created');
assert.match(displayIdentity(created, config).secondary ?? '', /30 Jul 2026/);
assert.strictEqual(displayIdentity(published, config).secondary, 'No');

const heading = find(blocks, Kind.Heading)[0];
assert.strictEqual(displayIdentity(heading, config).primary, 'Heading 视觉基准');
assert.strictEqual(find([heading], Kind.VaultLink)[0].detail?.authoredLabel, '视觉基准');

const paragraph = find(blocks, Kind.Paragraph)
	.find((block) => block.source.startsWith('Paragraph with'))!;
assert.strictEqual(
	paragraph.children?.[0].kind,
	Kind.ExternalLink,
	'mixed prose owns its extracted resource instead of creating an adjacent sibling',
);
assert.strictEqual(displayIdentity(paragraph.children![0], config).primary, 'OpenAI docs');

const lists = find(blocks, Kind.List);
assert.strictEqual(displayIdentity(lists[1], config).primary, 'Bulleted list');
assert.match(displayIdentity(lists[1], config).secondary ?? '', /1 item/);
const linkedItem = find(blocks, Kind.ListItem)
	.find((block) => block.source.includes('Composer'))!;
assert.strictEqual(
	displayIdentity(linkedItem, config).primary,
	'Parent Composer 视觉基准',
);

const task = find(blocks, Kind.Task)[0];
assert.strictEqual(displayIdentity(task, config).primary, 'Ship the Inspector');
assert.match(displayIdentity(task, config).secondary ?? '', /^Open/);

const quote = find(blocks, Kind.Quote)[0];
assert.strictEqual(displayIdentity(quote, config).primary, 'Natural quote preview.');

const callout = find(blocks, Kind.Callout)[0];
assert.strictEqual(displayIdentity(callout, config).primary, '长内容警告');
assert.match(displayIdentity(callout, config).secondary ?? '', /^Warning · 1 paragraph$/);

const table = find(blocks, Kind.Table)[0];
assert.strictEqual(displayIdentity(table, config).primary, 'Table');
assert.strictEqual(displayIdentity(table, config).secondary, '1 × 2 · 能力 / 当前对象');

const code = find(blocks, Kind.Code)[0];
assert.strictEqual(displayIdentity(code, config).primary, 'AtlasDisplayIdentity interface');
assert.strictEqual(displayIdentity(code, config).secondary, 'TypeScript · 3 lines');

const mermaid = find(blocks, Kind.Mermaid)[0];
assert.strictEqual(displayIdentity(mermaid, config).primary, 'Source block → Display identity');
assert.strictEqual(displayIdentity(mermaid, config).secondary, 'Flowchart · 5 nodes');

const math = find(blocks, Kind.Math)[0];
assert.strictEqual(displayIdentity(math, config).primary, 'display(x) = identity(x)');
assert.strictEqual(inspectorCardPolicy(math).statistics, false);

const images = find(blocks, Kind.Image);
assert.strictEqual(displayIdentity(images[0], config).primary, 'Auckland 路线图');
assert.strictEqual(displayIdentity(images[0], config).secondary, 'PNG · route.png');
assert.strictEqual(displayIdentity(images[1], config).primary, 'Auckland 路线图');
assert.strictEqual(displayIdentity(images[1], config).secondary, 'PNG · map.png');

const embeds = find(blocks, Kind.Embed);
const noteSection = embeds.find((block) => block.detail?.linkFragment)!;
const canvas = embeds.find((block) => block.detail?.fileTarget?.endsWith('.canvas'))!;
const base = embeds.find((block) => block.detail?.fileTarget?.endsWith('.base'))!;
assert.strictEqual(displayIdentity(noteSection, config).primary, 'Knowledge architecture');
assert.strictEqual(displayIdentity(noteSection, config).secondary, 'Target Note · note section');
assert.strictEqual(displayIdentity(canvas, config).secondary, 'Canvas');
assert.strictEqual(displayIdentity(base, config).secondary, 'Base');

const attachment = find(blocks, Kind.Attachment)[0];
assert.strictEqual(displayIdentity(attachment, config).primary, 'guide.pdf');
assert.strictEqual(displayIdentity(attachment, config).secondary, 'PDF · A-resources');

const vaultLinks = find(blocks, Kind.VaultLink);
const alias = vaultLinks.find((block) => block.detail?.authoredLabel === 'PKM 产品分析')!;
const plain = vaultLinks.find((block) => block.detail?.target === 'Plain Note')!;
const fragment = vaultLinks.find((block) => block.detail?.authoredLabel === '图算法与公式')!;
assert.strictEqual(displayIdentity(alias, config).primary, 'PKM 产品分析');
assert.strictEqual(displayIdentity(alias, config).secondary, 'Target Note · Vault note');
assert.strictEqual(displayIdentity(plain, config).primary, 'Plain Note');
assert.strictEqual(displayIdentity(plain, config).secondary, undefined);
assert.strictEqual(displayIdentity(fragment, config).secondary, 'Target Note · Heading');

assert.deepStrictEqual(inspectorCardPolicy(heading), {
	keywords: true,
	statistics: true,
	sourceDetails: true,
});
assert.deepStrictEqual(inspectorCardPolicy(paragraph), {
	keywords: true,
	statistics: true,
	sourceDetails: true,
});

const externalLinks = find(blocks, Kind.ExternalLink);
const github = externalLinks.find((block) => block.detail?.target?.includes('obsidian-api'))!;
const wikipedia = externalLinks.find((block) => block.detail?.domain === 'en.wikipedia.org')!;
const placeholder = externalLinks.find((block) => block.detail?.target?.includes('webscrapbook'))!;
assert.strictEqual(displayIdentity(github, config).primary, 'Obsidian API repository');
assert.strictEqual(displayIdentity(github, config).secondary, 'GitHub');
assert.strictEqual(displayIdentity(wikipedia, config).primary, '个人知识管理');
assert.strictEqual(displayIdentity(wikipedia, config).secondary, 'Wikipedia · References');
assert.strictEqual(displayIdentity(placeholder, config).primary, 'danny0838/webscrapbook');
assert.deepStrictEqual(inspectorCardPolicy(wikipedia), {
	keywords: false,
	statistics: false,
	sourceDetails: true,
});
assert.match(atlasSearchText(wikipedia, config), /个人知识管理/);

const wikipediaTopLevel = find(parsed.blocks, Kind.ExternalLink).find(
	(block) => block.kind === Kind.ExternalLink
		&& block.detail?.domain === 'en.wikipedia.org',
);
assert.ok(wikipediaTopLevel, '`URL | title` produces one resource row');
assert.ok(
	!find(parsed.blocks, Kind.Paragraph)
		.some((block) => block.source.includes('wikipedia.org')),
	'`URL | title` does not retain a duplicate paragraph owner',
);

const footnote = find(blocks, Kind.Footnote)[0];
assert.match(displayIdentity(footnote, config).primary, /这是来源脚注/);
assert.strictEqual(displayIdentity(footnote, config).secondary, 'atlas-source · referenced twice');

const html = find(blocks, Kind.Paragraph)
	.find((block) => block.detail?.htmlBlock && !block.detail.commentOnly)!;
const comment = find(blocks, Kind.Paragraph)
	.find((block) => block.detail?.commentOnly)!;
assert.strictEqual(displayIdentity(html, config).primary, '这是一段 HTML block。');
const allKinds = new Set(config.presets.find((preset) => preset.id === 'all')!.kinds);
const visibility = computeVisibility(blocks, allKinds, '', config, {
	showFrontmatterSummary: true,
});
assert.ok(!visibility.visible.has(comment.id), 'comment-only HTML stays out of normal projection');

const resourceKinds = new Set(
	config.presets.find((preset) => preset.id === 'resources')!.kinds,
);
const resourceVisibility = computeVisibility(blocks, resourceKinds, '', config);
assert.strictEqual(
	isProjectionRow(metadata, resourceKinds, false),
	false,
	'Resources excludes frontmatter summary',
);
assert.ok(resourceVisibility.visible.has(paragraph.id), 'hidden owner keeps its resource reachable');
assert.strictEqual(isProjectionRow(paragraph, resourceKinds, false), false);
assert.strictEqual(isProjectionRow(paragraph.children![0], resourceKinds, false), true);
const ownerSearch = computeVisibility(
	blocks,
	resourceKinds,
	'paragraph with',
	config,
);
assert.ok(
	ownerSearch.visible.has(paragraph.children![0].id),
	'resource search includes promoted owner context',
);
const firstResourceId = firstProjectedId(
	blocks,
	resourceVisibility.visible,
	resourceKinds,
	false,
);
assert.ok(firstResourceId);
assert.notStrictEqual(firstResourceId, heading.id, 'focused presets select a meaningful row');

assert.deepStrictEqual(
	config.presets.map((preset) => preset.label),
	['Overview', 'Read', 'Actions', 'Resources', 'All elements'],
);
assert.deepStrictEqual(
	config.filterGroups.map((group) => group.title),
	['Content', 'Links & references', 'Media & files', 'Structured blocks', 'Metadata'],
);

console.log('PASS: File Atlas all-type display identity and projection contract');
