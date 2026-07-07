/**
 * T5 (2026-07-07 heading-mode UI): copy strings for the heading-mode
 * surface. Centralized here so scattered UI files don't hardcode inline
 * i18n. This matches the `configurability` convention: a single-file
 * strings module local to the heading-mode folder.
 */
export const HEADING_MODE_STRINGS = {
	emptyTreeTitle: 'This document has no headings',
	emptyTreeDescription: 'Add an H1/H2/H3 marker in the note, or use All-mode search.',
	emptyDetailHint: 'Type to search inside this document.',
	emptyDetailNoActive: 'Select a section on the left to see snippets.',
	totalMatchesLabel: (n: number) => `${n} match${n === 1 ? '' : 'es'} in document`,
	sectionMatchesLabel: (n: number) => `${n} match${n === 1 ? '' : 'es'}`,
	linksFooterTitle: 'Link positions',
	outgoingHeader: 'Outgoing',
	backlinkHeader: 'Backlinks',
	noOutgoingLinks: 'No outgoing links in this document.',
	noBacklinks: 'No indexed backlinks.',
	sectionRangeSeparator: '–',
} as const;
