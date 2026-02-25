/**
 * MindFlow graph snapshot types. Used by parseMindflowMermaid and mindflowDiffToPatch.
 */

/** 
 * All valid MindFlow node states. Single source of truth. 
 * see GraphEffectsCanvas.tsx#MINDFLOW_COLORS for more details.
 * */
export const MINDFLOW_NODE_STATES = ['thinking', 'exploring', 'verified', 'pruned'] as const;

/** State display string for prompts/UI. */
export const MINDFLOW_STATE_SYNTAX = MINDFLOW_NODE_STATES.join('|');
