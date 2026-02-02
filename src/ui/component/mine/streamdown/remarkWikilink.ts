/**
 * Remark plugin: parses Obsidian-style [[wikilink]] and [[path|alias]] in text
 * into markdown link nodes. Rendered links use #peak-wikilink=... and class
 * "peak-wikilink" so the host can intercept clicks and open in Obsidian.
 */

import type { Root, Text, Link, PhrasingContent } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

const PEAK_WIKILINK_PREFIX = '#peak-wikilink=';
const PEAK_WIKILINK_CLASS = 'peak-wikilink';

/**
 * Splits a text string by [[path]] and [[path|alias]] and returns an array
 * of phrasing content (text and link nodes). Does not touch code blocks.
 */
function splitTextByWikilinks(value: string): PhrasingContent[] {
	const out: PhrasingContent[] = [];
	let pos = 0;

	while (pos < value.length) {
		const start = value.indexOf('[[', pos);
		if (start === -1) {
			if (pos < value.length) {
				out.push({ type: 'text', value: value.slice(pos) });
			}
			break;
		}
		if (start > pos) {
			out.push({ type: 'text', value: value.slice(pos, start) });
		}

		const end = value.indexOf(']]', start + 2);
		if (end === -1) {
			out.push({ type: 'text', value: value.slice(start) });
			break;
		}

		const inner = value.slice(start + 2, end);
		const pipeIdx = inner.indexOf('|');
		const targetRaw = pipeIdx === -1 ? inner : inner.slice(0, pipeIdx);
		const aliasRaw = pipeIdx === -1 ? '' : inner.slice(pipeIdx + 1);
		const target = (targetRaw ?? '').trim();
		const alias = (aliasRaw ?? '').trim();

		if (!target) {
			out.push({ type: 'text', value: value.slice(start, end + 2) });
			pos = end + 2;
			continue;
		}

		const display = alias ? `[[${alias}]]` : `[[${target}]]`;
		const url = `${PEAK_WIKILINK_PREFIX}${encodeURIComponent(target)}`;

		const linkNode: Link = {
			type: 'link',
			url,
			title: null,
			children: [{ type: 'text', value: display }],
		};
		(linkNode as Link & { data?: { hProperties?: Record<string, unknown> } }).data = {
			hProperties: { className: PEAK_WIKILINK_CLASS },
		};
		out.push(linkNode);
		pos = end + 2;
	}

	return out;
}

/**
 * Remark plugin to turn [[wikilink]] and [[path|alias]] in text nodes into
 * markdown links. Skips text inside link nodes. Uses #peak-wikilink=... and
 * class "peak-wikilink" for host click handling.
 */
export const remarkWikilink: Plugin<[], Root> = function remarkWikilink() {
	return (tree: Root) => {
		visit(tree, 'text', (node: Text, index, parent) => {
			if (parent == null || typeof index !== 'number') return;
			if (parent.type === 'link') return;
			const value = (node as Text).value;
			if (typeof value !== 'string' || value.indexOf('[[') === -1) return;

			const children = splitTextByWikilinks(value);
			if (children.length === 0) return;
			if (children.length === 1 && children[0].type === 'text' && (children[0] as Text).value === value) return;

			const siblings = parent.children as PhrasingContent[];
			siblings.splice(index, 1, ...children);
		});
	};
};
