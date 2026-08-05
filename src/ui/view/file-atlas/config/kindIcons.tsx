/**
 * File Atlas — kind → Lucide icon component map.
 *
 * Kept separate from fileAtlasConfig.ts (data) because React components can't
 * live in the JSON config template. Keyed by RawBlockKind. Lucide icons only
 * per the project UI rules — no emoji, no hand-rolled marks.
 */

import React from 'react';
import {
	Braces,
	FileKey2,
	Tag,
	Heading1,
	Heading2,
	Heading3,
	Heading4,
	Heading5,
	Heading6,
	Pilcrow,
	ListTree,
	List,
	ListChecks,
	TextQuote,
	MessageSquareWarning,
	Table2,
	FileCode2,
	Sigma,
	Workflow,
	Image,
	PanelsTopLeft,
	Paperclip,
	FileSymlink,
	ExternalLink,
	Superscript,
	Circle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RawBlockKind } from '@/core/document/atlas/types';

export type IconComponent = LucideIcon;

const KIND_ICONS: Record<string, IconComponent> = {
	[RawBlockKind.Frontmatter]: Braces,
	[RawBlockKind.Property]: FileKey2,
	[RawBlockKind.Tag]: Tag,
	[RawBlockKind.Paragraph]: Pilcrow,
	[RawBlockKind.List]: ListTree,
	[RawBlockKind.ListItem]: List,
	[RawBlockKind.Quote]: TextQuote,
	[RawBlockKind.Callout]: MessageSquareWarning,
	[RawBlockKind.Task]: ListChecks,
	[RawBlockKind.Table]: Table2,
	[RawBlockKind.Code]: FileCode2,
	[RawBlockKind.Math]: Sigma,
	[RawBlockKind.Mermaid]: Workflow,
	[RawBlockKind.Image]: Image,
	[RawBlockKind.Embed]: PanelsTopLeft,
	[RawBlockKind.Attachment]: Paperclip,
	[RawBlockKind.VaultLink]: FileSymlink,
	[RawBlockKind.ExternalLink]: ExternalLink,
	[RawBlockKind.Footnote]: Superscript,
};

const HEADING_ICONS: Record<number, IconComponent> = {
	1: Heading1,
	2: Heading2,
	3: Heading3,
	4: Heading4,
	5: Heading5,
	6: Heading6,
};

/** Editorial-outline icon for a kind, with heading level preserved. */
export function iconForKind(kind: string, headingLevel?: number): IconComponent {
	if (kind === RawBlockKind.Heading) return HEADING_ICONS[headingLevel ?? 2] ?? Heading2;
	return KIND_ICONS[kind] ?? Circle;
}
