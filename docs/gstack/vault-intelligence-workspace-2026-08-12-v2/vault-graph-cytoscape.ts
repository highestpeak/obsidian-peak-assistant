import cytoscape, {
  type Core,
  type EdgeSingular,
  type ElementDefinition,
  type NodeSingular,
  type SingularElementArgument,
  type StylesheetStyle,
} from 'cytoscape';
import dagre from 'cytoscape-dagre';
import fcose from 'cytoscape-fcose';

cytoscape.use(fcose);
cytoscape.use(dagre);

type Detail = {
  title: string;
  status: string;
  primaryMetric: [string, string];
  facts: Array<[string, string]>;
  note: string;
};

type FileFilter = {
  key: string;
  label: string;
  counts: number[];
} | null;

type GraphCommand = {
  type?: 'filter' | 'focus' | 'reset';
  key?: string;
  label?: string;
  counts?: number[];
};

type GraphLayout = 'constellation' | 'flow-lr' | 'flow-tb' | 'orbit';

const communityOrder = ['life', 'product', 'tech', 'automation', 'publishing'] as const;
type CommunityKey = typeof communityOrder[number];

const communityMeta = {
  life: { label: 'Life & identity', count: 910, color: '#6652c9', fill: '#e9e4ff', topicFill: '#f7f5ff' },
  product: { label: 'Product & PKM', count: 501, color: '#2f70b7', fill: '#e2efff', topicFill: '#f3f8ff' },
  tech: { label: 'Technology knowledge', count: 623, color: '#24796b', fill: '#ddf2ec', topicFill: '#f1faf7' },
  automation: { label: 'Automation & cowork', count: 58, color: '#b86617', fill: '#ffead0', topicFill: '#fff7ed' },
  publishing: { label: 'Publishing', count: 14, color: '#a94b81', fill: '#f7dfed', topicFill: '#fff3f9' },
} as const;

const communityDetails: Record<string, Detail> = {
  life: {
    title: 'Life & identity',
    status: '910 notes · 43.2% of the sampled corpus',
    primaryMetric: ['910', 'notes in this community'],
    facts: [['564', 'journal notes'], ['111', 'IELTS / English'], ['405', 'links to Technology'], ['100', 'links to Product & PKM']],
    note: 'Daily reflection is structurally connected to technical learning and product work. The large community is represented by four topic nodes instead of rendering 910 files at once.',
  },
  product: {
    title: 'Product & PKM',
    status: '501 notes · 23.8% of the sampled corpus',
    primaryMetric: ['501', 'notes in this community'],
    facts: [['345', 'ideas / PKM'], ['43', 'best practices'], ['100', 'links to Life'], ['36', 'links to Technology']],
    note: 'Peak Assistant and knowledge-system notes make this community an important bridge between personal chronology and technical implementation.',
  },
  tech: {
    title: 'Technology knowledge',
    status: '623 notes · 29.6% of the sampled corpus',
    primaryMetric: ['623', 'notes in this community'],
    facts: [['104', 'tools / workflows'], ['104', 'problem solutions'], ['100', 'Java / backend'], ['77', 'AI / RAG']],
    note: 'Technology contains several dense topic hubs. Detail mode shows representative hubs; remaining files stay aggregated behind their topic counts.',
  },
  automation: {
    title: 'Automation & cowork',
    status: '58 notes · 2.8% of the sampled corpus',
    primaryMetric: ['58', 'notes in this community'],
    facts: [['48', 'job tracking'], ['10', 'tasks / operations'], ['3', 'cross-domain links'], ['0', 'strong bridge documents']],
    note: 'A small operational community with a weak explicit connection to Life & identity. Low connectivity may be intentional for task records.',
  },
  publishing: {
    title: 'Publishing',
    status: '14 notes · 0 resolved cross-domain links',
    primaryMetric: ['14', 'notes in this community'],
    facts: [['13', 'draft articles'], ['1', 'index note'], ['0', 'cross-domain links'], ['14', 'files to classify']],
    note: 'Publishing is isolated in the resolved Wikilink projection. That is inspectable evidence, not automatically an error.',
  },
};

const topicData = [
  ['life-journal', 'life', 'Journal & reflection', 564, 'Daily notes, reviews and personal chronology'],
  ['life-english', 'life', 'IELTS & English', 111, 'Language study and assessment records'],
  ['life-identity', 'life', 'Identity / WHOAMI', 99, 'Values, identity and long-term direction'],
  ['life-work', 'life', 'Work, migration & milestones', 136, 'Career, relocation and major events'],
  ['product-ideas', 'product', 'Ideas & knowledge systems', 345, 'PKM concepts, product ideas and system design'],
  ['product-practice', 'product', 'Best practices', 43, 'Reusable product and knowledge workflows'],
  ['product-philosophy', 'product', 'Development philosophy', 42, 'Principles and engineering-product decisions'],
  ['product-ux', 'product', 'UX & product analysis', 71, 'Interfaces, product reviews and interaction design'],
  ['tech-tools', 'tech', 'Tools & workflows', 104, 'Developer tools and operating workflows'],
  ['tech-solutions', 'tech', 'Problem solutions', 104, 'Reusable debugging and implementation notes'],
  ['tech-backend', 'tech', 'Java & backend', 100, 'Backend systems, Java and service design'],
  ['tech-ai', 'tech', 'AI & RAG', 77, 'Models, agents, retrieval and evaluation'],
  ['tech-network', 'tech', 'Network & databases', 49, 'Network and database foundations'],
  ['tech-coding', 'tech', 'Coding & algorithms', 59, 'Programming, algorithms and mathematics'],
  ['tech-other', 'tech', 'Other technical topics', 130, 'Graphics, operations and smaller technical clusters'],
  ['automation-jobs', 'automation', 'Job tracking', 48, 'Applications and role tracking'],
  ['automation-tasks', 'automation', 'Daily tasks & operations', 10, 'Digests, schedules and recurring work'],
  ['publishing-drafts', 'publishing', 'Draft articles', 13, 'Article drafts not yet connected to the main corpus'],
  ['publishing-index', 'publishing', 'Publishing index', 1, 'Entry point for the publishing root'],
] as const;

const bridgeData = [
  ['bridge-devlog', '1203-PeakAssistant-开发日志', '20 relations · 3 domains', 675, 315],
  ['bridge-readlist', '1012-ReadList', '77 relations · 3 domains', 385, 470],
  ['bridge-peak', 'AI-peak-assistant-obsidian', '25 relations · 3 domains', 900, 455],
  ['bridge-rag', '1-2-Tech Module-RAG', '19 relations · 3 domains', 650, 990],
] as const;

const overviewPositions = {
  life: { x: 210, y: 245 },
  product: { x: 1020, y: 220 },
  tech: { x: 650, y: 590 },
  automation: { x: 185, y: 715 },
  publishing: { x: 1065, y: 735 },
} as const;

const overviewTopicIds = [
  'life-journal',
  'life-identity',
  'life-work',
  'product-ideas',
  'product-practice',
  'tech-tools',
  'tech-ai',
  'automation-jobs',
  'publishing-drafts',
] as const;

const overviewTopicPositions: Record<string, { x: number; y: number }> = {
  'life-journal': { x: 70, y: 120 },
  'life-identity': { x: 360, y: 115 },
  'life-work': { x: 75, y: 370 },
  'product-ideas': { x: 1165, y: 105 },
  'product-practice': { x: 1175, y: 355 },
  'tech-tools': { x: 455, y: 700 },
  'tech-ai': { x: 845, y: 700 },
  'automation-jobs': { x: 75, y: 845 },
  'publishing-drafts': { x: 1180, y: 855 },
};

const overviewBridgePositions: Record<string, { x: number; y: number }> = {
  'bridge-devlog': { x: 650, y: 230 },
  'bridge-readlist': { x: 390, y: 455 },
  'bridge-peak': { x: 875, y: 430 },
  'bridge-rag': { x: 690, y: 850 },
};

function topicDetail(label: string, community: string, count: number, meta: string): Detail {
  const parent = communityMeta[community as keyof typeof communityMeta].label;
  return {
    title: label,
    status: `${count} notes · ${parent}`,
    primaryMetric: [String(count), 'notes represented by this topic'],
    facts: [[String(count), 'notes represented'], [parent, 'parent community'], ['Topic / Hub', 'projection object'], ['On demand', 'individual files']],
    note: `${meta}. Individual files are not rendered until the user opens this topic, so the canvas remains legible as the Vault grows.`,
  };
}

function bridgeDetail(label: string, meta: string): Detail {
  const relations = meta.split(' ')[0];
  return {
    title: label,
    status: `Representative bridge document · ${meta}`,
    primaryMetric: ['1', 'note file connecting communities'],
    facts: [[relations, 'resolved relations'], ['3', 'domains touched'], ['1', 'source file'], ['Bridge', 'structural role']],
    note: 'This is a real document node placed between communities. Selecting it opens evidence and its incoming/outgoing relations instead of expanding every connected file.',
  };
}

function edge(id: string, source: string, target: string, label: string, count: number, prominent = false): ElementDefinition {
  return {
    data: {
      id, source, target, label, count, prominent, kind: 'edge', relationKind: 'reference',
      detail: {
        title: label,
        status: `${count} resolved relations represented`,
        primaryMetric: [String(count), 'resolved relations on this link'],
        facts: [[String(count), 'resolved relations'], [source, 'source object'], [target, 'target object'], ['Aggregated', 'canvas edge']],
        note: 'Edge thickness is logarithmic so strong relationships remain visible without making weak but important connections disappear.',
      } satisfies Detail,
    },
    classes: prominent ? 'evidence-edge prominent-edge' : 'evidence-edge',
  };
}

function membershipEdge(id: string, source: string, target: string, color: string): ElementDefinition {
  return {
    data: { id, source, target, color, kind: 'edge', relationKind: 'membership' },
    classes: 'membership-edge',
  };
}

function semanticEdge(id: string, source: string, target: string, label: string, score: number): ElementDefinition {
  return {
    data: {
      id, source, target, label, count: Math.round(score * 100), kind: 'edge', relationKind: 'semantic',
      detail: {
        title: label,
        status: `${Math.round(score * 100)}% semantic similarity · optional projection`,
        primaryMetric: [`${Math.round(score * 100)}%`, 'semantic similarity'],
        facts: [[source, 'source object'], [target, 'target object'], ['Semantic', 'relation type'], ['Optional', 'visibility']],
        note: 'This edge comes from semantic similarity rather than a resolved Wikilink. It stays separate so the user can distinguish authored structure from machine-inferred proximity.',
      } satisfies Detail,
    },
    classes: 'semantic-edge is-semantic-hidden',
  };
}

function overviewEdge(id: string, source: string, target: string, label: string, count: number, prominent = false): ElementDefinition {
  const result = edge(id, source, target, label, count, prominent);
  result.classes = `${result.classes || ''} overview-evidence`.trim();
  return result;
}

function buildOverviewElements(filter: FileFilter): ElementDefinition[] {
  const communities = communityOrder.map((key, index): ElementDefinition => {
    const meta = communityMeta[key];
    const selectedCount = filter?.counts[index];
    return {
      data: {
        id: `overview-${key}`,
        key,
        kind: 'community',
        label: meta.label,
        baseCount: meta.count,
        display: `${meta.label}\n${meta.count} maintained notes${filter ? ` · ${selectedCount ?? 0} selected` : ''}`,
        color: meta.color,
        fill: meta.fill,
        filterCount: selectedCount,
        detail: communityDetails[key],
      },
      position: overviewPositions[key],
      classes: `community-overview ${filter && selectedCount === 0 ? 'filtered-out' : ''}`,
    };
  });

  const topics = topicData
    .filter(([id]) => overviewTopicIds.includes(id as typeof overviewTopicIds[number]))
    .map(([id, community, label, count, meta]): ElementDefinition => {
      const selectedCount = filter?.counts[communityOrder.indexOf(community)];
      return {
        data: {
          id: `overview-${id}`,
          key: id,
          kind: 'topic',
          label,
          display: `${label}\n${count} notes`,
          count,
          color: communityMeta[community].color,
          fill: communityMeta[community].topicFill,
          community,
          detail: topicDetail(label, community, count, meta),
        },
        position: overviewTopicPositions[id],
        classes: `overview-topic ${filter && selectedCount === 0 ? 'filtered-out' : ''}`,
      };
    });

  const bridges = bridgeData.map(([id, label, meta]): ElementDefinition => ({
    data: {
      id: `overview-${id}`,
      key: id,
      kind: 'bridge',
      label,
      display: `${label}\n${meta}`,
      color: '#b98845',
      detail: bridgeDetail(label, meta),
    },
    position: overviewBridgePositions[id],
    classes: `bridge-node overview-bridge ${filter && filter.key !== 'markdown' ? 'filtered-out' : ''}`,
  }));

  return [
    ...communities,
    ...topics,
    ...bridges,
    membershipEdge('m-life-journal', 'overview-life', 'overview-life-journal', communityMeta.life.color),
    membershipEdge('m-life-identity', 'overview-life', 'overview-life-identity', communityMeta.life.color),
    membershipEdge('m-life-work', 'overview-life', 'overview-life-work', communityMeta.life.color),
    membershipEdge('m-product-ideas', 'overview-product', 'overview-product-ideas', communityMeta.product.color),
    membershipEdge('m-product-practice', 'overview-product', 'overview-product-practice', communityMeta.product.color),
    membershipEdge('m-tech-tools', 'overview-tech', 'overview-tech-tools', communityMeta.tech.color),
    membershipEdge('m-tech-ai', 'overview-tech', 'overview-tech-ai', communityMeta.tech.color),
    membershipEdge('m-automation-jobs', 'overview-automation', 'overview-automation-jobs', communityMeta.automation.color),
    membershipEdge('m-publishing-drafts', 'overview-publishing', 'overview-publishing-drafts', communityMeta.publishing.color),
    overviewEdge('o-journal-readlist', 'overview-life-journal', 'overview-bridge-readlist', '72 source links', 72, true),
    overviewEdge('o-readlist-tools', 'overview-bridge-readlist', 'overview-tech-tools', '44 reference links', 44, true),
    overviewEdge('o-identity-ideas', 'overview-life-identity', 'overview-product-ideas', '38 idea links', 38),
    overviewEdge('o-work-devlog', 'overview-life-work', 'overview-bridge-devlog', '16 chronology links', 16, true),
    overviewEdge('o-devlog-product', 'overview-bridge-devlog', 'overview-product-ideas', '9 decision links', 9),
    overviewEdge('o-devlog-tech', 'overview-bridge-devlog', 'overview-tech-ai', '7 implementation links', 7),
    overviewEdge('o-product-peak', 'overview-product-ideas', 'overview-bridge-peak', '21 Peak design links', 21, true),
    overviewEdge('o-peak-ai', 'overview-bridge-peak', 'overview-tech-ai', '12 AI architecture links', 12),
    overviewEdge('o-practice-tools', 'overview-product-practice', 'overview-tech-tools', '11 workflow links', 11),
    overviewEdge('o-tech-rag', 'overview-tech-ai', 'overview-bridge-rag', '12 RAG links', 12, true),
    overviewEdge('o-automation-life', 'overview-automation-jobs', 'overview-life-work', '3 career links', 3),
    semanticEdge('o-sem-life-product', 'overview-life-identity', 'overview-product-ideas', '86% semantic', 0.86),
    semanticEdge('o-sem-product-ai', 'overview-product-ideas', 'overview-tech-ai', '82% semantic', 0.82),
    semanticEdge('o-sem-publishing-product', 'overview-publishing-drafts', 'overview-product-practice', '73% semantic', 0.73),
    semanticEdge('o-sem-automation-tools', 'overview-automation-jobs', 'overview-tech-tools', '69% semantic', 0.69),
  ];
}

function isCommunityKey(value: string): value is CommunityKey {
  return (communityOrder as readonly string[]).includes(value);
}

function expandedTopicPosition(
  center: { x: number; y: number },
  index: number,
  total: number,
): { x: number; y: number } {
  const radiusX = total > 4 ? 310 : total > 2 ? 260 : 255;
  const radiusY = total > 4 ? 235 : total > 2 ? 190 : 0;
  const angle = total === 2 ? index * Math.PI : -Math.PI / 2 + index * ((Math.PI * 2) / total);
  return {
    x: center.x + Math.cos(angle) * radiusX,
    y: center.y + Math.sin(angle) * radiusY,
  };
}

const graphStyle = [
  {
    selector: 'node',
    style: {
      'font-family': 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'font-size': 14,
      'font-weight': 620,
      'color': '#3f3945',
      'text-wrap': 'wrap',
      'text-max-width': 150,
      'text-valign': 'center',
      'text-halign': 'center',
      'overlay-opacity': 0,
      'transition-property': 'border-color, border-width, background-color, shadow-opacity',
      'transition-duration': '150ms',
    },
  },
  {
    selector: 'node.community-overview',
    style: {
      'shape': 'round-rectangle',
      'width': 226,
      'height': 98,
      'label': 'data(display)',
      'font-size': 18,
      'font-weight': 720,
      'line-height': 1.65,
      'text-max-width': 206,
      'background-color': 'data(fill)',
      'border-width': 3.6,
      'border-color': 'data(color)',
      'shadow-blur': 16,
      'shadow-color': '#30273e',
      'shadow-opacity': 0.1,
      'shadow-offset-y': 5,
    },
  },
  {
    selector: 'node.community-overview.is-expanded-community',
    style: {
      'border-width': 4,
      'shadow-blur': 24,
      'shadow-opacity': 0.18,
      'z-index': 980,
    },
  },
  {
    selector: 'node.overview-topic',
    style: {
      'shape': 'round-rectangle',
      'width': 'mapData(count, 1, 564, 150, 196)',
      'height': 70,
      'label': 'data(display)',
      'font-size': 15,
      'font-weight': 650,
      'line-height': 1.5,
      'text-max-width': 176,
      'background-color': 'data(fill)',
      'border-width': 2.2,
      'border-color': 'data(color)',
      'border-opacity': 0.92,
      'shadow-blur': 8,
      'shadow-color': '#342c40',
      'shadow-opacity': 0.065,
      'shadow-offset-y': 3,
    },
  },
  {
    selector: 'node.overview-topic.is-expanded-topic',
    style: {
      'width': 'mapData(count, 1, 564, 168, 214)',
      'height': 76,
      'font-size': 16,
      'border-width': 2.4,
      'border-opacity': 0.9,
      'shadow-opacity': 0.11,
      'z-index': 900,
    },
  },
  {
    selector: 'node.bridge-node',
    style: {
      'shape': 'round-rectangle',
      'width': 218,
      'height': 74,
      'label': 'data(display)',
      'font-size': 13,
      'line-height': 1.5,
      'color': '#5f4a2e',
      'background-color': '#fff0d6',
      'border-width': 2.4,
      'border-color': '#c97914',
      'shadow-blur': 10,
      'shadow-color': '#6f4b24',
      'shadow-opacity': 0.1,
      'shadow-offset-y': 3,
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'line-color': '#6553ad',
      'target-arrow-color': '#6553ad',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.82,
      'width': 'mapData(count, 1, 405, 1.8, 6.8)',
      'opacity': 0.72,
      'label': '',
      'font-family': 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'font-size': 14,
      'font-weight': 720,
      'color': '#685f72',
      'text-background-color': '#ffffff',
      'text-background-opacity': 0.97,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': 6,
      'text-border-color': '#d9d3e3',
      'text-border-width': 1,
      'text-border-opacity': 0.95,
      'text-rotation': 'none',
      'text-margin-y': -12,
      'overlay-opacity': 0,
      'transition-property': 'opacity, line-color, width',
      'transition-duration': '150ms',
    },
  },
  {
    selector: 'edge.prominent-edge',
    style: {
      'line-color': '#503aa8',
      'target-arrow-color': '#503aa8',
      'opacity': 0.94,
      'label': 'data(label)',
    },
  },
  {
    selector: 'edge.overview-evidence',
    style: {
      'font-size': 16,
      'text-background-padding': 8,
    },
  },
  {
    selector: 'edge.membership-edge',
    style: {
      'curve-style': 'bezier',
      'line-style': 'dashed',
      'line-dash-pattern': [7, 5],
      'line-color': 'data(color)',
      'target-arrow-shape': 'none',
      'width': 2.2,
      'opacity': 0.84,
      'label': '',
    },
  },
  {
    selector: 'edge.semantic-edge',
    style: {
      'line-style': 'dotted',
      'line-color': '#187a63',
      'target-arrow-color': '#187a63',
      'width': 2.6,
      'opacity': 0.9,
      'label': 'data(label)',
      'font-size': 14,
      'color': '#4c7766',
    },
  },
  { selector: 'edge.is-semantic-hidden', style: { 'display': 'none' } },
  {
    selector: 'node:selected',
    style: {
      'border-width': 4,
      'border-color': '#5f4ab6',
      'shadow-blur': 20,
      'shadow-opacity': 0.2,
    },
  },
  { selector: '.filtered-out', style: { 'opacity': 0.22 } },
  { selector: 'node.is-expansion-background', style: { 'opacity': 0.1 } },
  { selector: 'edge.is-expansion-background', style: { 'opacity': 0.07, 'label': '' } },
  { selector: 'node.is-expansion-related', style: { 'opacity': 0.42 } },
  { selector: 'edge.is-expansion-related', style: { 'opacity': 0.42, 'label': '' } },
  { selector: 'edge.is-expanded-membership', style: { 'opacity': 0.96, 'width': 2.8 } },
  { selector: '.is-neighbor', style: { 'opacity': 1 } },
  {
    selector: 'edge.is-neighbor',
    style: {
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b',
      'width': 'mapData(count, 1, 405, 2, 7)',
      'label': 'data(label)',
    },
  },
  {
    selector: 'node.hovered-node',
    style: {
      'background-color': '#fffaf0',
      'background-opacity': 1,
      'border-width': 4,
      'border-color': '#f59e0b',
      'border-opacity': 1,
      'shadow-blur': 22,
      'shadow-color': '#d97706',
      'shadow-opacity': 0.28,
      'shadow-offset-y': 5,
      'z-index': 999,
      'opacity': 1,
    },
  },
] as unknown as StylesheetStyle[];

const overviewSummaryStyle = [
  {
    selector: 'node',
    style: {
      'font-family': 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'overlay-opacity': 0,
      'events': 'no',
    },
  },
  {
    selector: 'node.community-overview',
    style: {
      'shape': 'round-rectangle',
      'width': 202,
      'height': 84,
      'label': 'data(display)',
      'font-size': 17,
      'font-weight': 720,
      'line-height': 1.55,
      'text-max-width': 184,
      'color': '#3f3945',
      'background-color': 'data(fill)',
      'border-width': 3.4,
      'border-color': 'data(color)',
      'shadow-blur': 13,
      'shadow-color': '#30273e',
      'shadow-opacity': 0.085,
      'shadow-offset-y': 4,
    },
  },
  {
    selector: 'node.overview-topic',
    style: {
      'shape': 'round-rectangle',
      'width': 'mapData(count, 1, 564, 126, 164)',
      'height': 58,
      'label': 'data(display)',
      'font-size': 13,
      'font-weight': 640,
      'line-height': 1.45,
      'text-max-width': 148,
      'color': '#4b4650',
      'background-color': 'data(fill)',
      'border-width': 2,
      'border-color': 'data(color)',
      'border-opacity': 0.9,
    },
  },
  {
    selector: 'node.overview-bridge',
    style: {
      'shape': 'round-rectangle',
      'width': 180,
      'height': 62,
      'label': 'data(display)',
      'font-size': 12,
      'font-weight': 650,
      'line-height': 1.45,
      'text-max-width': 164,
      'color': '#5f4a2e',
      'background-color': '#fff0d6',
      'border-width': 2.2,
      'border-color': '#c97914',
    },
  },
  {
    selector: 'edge',
    style: {
      'curve-style': 'bezier',
      'line-color': '#6553ad',
      'target-arrow-color': '#6553ad',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.65,
      'width': 'mapData(count, 1, 100, 1.6, 5.2)',
      'opacity': 0.68,
      'label': '',
      'overlay-opacity': 0,
      'events': 'no',
    },
  },
  {
    selector: 'edge.prominent-edge',
    style: {
      'line-color': '#503aa8',
      'target-arrow-color': '#503aa8',
      'opacity': 0.92,
      'width': 'mapData(count, 1, 100, 1.8, 5.2)',
    },
  },
  {
    selector: 'edge.membership-edge',
    style: {
      'line-style': 'dashed',
      'line-dash-pattern': [7, 5],
      'line-color': 'data(color)',
      'target-arrow-shape': 'none',
      'width': 2,
      'opacity': 0.82,
    },
  },
  { selector: 'edge.semantic-edge', style: { 'display': 'none' } },
] as unknown as StylesheetStyle[];

function overviewSummaryElements(): ElementDefinition[] {
  const wanted = new Set([
    'overview-life', 'overview-product', 'overview-tech', 'overview-automation', 'overview-publishing',
    'overview-life-journal', 'overview-life-work', 'overview-product-ideas', 'overview-tech-tools', 'overview-tech-ai',
    'overview-bridge-devlog', 'overview-bridge-readlist', 'overview-bridge-peak',
  ]);
  const positions: Record<string, { x: number; y: number }> = {
    'overview-life-journal': { x: 55, y: 38 },
    'overview-life': { x: 165, y: 138 },
    'overview-life-work': { x: 55, y: 248 },
    'overview-automation': { x: 145, y: 360 },
    'overview-bridge-readlist': { x: 352, y: 242 },
    'overview-tech-tools': { x: 430, y: 370 },
    'overview-bridge-devlog': { x: 550, y: 78 },
    'overview-tech': { x: 550, y: 278 },
    'overview-tech-ai': { x: 675, y: 370 },
    'overview-bridge-peak': { x: 760, y: 242 },
    'overview-product': { x: 930, y: 138 },
    'overview-product-ideas': { x: 1050, y: 38 },
    'overview-publishing': { x: 960, y: 360 },
  };
  return buildOverviewElements(null).filter((element) => {
    if (!element.data) return false;
    const id = String(element.data.id || '');
    if (!element.data.source || !element.data.target) return wanted.has(id);
    return wanted.has(String(element.data.source)) && wanted.has(String(element.data.target));
  }).map((element) => {
    const id = String(element.data?.id || '');
    if (!positions[id]) return element;
    return { ...element, position: positions[id] };
  });
}

const overviewSummaryMount = document.getElementById('vault-overview-graph');

if (overviewSummaryMount) {
  const overviewSummary = cytoscape({
    container: overviewSummaryMount,
    elements: overviewSummaryElements(),
    style: overviewSummaryStyle,
    layout: { name: 'preset', fit: false },
    minZoom: 0.1,
    maxZoom: 1.4,
    userZoomingEnabled: false,
    userPanningEnabled: false,
    autoungrabify: true,
    autounselectify: true,
    boxSelectionEnabled: false,
    motionBlur: false,
  });

  const fitOverviewSummary = (): void => {
    if (!overviewSummaryMount.clientWidth || !overviewSummaryMount.clientHeight) return;
    overviewSummary.resize();
    overviewSummary.fit(overviewSummary.elements(), 24);
  };
  const overviewSummaryObserver = new ResizeObserver(fitOverviewSummary);
  overviewSummaryObserver.observe(overviewSummaryMount);
  window.setTimeout(fitOverviewSummary, 80);

  (window as typeof window & { __vaultOverviewCytoscapeMock?: unknown }).__vaultOverviewCytoscapeMock = {
    getCore: () => overviewSummary,
    getState: () => ({
      engine: 'cytoscape',
      nodeCount: overviewSummary.nodes().length,
      edgeCount: overviewSummary.edges().length,
      interactive: false,
    }),
  };
}

const mount = document.getElementById('vault-knowledge-flow');

if (mount) {
  mount.innerHTML = `
    <div class="vig-shell vig-cytoscape-shell">
      <div class="vig-canvas">
        <div class="vig-cytoscape-canvas" data-cy-canvas role="img" aria-label="Interactive Cytoscape knowledge structure graph"></div>
        <div class="vig-layout-switcher" role="tablist" aria-label="Graph layout">
          <button type="button" role="tab" aria-selected="true" data-cy-layout="constellation" title="Force-directed clusters">Constellation</button>
          <button type="button" role="tab" aria-selected="false" data-cy-layout="flow-lr" title="Reference flow from left to right">Flow <span aria-hidden="true">→</span></button>
          <button class="vig-layout-icon-only" type="button" role="tab" aria-selected="false" data-cy-layout="flow-tb" aria-label="Flow vertical, top to bottom" title="Flow from top to bottom"><span aria-hidden="true">↓</span></button>
          <button type="button" role="tab" aria-selected="false" data-cy-layout="orbit" title="Communities at the center, topics and bridge documents around them">Orbit</button>
        </div>
        <div class="vig-graph-utility" aria-label="Graph display tools">
          <strong data-cy-visible-count hidden>18 nodes · 20 links</strong>
          <label class="vig-semantic-toggle">
            <input type="checkbox" data-cy-semantic>
            <span aria-hidden="true"></span>
            Semantic edges
          </label>
          <span class="vig-utility-divider"></span>
          <button class="vig-toolbar-button vig-toolbar-button--label" type="button" data-cy-action="nodes" aria-expanded="false" aria-label="Open graph node list" title="Open graph node list"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18M8 9l3 3-3 3"/></svg><span>Nodes</span></button>
          <span class="vig-utility-divider"></span>
          <button class="vig-toolbar-button" type="button" data-cy-action="mermaid" aria-label="Copy graph as Mermaid" title="Copy graph as Mermaid"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg></button>
          <button class="vig-toolbar-button" type="button" data-cy-action="image" aria-label="Copy graph as image" title="Copy graph as image"><svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg></button>
          <span class="vig-utility-divider vig-fullscreen-only"></span>
          <button class="vig-toolbar-button vig-fullscreen-only" type="button" data-cy-action="zoom-out" aria-label="Zoom out" title="Zoom out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg></button>
          <span class="vig-zoom-readout vig-fullscreen-only" data-cy-zoom>100%</span>
          <button class="vig-toolbar-button vig-fullscreen-only" type="button" data-cy-action="zoom-in" aria-label="Zoom in" title="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg></button>
          <button class="vig-toolbar-button vig-fullscreen-only" type="button" data-cy-action="fit" aria-label="Fit all" title="Fit all"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/></svg></button>
          <button class="vig-toolbar-button vig-fullscreen-only" type="button" data-cy-action="readable" aria-label="Readable view" title="Readable view"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/></svg></button>
          <span class="vig-utility-divider"></span>
          <button class="vig-toolbar-button" type="button" data-cy-action="fullscreen" aria-label="View graph fullscreen" title="View graph fullscreen"><svg class="vig-enter-fullscreen" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg><svg class="vig-exit-fullscreen" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg></button>
        </div>
        <div class="vig-node-list" data-cy-node-list hidden>
          <div data-cy-node-list-items></div>
        </div>
        <div class="vig-node-type-legend" aria-label="Graph visual legend">
          <div class="vig-legend-row"><strong>Nodes</strong><span><i class="is-community" aria-hidden="true"></i>Community</span><span><i class="is-topic" aria-hidden="true"></i>Topic</span><span><i class="is-bridge" aria-hidden="true"></i>Bridge file</span></div>
          <div class="vig-legend-row"><strong>Links</strong><span><i class="is-link is-membership" aria-hidden="true"></i>Contains</span><span><i class="is-link is-reference" aria-hidden="true"></i>Reference</span><span><i class="is-link is-semantic" aria-hidden="true"></i>Semantic</span></div>
        </div>
        <div class="vig-inspect-card" data-cy-inspect hidden>
          <span>QUICK INSPECT</span>
          <strong data-cy-inspect-title></strong>
          <b data-cy-inspect-metric></b>
          <small data-cy-inspect-note></small>
          <em>Press I to pin · Escape to close</em>
        </div>
        <div class="vig-graph-overview" aria-hidden="true"><div data-cy-overview-shape></div></div>
        <div class="vig-tool-feedback" data-cy-feedback hidden></div>
      </div>
    </div>`;

  const graphCard = mount.closest<HTMLElement>('.contents-structure-card') || mount;
  const canvas = mount.querySelector<HTMLElement>('[data-cy-canvas]')!;
  const countLabel = graphCard.querySelector<HTMLElement>('[data-cy-count]')!;
  const filterLabel = graphCard.querySelector<HTMLElement>('[data-cy-filter]')!;
  const overviewShape = mount.querySelector<HTMLElement>('[data-cy-overview-shape]')!;
  const graphShell = mount.querySelector<HTMLElement>('.vig-shell')!;
  const visibleCount = mount.querySelector<HTMLElement>('[data-cy-visible-count]')!;
  const zoomLabel = mount.querySelector<HTMLElement>('[data-cy-zoom]')!;
  const semanticToggle = mount.querySelector<HTMLInputElement>('[data-cy-semantic]')!;
  const nodeList = mount.querySelector<HTMLElement>('[data-cy-node-list]')!;
  const nodeListItems = mount.querySelector<HTMLElement>('[data-cy-node-list-items]')!;
  const inspectCard = mount.querySelector<HTMLElement>('[data-cy-inspect]')!;
  const inspectTitle = mount.querySelector<HTMLElement>('[data-cy-inspect-title]')!;
  const inspectMetric = mount.querySelector<HTMLElement>('[data-cy-inspect-metric]')!;
  const inspectNote = mount.querySelector<HTMLElement>('[data-cy-inspect-note]')!;
  const feedback = mount.querySelector<HTMLElement>('[data-cy-feedback]')!;
  let filter: FileFilter = null;
  let graphLayout: GraphLayout = 'constellation';
  let expandedCommunity: CommunityKey | '' = '';
  const expansionReturnPositions = new Map<string, { x: number; y: number }>();
  let semanticEdgesVisible = false;
  let hoveredNode: NodeSingular | null = null;
  let inspectedNode: NodeSingular | null = null;
  let inspectPinned = false;
  let shiftInspecting = false;
  let feedbackTimer = 0;
  let pointerInside = false;

  const cy: Core = cytoscape({
    container: canvas,
    elements: buildOverviewElements(null),
    style: graphStyle,
    layout: { name: 'preset', fit: false },
    minZoom: 0.18,
    maxZoom: 2.4,
    wheelSensitivity: 0.17,
    boxSelectionEnabled: true,
    selectionType: 'single',
    motionBlur: false,
  });

  function dispatchSelection(element: SingularElementArgument): void {
    const detail = element.data('detail') as Detail | undefined;
    if (!detail) return;
    window.dispatchEvent(new CustomEvent('vault-graph-selection', {
      detail: {
        selection: detail,
        key: element.data('key') || '',
        kind: element.data('kind') || (element.isEdge() ? 'edge' : ''),
        relationKind: element.data('relationKind') || '',
      },
    }));
  }

  function clearEmphasis(): void {
    cy.elements().removeClass('is-neighbor hovered-node');
  }

  function showNeighborhood(node: NodeSingular): void {
    clearEmphasis();
    const related = node.isParent()
      ? node.union(node.descendants()).union(node.descendants().connectedEdges()).union(node.descendants().neighborhood())
      : node.union(node.closedNeighborhood());
    related.addClass('is-neighbor');
    node.addClass('hovered-node');
  }

  function showFeedback(message: string): void {
    window.clearTimeout(feedbackTimer);
    feedback.textContent = message;
    feedback.hidden = false;
    feedbackTimer = window.setTimeout(() => { feedback.hidden = true; }, 1800);
  }

  function pulseToolbarAction(action: string): void {
    const button = mount.querySelector<HTMLElement>(`[data-cy-action="${action}"]`);
    if (!button) return;
    button.dataset.active = 'true';
    window.setTimeout(() => { delete button.dataset.active; }, 1600);
  }

  function syncCounts(): void {
    const nodeCount = cy.nodes().filter((node) => node.visible()).length;
    const linkCount = cy.edges().filter((relation) => relation.visible()).length;
    visibleCount.textContent = `${nodeCount} nodes · ${linkCount} links`;
    countLabel.textContent = `${nodeCount} nodes · ${linkCount} links`;
  }

  function applySemanticVisibility(): void {
    cy.edges('.semantic-edge').toggleClass('is-semantic-hidden', !semanticEdgesVisible);
    syncCounts();
  }

  function renderNodeList(): void {
    const rows = cy.nodes().not(':parent').sort((left, right) => {
      const leftCount = Number(left.data('count') || left.data('baseCount') || 0);
      const rightCount = Number(right.data('count') || right.data('baseCount') || 0);
      return rightCount - leftCount;
    });
    nodeListItems.replaceChildren(...rows.map((node) => {
      const button = document.createElement('button');
      const detail = node.data('detail') as Detail;
      button.type = 'button';
      button.dataset.nodeKey = String(node.data('key') || '');
      button.innerHTML = `<strong>${detail.title}</strong><span>${detail.primaryMetric[0]} ${detail.primaryMetric[1]}</span>`;
      return button;
    }));
  }

  function hideInspect(force = false): void {
    if (inspectPinned && !force) return;
    inspectPinned = false;
    inspectedNode = null;
    inspectCard.hidden = true;
    inspectCard.classList.remove('is-pinned');
  }

  function showInspect(node: NodeSingular, pinned = false): void {
    const detail = node.data('detail') as Detail | undefined;
    if (!detail) return;
    const rendered = node.renderedPosition();
    const left = Math.max(14, Math.min(canvas.clientWidth - 338, rendered.x + 28));
    const top = Math.max(76, Math.min(canvas.clientHeight - 230, rendered.y - 72));
    inspectedNode = node;
    inspectPinned = pinned;
    inspectTitle.textContent = detail.title;
    inspectMetric.textContent = `${detail.primaryMetric[0]} · ${detail.primaryMetric[1]}`;
    inspectNote.textContent = detail.note;
    inspectCard.style.left = `${left}px`;
    inspectCard.style.top = `${top}px`;
    inspectCard.hidden = false;
    inspectCard.classList.toggle('is-pinned', pinned);
  }

  function syncOverview(): void {
    const bounds = cy.elements().boundingBox();
    const width = Math.max(18, Math.min(92, 90 * (cy.width() / Math.max(cy.width(), bounds.w * cy.zoom()))));
    const height = Math.max(12, Math.min(48, 46 * (cy.height() / Math.max(cy.height(), bounds.h * cy.zoom()))));
    overviewShape.style.width = `${width}px`;
    overviewShape.style.height = `${height}px`;
    overviewShape.style.transform = `translate(${Math.max(0, Math.min(92 - width, 46 - width / 2 - cy.pan().x / 36))}px, ${Math.max(0, Math.min(48 - height, 24 - height / 2 - cy.pan().y / 40))}px)`;
    zoomLabel.textContent = `${Math.round(cy.zoom() * 100)}%`;
  }

  function fitGraph(duration = 260): void {
    cy.stop();
    cy.animate({ fit: { eles: cy.elements(), padding: 70 }, duration });
  }

  function readableGraph(duration = 260): void {
    const targetZoom = 0.92;
    const bounds = cy.elements(':visible').boundingBox();
    const pan = {
      x: cy.width() / 2 - targetZoom * (bounds.x1 + bounds.x2) / 2,
      y: cy.height() / 2 - targetZoom * (bounds.y1 + bounds.y2) / 2 + 30,
    };
    cy.stop();
    cy.animate({ zoom: targetZoom, pan, duration });
  }

  function focusNode(key: string, select = true): void {
    const node = cy.nodes().filter((candidate) => candidate.data('key') === key).first() as NodeSingular;
    if (!node.length) return;
    if (select) {
      cy.elements().unselect();
      node.select();
      dispatchSelection(node);
    }
    const scope = node.isParent() ? node.union(node.descendants()) : node;
    cy.stop();
    cy.animate({ fit: { eles: scope, padding: node.isParent() ? 90 : 150 }, duration: 320 });
  }

  function collapseCommunity(animate = true): void {
    if (!expandedCommunity) return;
    const key = expandedCommunity;
    const topics = cy.nodes().filter((node) => node.data('community') === key);
    const addedTopics = topics.filter((node) => node.hasClass('expanded-on-demand'));
    const retainedTopics = topics.not(addedTopics);
    retainedTopics.forEach((node) => {
      const nodeKey = String(node.data('key') || '');
      const originalPosition = expansionReturnPositions.get(nodeKey) || overviewTopicPositions[nodeKey];
      if (!originalPosition) return;
      node.stop();
      if (animate) node.animate({ position: originalPosition }, { duration: 220 });
      else node.position(originalPosition);
    });
    addedTopics.remove();
    cy.elements().removeClass('is-expansion-background is-expansion-related is-expanded-community is-expanded-topic is-expanded-membership');
    expandedCommunity = '';
    expansionReturnPositions.clear();
    applySemanticVisibility();
    renderNodeList();
    syncOverview();
  }

  function planExpandedTopicPositions(community: CommunityKey, total: number): Array<{ x: number; y: number }> {
    const communityNode = cy.$id(`overview-${community}`) as NodeSingular;
    const center = communityNode.length ? communityNode.position() : overviewPositions[community];
    const occupied = cy.nodes().filter((node) => (
      node.data('community') !== community && node.id() !== `overview-${community}`
    )).map((node) => (node as NodeSingular).position());
    const candidates: Array<{ x: number; y: number }> = [];
    for (let ring = 0; ring < 4; ring += 1) {
      const radiusX = 270 + ring * 145;
      const radiusY = 200 + ring * 105;
      for (let step = 0; step < 24; step += 1) {
        const angle = -Math.PI / 2 + step * (Math.PI / 12);
        const candidate = {
          x: center.x + Math.cos(angle) * radiusX,
          y: center.y + Math.sin(angle) * radiusY,
        };
        if (occupied.some((position) => Math.abs(position.x - candidate.x) < 205 && Math.abs(position.y - candidate.y) < 105)) continue;
        candidates.push(candidate);
      }
    }
    const selected: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < total; index += 1) {
      const preferred = expandedTopicPosition(center, index, total);
      const available = candidates.filter((candidate) => !selected.some((position) => (
        Math.abs(position.x - candidate.x) < 205 && Math.abs(position.y - candidate.y) < 105
      )));
      const fallbackCandidates: Array<{ x: number; y: number }> = [];
      for (let ring = 0; ring < 3; ring += 1) {
        const radiusX = 265 + ring * 145;
        const radiusY = 190 + ring * 105;
        for (let step = 0; step < 16; step += 1) {
          const angle = -Math.PI / 2 + step * (Math.PI / 8);
          const candidate = {
            x: center.x + Math.cos(angle) * radiusX,
            y: center.y + Math.sin(angle) * radiusY,
          };
          if (occupied.some((position) => Math.abs(position.x - candidate.x) < 205 && Math.abs(position.y - candidate.y) < 105)) continue;
          if (selected.some((position) => Math.abs(position.x - candidate.x) < 205 && Math.abs(position.y - candidate.y) < 105)) continue;
          fallbackCandidates.push(candidate);
        }
      }
      const placementPool = available.length ? available : fallbackCandidates;
      placementPool.sort((left, right) => {
        const leftScore = Math.hypot(left.x - preferred.x, left.y - preferred.y) + Math.abs(Math.hypot(left.x - center.x, left.y - center.y) - 320) * 0.38;
        const rightScore = Math.hypot(right.x - preferred.x, right.y - preferred.y) + Math.abs(Math.hypot(right.x - center.x, right.y - center.y) - 320) * 0.38;
        return leftScore - rightScore;
      });
      selected.push(placementPool[0] || preferred);
    }
    return selected;
  }

  function expandCommunity(value: string, animate = true): void {
    if (!isCommunityKey(value)) return;
    if (expandedCommunity === value) return;
    collapseCommunity(false);
    expandedCommunity = value;
    const communityNode = cy.$id(`overview-${value}`) as NodeSingular;
    if (!communityNode.length) return;
    const communityTopics = topicData.filter(([, community]) => community === value);
    const targetPositions = planExpandedTopicPositions(value, communityTopics.length);
    communityTopics.forEach(([id, community, label, count, topicMeta], index) => {
      const nodeId = `overview-${id}`;
      const targetPosition = targetPositions[index];
      let topicNode = cy.$id(nodeId) as NodeSingular;
      let addedOnDemand = false;
      if (topicNode.length) expansionReturnPositions.set(id, { ...topicNode.position() });
      if (!topicNode.length) {
        const selectedCount = filter?.counts[communityOrder.indexOf(community)];
        cy.add({
          data: {
            id: nodeId,
            key: id,
            kind: 'topic',
            label,
            display: `${label}\n${count} notes`,
            count,
            color: communityMeta[community].color,
            fill: communityMeta[community].topicFill,
            community,
            detail: topicDetail(label, community, count, topicMeta),
          },
          position: { ...targetPosition },
          classes: `overview-topic expanded-on-demand ${filter && selectedCount === 0 ? 'filtered-out' : ''}`,
        });
        cy.add(membershipEdge(`expanded-m-${value}-${id}`, `overview-${value}`, nodeId, communityMeta[value].color));
        topicNode = cy.$id(nodeId) as NodeSingular;
        addedOnDemand = true;
      }
      topicNode.stop();
      if (animate && !addedOnDemand) topicNode.animate({ position: targetPosition }, { duration: 280 });
      else topicNode.position(targetPosition);
      topicNode.addClass('is-expanded-topic');
    });
    const topics = cy.nodes().filter((node) => node.data('community') === value);
    const membership = cy.edges().filter((relation) => relation.hasClass('membership-edge') && (
      relation.source().id() === `overview-${value}` || relation.target().id() === `overview-${value}`
    ));
    const core = communityNode.union(topics).union(membership);
    const relatedEdges = topics.connectedEdges().not(membership);
    const relatedNodes = relatedEdges.connectedNodes().not(core);
    cy.elements().addClass('is-expansion-background');
    relatedNodes.addClass('is-expansion-related').removeClass('is-expansion-background');
    relatedEdges.addClass('is-expansion-related').removeClass('is-expansion-background');
    core.removeClass('is-expansion-background is-expansion-related');
    communityNode.addClass('is-expanded-community');
    membership.addClass('is-expanded-membership').removeClass('is-expansion-background is-expansion-related');
    applySemanticVisibility();
    renderNodeList();
    syncOverview();
  }

  function rebuildOverview(): void {
    const restoreExpansion = expandedCommunity;
    expandedCommunity = '';
    hoveredNode = null;
    cy.elements().remove();
    cy.add(buildOverviewElements(filter));
    clearEmphasis();
    hideInspect(true);
    applySemanticVisibility();
    renderNodeList();
    cy.layout({ name: 'preset', fit: false }).run();
    window.setTimeout(() => runGraphLayout(graphLayout, false, restoreExpansion), 30);
  }

  function syncLayoutControls(): void {
    mount.querySelectorAll<HTMLElement>('[data-cy-layout]').forEach((button) => {
      const active = button.dataset.cyLayout === graphLayout;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
  }

  function layoutOptions(layout: GraphLayout, animate: boolean): cytoscape.LayoutOptions {
    const shared = {
      animate,
      animationDuration: animate ? 520 : 0,
      fit: true,
      padding: 82,
      nodeDimensionsIncludeLabels: true,
    };
    if (layout === 'flow-lr') {
      return {
        name: 'dagre',
        ...shared,
        rankDir: 'LR',
        nodeSep: 54,
        edgeSep: 26,
        rankSep: 105,
      } as cytoscape.LayoutOptions;
    }
    if (layout === 'flow-tb') {
      return {
        name: 'dagre',
        ...shared,
        rankDir: 'TB',
        nodeSep: 56,
        edgeSep: 28,
        rankSep: 86,
      } as cytoscape.LayoutOptions;
    }
    if (layout === 'orbit') {
      return {
        name: 'concentric',
        ...shared,
        startAngle: -Math.PI / 2,
        clockwise: true,
        avoidOverlap: true,
        minNodeSpacing: 56,
        spacingFactor: 1.04,
        concentric: (node: NodeSingular) => {
          if (node.data('kind') === 'community') return 4;
          if (node.data('kind') === 'bridge') return 3;
          return 2 + Math.min(0.9, Number(node.degree(false)) / 10);
        },
        levelWidth: () => 1,
      } as cytoscape.LayoutOptions;
    }
    return {
      name: 'fcose',
      ...shared,
      quality: 'default',
      randomize: true,
      nodeRepulsion: 7200,
      idealEdgeLength: 165,
      edgeElasticity: 0.42,
      nestingFactor: 0.85,
      gravity: 0.32,
      numIter: 2200,
      tile: true,
      packComponents: true,
      nodeSeparation: 64,
    } as cytoscape.LayoutOptions;
  }

  function runGraphLayout(
    nextLayout: GraphLayout,
    animate = true,
    requestedExpansion: CommunityKey | '' = expandedCommunity,
  ): void {
    const restoreExpansion = requestedExpansion;
    if (expandedCommunity) collapseCommunity(false);
    graphLayout = nextLayout;
    syncLayoutControls();
    clearEmphasis();
    hideInspect(true);
    canvas.setAttribute('aria-busy', 'true');
    const layout = cy.layout(layoutOptions(nextLayout, animate));
    layout.one('layoutstop', () => {
      canvas.removeAttribute('aria-busy');
      if (restoreExpansion) {
        expandCommunity(restoreExpansion, false);
        fitGraph(animate ? 240 : 0);
      }
      syncOverview();
    });
    layout.run();
  }

  function setGraphLayout(nextLayout: GraphLayout): void {
    if (nextLayout === 'orbit') {
      semanticEdgesVisible = true;
      semanticToggle.checked = true;
      applySemanticVisibility();
    }
    if (nextLayout !== 'orbit' && graphLayout === 'orbit') {
      semanticEdgesVisible = false;
      semanticToggle.checked = false;
      applySemanticVisibility();
    }
    runGraphLayout(nextLayout);
    const labels: Record<GraphLayout, string> = {
      constellation: 'Constellation layout',
      'flow-lr': 'Flow left to right',
      'flow-tb': 'Flow top to bottom',
      orbit: 'Orbit layout · semantic edges on',
    };
    showFeedback(labels[nextLayout]);
  }

  function runLayout(): void {
    runGraphLayout(graphLayout);
  }

  function applyFilter(command: GraphCommand): void {
    filter = command.key ? {
      key: command.key,
      label: command.label || command.key,
      counts: command.counts || [0, 0, 0, 0, 0],
    } : null;
    filterLabel.hidden = !filter;
    filterLabel.textContent = filter ? `${filter.label} filter active` : '';
    rebuildOverview();
  }

  async function copyText(value: string, successMessage: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      showFeedback(successMessage);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = value;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.append(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      showFeedback(successMessage);
    }
  }

  async function copyGraphImage(): Promise<void> {
    const dataUrl = cy.png({ full: true, scale: 2, bg: '#fbfbfc' });
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const ClipboardItemConstructor = window.ClipboardItem;
      if (!navigator.clipboard?.write || !ClipboardItemConstructor) throw new Error('Image clipboard unavailable');
      await navigator.clipboard.write([new ClipboardItemConstructor({ [blob.type]: blob })]);
      pulseToolbarAction('image');
      showFeedback('Graph image copied');
    } catch {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = 'vault-structure.png';
      link.click();
      pulseToolbarAction('image');
      showFeedback('Clipboard unavailable · image exported');
    }
  }

  function graphAsMermaid(): string {
    const nodeLines = cy.nodes().not(':parent').map((node) => {
      const id = node.id().replace(/[^A-Za-z0-9_]/g, '_');
      const label = String(node.data('label') || node.id()).replace(/"/g, "'");
      return `  ${id}["${label}"]`;
    });
    const edgeLines = cy.edges(':visible').not('.membership-edge').map((candidate) => {
      const relation = candidate as EdgeSingular;
      const source = relation.source().id().replace(/[^A-Za-z0-9_]/g, '_');
      const target = relation.target().id().replace(/[^A-Za-z0-9_]/g, '_');
      const label = String(relation.data('label') || 'linked').replace(/["|]/g, "'");
      const connector = relation.hasClass('semantic-edge') ? '-.->' : '-->';
      return `  ${source} ${connector}|${label}| ${target}`;
    });
    return ['flowchart LR', ...nodeLines, ...edgeLines].join('\n');
  }

  function toggleNodeList(force?: boolean): void {
    const nextOpen = force ?? nodeList.hidden;
    nodeList.hidden = !nextOpen;
    const button = mount.querySelector<HTMLElement>('[data-cy-action="nodes"]');
    button?.setAttribute('aria-expanded', String(nextOpen));
    button?.setAttribute('aria-label', nextOpen ? 'Close graph node list' : 'Open graph node list');
    button?.setAttribute('title', nextOpen ? 'Close graph node list' : 'Open graph node list');
    if (button) button.dataset.active = nextOpen ? 'true' : '';
  }

  function toggleFullscreen(): void {
    const nextFullscreen = !graphShell.classList.contains('is-fullscreen');
    graphShell.classList.toggle('is-fullscreen', nextFullscreen);
    document.body.classList.toggle('vig-graph-fullscreen-open', nextFullscreen);
    const button = mount.querySelector<HTMLElement>('[data-cy-action="fullscreen"]');
    button?.setAttribute('aria-label', nextFullscreen ? 'Exit graph fullscreen' : 'View graph fullscreen');
    button?.setAttribute('title', nextFullscreen ? 'Exit graph fullscreen' : 'View graph fullscreen');
    if (button) button.dataset.active = nextFullscreen ? 'true' : '';
    window.setTimeout(() => {
      cy.resize();
      readableGraph(0);
      syncOverview();
    }, 40);
  }

  cy.on('tap', 'node', (event) => {
    const node = event.target as NodeSingular;
    dispatchSelection(node);
    if (node.data('kind') !== 'community') return;
    const communityKey = String(node.data('key') || '');
    if (!communityKey) return;
    if (expandedCommunity === communityKey) {
      collapseCommunity();
      return;
    }
    expandCommunity(communityKey);
  });
  cy.on('tap', 'edge', (event) => dispatchSelection(event.target));
  cy.on('tap', (event) => {
    if (event.target !== cy) return;
    cy.elements().unselect();
    clearEmphasis();
    collapseCommunity();
  });
  cy.on('mouseover', 'node', (event) => {
    const node = event.target as NodeSingular;
    hoveredNode = node;
    showNeighborhood(node);
    if (shiftInspecting && !inspectPinned) showInspect(node);
  });
  cy.on('mouseout', 'node', () => {
    hoveredNode = null;
    clearEmphasis();
    hideInspect();
  });
  cy.on('zoom pan', syncOverview);
  mount.querySelectorAll<HTMLElement>('[data-cy-layout]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextLayout = button.dataset.cyLayout as GraphLayout | undefined;
      if (!nextLayout) return;
      setGraphLayout(nextLayout);
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const buttons = Array.from(mount.querySelectorAll<HTMLElement>('[data-cy-layout]'));
      const index = buttons.indexOf(button);
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextButton = buttons[(index + direction + buttons.length) % buttons.length];
      nextButton.focus();
      nextButton.click();
    });
  });
  mount.querySelector('[data-cy-action="zoom-in"]')?.addEventListener('click', () => cy.animate({ zoom: Math.min(cy.maxZoom(), cy.zoom() * 1.22), duration: 180 }));
  mount.querySelector('[data-cy-action="zoom-out"]')?.addEventListener('click', () => cy.animate({ zoom: Math.max(cy.minZoom(), cy.zoom() / 1.22), duration: 180 }));
  mount.querySelector('[data-cy-action="fit"]')?.addEventListener('click', () => fitGraph());
  mount.querySelector('[data-cy-action="readable"]')?.addEventListener('click', () => readableGraph());
  mount.querySelector('[data-cy-action="layout"]')?.addEventListener('click', runLayout);
  mount.querySelector('[data-cy-action="nodes"]')?.addEventListener('click', () => toggleNodeList());
  mount.querySelector('[data-cy-action="close-nodes"]')?.addEventListener('click', () => toggleNodeList(false));
  mount.querySelector('[data-cy-action="mermaid"]')?.addEventListener('click', () => {
    void copyText(graphAsMermaid(), 'Mermaid copied').then(() => pulseToolbarAction('mermaid'));
  });
  mount.querySelector('[data-cy-action="image"]')?.addEventListener('click', () => { void copyGraphImage(); });
  mount.querySelector('[data-cy-action="fullscreen"]')?.addEventListener('click', toggleFullscreen);

  semanticToggle.addEventListener('change', () => {
    semanticEdgesVisible = semanticToggle.checked;
    applySemanticVisibility();
    renderNodeList();
  });

  nodeListItems.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-node-key]');
    if (!button?.dataset.nodeKey) return;
    focusNode(button.dataset.nodeKey);
  });

  graphShell.addEventListener('pointerenter', () => { pointerInside = true; });
  graphShell.addEventListener('pointerleave', () => {
    pointerInside = false;
    shiftInspecting = false;
    if (!inspectPinned) hideInspect(true);
  });

  window.addEventListener('keydown', (event) => {
    if (!pointerInside) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches('input, textarea, select')) return;
    if (event.key === 'Shift') {
      shiftInspecting = true;
      if (hoveredNode && !inspectPinned) showInspect(hoveredNode);
      return;
    }
    if (event.key.toLowerCase() === 'i' && (hoveredNode || inspectedNode)) {
      showInspect((hoveredNode || inspectedNode)!, true);
      return;
    }
    if (event.key === 'Escape') {
      if (!inspectCard.hidden) { hideInspect(true); return; }
      if (!nodeList.hidden) { toggleNodeList(false); return; }
      if (expandedCommunity) { collapseCommunity(); return; }
      if (graphShell.classList.contains('is-fullscreen')) toggleFullscreen();
      return;
    }
    if (event.key === '0') { fitGraph(); return; }
    if (event.key === '+' || event.key === '=') cy.animate({ zoom: Math.min(cy.maxZoom(), cy.zoom() * 1.22), duration: 180 });
    if (event.key === '-') cy.animate({ zoom: Math.max(cy.minZoom(), cy.zoom() / 1.22), duration: 180 });
  });
  window.addEventListener('keyup', (event) => {
    if (event.key !== 'Shift') return;
    shiftInspecting = false;
    hideInspect();
  });

  const handleCommand = (event: Event): void => {
    const command = (event as CustomEvent<GraphCommand>).detail || {};
    if (command.type === 'filter') {
      applyFilter(command);
      return;
    }
    if (command.type === 'reset') {
      collapseCommunity(false);
      cy.elements().unselect();
      clearEmphasis();
      fitGraph();
      return;
    }
    if (command.type !== 'focus' || !command.key) return;
    const topic = topicData.find(([id]) => id === command.key);
    const communityKey = isCommunityKey(command.key) ? command.key : topic?.[1];
    if (communityKey) {
      expandCommunity(communityKey);
      const node = cy.$id(`overview-${command.key}`) as NodeSingular;
      if (node.length) {
        cy.elements().unselect();
        node.select();
        dispatchSelection(node);
      }
      return;
    }
    focusNode(command.key);
  };
  window.addEventListener('vault-graph-command', handleCommand);

  const resizeObserver = new ResizeObserver(() => {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    cy.resize();
    syncOverview();
  });
  resizeObserver.observe(canvas);

  (window as typeof window & { __vaultCytoscapeMock?: unknown }).__vaultCytoscapeMock = {
    getCore: () => cy,
    getState: () => ({
      engine: 'cytoscape',
      version: (cytoscape as unknown as { version: string }).version,
      mode: 'overview',
      layout: graphLayout,
      expandedCommunity,
      filter: filter?.key || '',
      nodeCount: cy.nodes().length,
      edgeCount: cy.edges().length,
      zoom: cy.zoom(),
      selected: cy.$(':selected').map((element) => element.id()),
    }),
    expandCommunity,
    collapseCommunity,
    focus: focusNode,
    setLayout: setGraphLayout,
    runLayout,
  };

  window.setTimeout(() => {
    cy.resize();
    applySemanticVisibility();
    renderNodeList();
    runGraphLayout('constellation', false);
  }, 80);
}
