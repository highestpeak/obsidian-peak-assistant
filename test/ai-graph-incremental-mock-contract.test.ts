import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
	'docs/gstack/ai-graph-incremental-cytoscape-2026-08-12/prototype.tsx',
	'utf8',
);

const placementStart = source.indexOf('function expansionPositionIsClear');
const placementEnd = source.indexOf('interface AgentGraphCanvasProps');
assert.ok(placementStart >= 0 && placementEnd > placementStart, 'expansion placement contract exists');
const placement = source.slice(placementStart, placementEnd);
assert.match(placement, /boundingBox\(\{ includeLabels: true/, 'placement checks rendered node bounds');
assert.match(placement, /for \(let ring = 0; ring < 8; ring \+= 1\)/, 'placement expands through multiple search rings');
assert.match(placement, /const gutter = 46/, 'placement preserves a visual safety gutter');
assert.match(placement, /graphBox\.x2 \+ 222/, 'placement has a graph-bounds fallback outside the occupied region');

const expansionStart = source.indexOf('const startExpansion =');
const expansionEnd = source.indexOf('\n\treturn (', expansionStart);
assert.ok(expansionStart >= 0 && expansionEnd > expansionStart, 'expand interaction exists');
const expansion = source.slice(expansionStart, expansionEnd);
assert.match(expansion, /inspectionSuppressedRef\.current = true;\s*closeInspection\(\);/, 'Expand closes and suppresses the node card');

const connectStart = expansion.indexOf('const connectTimer');
const validateStart = expansion.indexOf('const validateTimer');
assert.ok(connectStart >= 0 && validateStart > connectStart, 'connect and validate phases exist');
const connectPhase = expansion.slice(connectStart, validateStart);
assert.doesNotMatch(connectPhase, /setInspectedNode\(/, 'connection phase never reopens the node card');

console.log('ai-graph-incremental-mock-contract: passed');
