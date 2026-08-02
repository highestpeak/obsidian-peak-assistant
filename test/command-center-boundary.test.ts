import assert from 'assert';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';

const registry = readFileSync('src/core/template/TemplateRegistry.ts', 'utf8');
assert.match(registry, /CommandCenter:\s*'config-command-center'/);
assert.match(registry, /ConfigTemplateId\.CommandCenter\]: meta\('config', 'command-center-defaults'/);

const main = readFileSync('main.ts', 'utf8');
assert.match(main, /setCommandCenterRuntime/);
assert.match(main, /openCommandCenter:/);
assert.match(main, /id: binding\.commandId/);
assert.doesNotMatch(main, /hotkeys:\s*\[/, 'Command Center must not assign a default hotkey');

const runtime = readFileSync('src/app/command-center/CommandCenterRuntime.ts', 'utf8');
assert.match(runtime, /this\.config\.groups/);
assert.match(runtime, /normalizedQuery && !searchable\.includes/, 'runtime search must filter configured items');
const resolveSection = runtime.slice(runtime.indexOf('async resolveItems'), runtime.indexOf('async getCatalog'));
assert.doesNotMatch(resolveSection, /listCatalog/, 'runtime launcher search must not expand into the full catalog');

const privateReaders = execFileSync('rg', [
	'-l',
	'app as App.*commands|app\.commands\.commands|commands\?\.commands',
	'src/core',
	'src/service',
	'src/ui',
	'src/app/command-center',
], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
assert.deepStrictEqual(
	privateReaders,
	['src/app/command-center/ObsidianCommandCenterAdapter.ts'],
	'private Obsidian command catalog access must stay in the app compatibility adapter',
);

const modal = readFileSync('src/ui/view/command-center/CommandCenterSurface.tsx', 'utf8');
const home = readFileSync('src/ui/view/command-center/CommandCenterHome.tsx', 'utf8');
const customize = readFileSync('src/ui/view/command-center/CommandCenterCustomize.tsx', 'utf8');
assert.match(modal, /runtime: CommandCenterRuntimePort/);
assert.match(home, /runtime: CommandCenterRuntimePort/);
assert.match(home, /runtime\.openCustomize\(\)/, 'Home must enter Customize directly');
assert.match(customize, /pk-cc-directory/, 'Customize must keep one continuous catalog');
assert.doesNotMatch(customize, /ADDED TO|AVAILABLE COMMANDS|window\.confirm/i, 'Customize must not split or jump between membership regions');

const css = readFileSync('src/styles/command-center.css', 'utf8');
assert.match(css, /peak-command-center-modal:has\(\.pk-cc-customize\)[\s\S]*?680px/);
assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(css, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
assert.match(css, /\.pk-cc-action--grid[\s\S]*?height: 60px !important/);
assert.match(css, /prefers-reduced-motion: reduce/);

console.log('command-center-boundary: passed');
