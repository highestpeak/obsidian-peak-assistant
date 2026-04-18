/**
 * System prompt builder for the GraphAgent. Constructs a prompt that instructs
 * the LLM to read source documents and produce a structured knowledge graph.
 */

export function buildGraphSystemPrompt(searchQuery: string, sourcesMeta: Array<{
    path: string;
    folder: string;
    filename: string;
    createdAt?: number;
    modifiedAt?: number;
    relevanceScore?: number;
}>): string {
    const sourcesTable = sourcesMeta.map(s => {
        const date = s.createdAt ? new Date(s.createdAt).toISOString().split('T')[0] : 'unknown';
        return `- ${s.filename} (${s.folder}) — created: ${date}, relevance: ${(s.relevanceScore ?? 0).toFixed(2)}`;
    }).join('\n');

    return `You are a knowledge graph analyst. Your job is to analyze a set of documents found for a user's search query and produce a structured knowledge graph.

## Search Query
${searchQuery}

## Source Files
${sourcesTable}

## Instructions
1. Call read_sources with ALL source file paths to get their content and links.
2. Analyze the documents to understand:
   - What each document is about (one-line summary)
   - How documents relate to each other (builds_on, contrasts, complements, applies, references)
   - Which documents cluster into the same topic
   - Which documents bridge between different topic clusters
   - How ideas evolved over time across documents
3. Call submit_graph with the complete graph structure.

## Edge Types
- builds_on: B extends or deepens ideas from A
- contrasts: B presents an opposing or alternative view to A
- complements: A and B cover different aspects of the same topic
- applies: B applies theories or frameworks from A to a specific case
- references: B explicitly references or cites A

## Node Roles
- hub: Central, highly-connected document in its cluster
- bridge: Document that connects two or more topic clusters
- leaf: Peripheral document with few connections

## Rules
- Language: respond in the SAME language as the search query. If the query is in Chinese, ALL output must be in Chinese (node labels, summaries, edge labels, insights, cluster names). If in English, use English.
- Every source file must appear as a node
- importance: 0-1 scale based on centrality to the search query and connectivity
- cluster_id: use short kebab-case identifiers (e.g. "ai-product", "personal-growth")
- Only create edges where there is a genuine semantic relationship
- evolution_chains: ordered by conceptual evolution, include created_at timestamps from file metadata
- bridges: only mark a node as bridge if it genuinely connects ideas from different clusters
- insights: provide a 1-2 sentence summary for each view:
  - topology: describe the overall structure (how many clusters, what's the hub, key relationships)
  - bridges: describe which documents bridge which domains and why
  - timeline: describe the evolution pattern (when ideas emerged, how they evolved)`;
}
