/**
 * Minimal wiki-link resolver for the filesystem vault.
 *
 * Resolution rule: a target name like `profile-registry` matches the first file
 * (in lexicographic order) whose basename without extension equals the target,
 * case-insensitive.
 */

import * as path from 'node:path';
import { listFiles, readFile } from './fs-vault-reader';

export interface WikiLink {
    target: string;
    alias?: string;
}

export interface LinkIndex {
    /** vault-relative path → list of wiki links it contains */
    forwardLinks: Map<string, WikiLink[]>;
    /** vault-relative path → list of vault-relative paths that link TO it */
    backLinks: Map<string, string[]>;
    /** lowercase basename-without-ext → vault-relative path (first match wins) */
    basenameIndex: Map<string, string>;
}

const WIKI_LINK_RE = /(?<!\\)\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function extractWikiLinks(text: string): WikiLink[] {
    const out: WikiLink[] = [];
    const re = new RegExp(WIKI_LINK_RE);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        out.push({ target: m[1].trim(), alias: m[2]?.trim() });
    }
    return out;
}

export function buildLinkIndex(root: string): LinkIndex {
    const files = listFiles(root);
    const forwardLinks = new Map<string, WikiLink[]>();
    const backLinks = new Map<string, string[]>();
    const basenameIndex = new Map<string, string>();

    // Pass 1: build basenameIndex from all files.
    for (const rel of files) {
        const base = path.basename(rel, '.md').toLowerCase();
        if (!basenameIndex.has(base)) {
            basenameIndex.set(base, rel);
        }
    }

    // Pass 2: extract forward links from each file.
    for (const rel of files) {
        const content = readFile(root, rel);
        const links = extractWikiLinks(content);
        forwardLinks.set(rel, links);
    }

    // Pass 3: derive backlinks.
    for (const [fromPath, links] of forwardLinks.entries()) {
        for (const link of links) {
            const resolvedTo = basenameIndex.get(link.target.toLowerCase());
            if (!resolvedTo) continue;
            const list = backLinks.get(resolvedTo) ?? [];
            if (!list.includes(fromPath)) list.push(fromPath);
            backLinks.set(resolvedTo, list);
        }
    }

    return { forwardLinks, backLinks, basenameIndex };
}

export function resolveLink(index: LinkIndex, target: string): string | null {
    return index.basenameIndex.get(target.toLowerCase()) ?? null;
}

export function listBacklinks(index: LinkIndex, vaultRelPath: string): string[] {
    return (index.backLinks.get(vaultRelPath) ?? []).slice().sort();
}
