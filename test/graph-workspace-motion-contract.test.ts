import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	DEFAULT_GRAPH_WORKSPACE_CONFIG,
	parseGraphWorkspaceConfig,
} from '@/ui/component/graph-workspace/graphWorkspaceDefaults';

const config = parseGraphWorkspaceConfig(JSON.parse(readFileSync('templates/config/graph-workspace.json', 'utf8')));
assert.deepEqual(config, DEFAULT_GRAPH_WORKSPACE_CONFIG, 'template config and compiled fallback remain synchronized');
assert.ok(config.motion.viewThumbMs >= 75 && config.motion.viewThumbMs <= 110);
assert.ok(config.motion.scopeThumbMs >= 80 && config.motion.scopeThumbMs <= 115);
assert.ok(config.motion.projectionThumbMs >= 90 && config.motion.projectionThumbMs <= 125);
assert.ok(config.motion.scopeExpandMs <= 120);
assert.equal(config.labels.physicalProjections['flow-lr'], 'Flow →');
assert.equal(config.labels.physicalProjections['flow-tb'], '↓');

const control = readFileSync('src/ui/component/graph-workspace/GraphWorkspaceControl.tsx', 'utf8');
assert.match(control, /useReducedMotion/, 'the shared control honors reduced-motion preference');
assert.match(control, /AnimatePresence/, 'scope items enter and leave the same continuous control');
assert.match(control, /data-graph-workspace-scope-extension/, 'scope is modeled as the Graph option extension');
assert.doesNotMatch(control, /Links →|Links ↓/, 'legacy Links copy is absent from the public workspace');

console.log('graph-workspace-motion-contract: passed');
