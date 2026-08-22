import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const workspace = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/view/vault-intelligence/VaultIntelligenceWorkspace.tsx'), 'utf8');
const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/peak-components.css'), 'utf8');

assert.match(workspace, /`\$\{formatNumber\(value\)\} \/ \$\{formatNumber\(total\)\}`/, 'readiness rows must use compact ready / eligible numbers');
assert.doesNotMatch(workspace, /indexed ·|current Vault objects · rebuild needed/, 'readiness rows must not carry verbose baseline prose');
assert.match(css, /\.pk-vi-index-meters \{[\s\S]*?grid-template-columns:\s*126px minmax\(220px, 1fr\) max-content;/, 'all readiness rows must share the widest trailing value column');
assert.match(css, /\.pk-vi-index-meter \{[\s\S]*?display:\s*contents;/, 'readiness rows must participate in the shared parent grid');

console.log('vault-intelligence-index-readiness-presentation: passed');
