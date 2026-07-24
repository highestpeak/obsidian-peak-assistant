/**
 * File Atlas — kind → Lucide icon component map.
 *
 * Kept separate from fileAtlasConfig.ts (data) because React components can't
 * live in the JSON config template. Keyed by RawBlockKind. Lucide icons only
 * per the project UI rules — no emoji, no hand-rolled marks.
 */

import React from 'react';
import {
	Heading as HeadingIcon,
	Braces,
	FileText,
	Hash,
	Pilcrow,
	List as ListIcon,
	TextQuote,
	AlertTriangle,
	CheckSquare,
	Table as TableIcon,
	Code2,
	Sigma,
	GitBranch,
	Image as ImageIcon,
	FileStack,
	Paperclip,
	Link as LinkIcon,
	Globe,
	Superscript,
	CircleDot,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RawBlockKind } from '@/core/document/atlas/types';

export type IconComponent = LucideIcon;

const KIND_ICONS: Record<string, IconComponent> = {
	[RawBlockKind.Heading]: HeadingIcon,
	[RawBlockKind.Frontmatter]: Braces,
	[RawBlockKind.Property]: FileText,
	[RawBlockKind.Tag]: Hash,
	[RawBlockKind.Paragraph]: Pilcrow,
	[RawBlockKind.List]: ListIcon,
	[RawBlockKind.Quote]: TextQuote,
	[RawBlockKind.Callout]: AlertTriangle,
	[RawBlockKind.Task]: CheckSquare,
	[RawBlockKind.Table]: TableIcon,
	[RawBlockKind.Code]: Code2,
	[RawBlockKind.Math]: Sigma,
	[RawBlockKind.Mermaid]: GitBranch,
	[RawBlockKind.Image]: ImageIcon,
	[RawBlockKind.Embed]: FileStack,
	[RawBlockKind.Attachment]: Paperclip,
	[RawBlockKind.VaultLink]: LinkIcon,
	[RawBlockKind.ExternalLink]: Globe,
	[RawBlockKind.Footnote]: Superscript,
};

/** Icon component for a kind, falling back to a neutral dot. */
export function iconForKind(kind: string): IconComponent {
	return KIND_ICONS[kind] ?? CircleDot;
}
