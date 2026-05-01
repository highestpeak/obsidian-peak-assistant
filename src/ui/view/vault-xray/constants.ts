import type { ElementType } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import type { LintSeverity } from '@/service/lint/types';

export const SIGNAL_LABELS: Record<string, string> = {
	'S-ORPHAN': 'Orphan Notes',
	'S-SOFT-ORPHAN': 'Soft Orphans',
	'S-BROKEN-LINK': 'Broken Links',
	'S-MISSING-BACKLINK': 'Missing Backlinks',
	'S-ISLAND-CLUSTER': 'Island Clusters',
	'S-FRAGILE-BRIDGE': 'Fragile Bridges',
	'C-EMPTY': 'Empty Notes',
	'C-STUB': 'Stub Notes',
	'C-OVERSIZED': 'Oversized Notes',
	'C-DUPLICATE': 'Duplicate Notes',
	'C-FRONTMATTER-MISSING': 'Missing Frontmatter',
	'C-NAMING-VIOLATION': 'Naming Violations',
	'T-STALE-HUB': 'Stale Hubs',
	'T-DECAYING-BRIDGE': 'Decaying Bridges',
	'T-ABANDONED-CLUSTER': 'Abandoned Clusters',
	'T-RECENT-DRIFT': 'Recent Drift',
	'T-ABANDONED-FOLDER': 'Abandoned Folders',
	'M-COVERAGE-GAP': 'Coverage Gaps',
	'M-LOW-COHESION': 'Low Cohesion',
	'M-CONTRADICTION': 'Contradictions',
	'M-PHANTOM-NODE': 'Phantom Nodes',
	'M-SEMANTIC-ISOLATION': 'Semantic Isolation',
	'M-REDUNDANT-HUBS': 'Redundant Hubs',
	'G-UNTAGGED': 'Untagged Notes',
	'G-TAG-ISLAND': 'Tag Islands',
	'G-TAG-REDUNDANCY': 'Tag Redundancy',
	'G-TAG-EXPLOSION': 'Tag Explosion',
	'G-NOISE-TAGS': 'Noise Tags',
};

export const SEVERITY_CONFIG: Record<LintSeverity, { icon: ElementType; color: string; label: string }> = {
	error: { icon: AlertCircle, color: 'pktw-text-red-500', label: 'Error' },
	warning: { icon: AlertTriangle, color: 'pktw-text-amber-500', label: 'Warning' },
	info: { icon: Info, color: 'pktw-text-muted-foreground', label: 'Info' },
};

export const SEVERITY_ORDER: Record<LintSeverity, number> = {
	error: 0,
	warning: 1,
	info: 2,
};
