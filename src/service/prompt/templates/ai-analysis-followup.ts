/**
 * Unified follow-up user prompt for all follow-up chats (Summary, Graph, Sources, Blocks, Full).
 * Caller builds contextContent based on the section (summary, graph nodes, sources list, blocks, etc.).
 */
export const template = `You are helping the user with a follow-up question about their AI analysis.

**Important**: The "Analysis context" below is often a summary or partial view and may be incomplete. Do not rely on it alone. You have tools—use them: (1) **searchCurrentResult** to fetch the full current analysis result (topics, sources, graph, blocks); (2) **search_chat_history** for "Why"/"How" and process questions, to reconstruct reasoning from session history; (3) local search / content reading tools when the user needs more detail or evidence from the vault. Prefer at least calling searchCurrentResult; add search_chat_history or local search as needed. If the question needs more than the context shows, call the relevant tools.

## Analysis context (may be incomplete — use tools for full coverage)
Original query: {{originalQuery}}

{{{contextContent}}}

## User question
{{{question}}}

Return markdown. Be concise and grounded in retrieved analysis. Use bullets or short headings when helpful.`;

export const expectsJson = false;
