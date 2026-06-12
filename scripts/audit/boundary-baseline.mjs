#!/usr/bin/env node
// Boundary baseline scanner for Peak Assistant modernization (T0).
//
// What it does:
//   * Walk `src/**/*.{ts,tsx}` and parse each file's import statements.
//   * Classify every import edge by source/target architectural layer.
//   * Surface cross-layer violations and side-effect leaks that block
//     T1 Contract Seeds, T2 Port Sketches, and T4 Capability Replacement.
//   * Emit a deterministic markdown report (stdout by default; --out <file> to write).
//   * Refuse to fail the build: this is a diagnostic, not a gate.
//
// What it intentionally does NOT do:
//   * No code edits, no behavior changes.
//   * No fancy AST parsing — a tolerant regex scanner is good enough for a baseline
//     and keeps the script dependency-free.
//   * No CI enforcement yet (T1+ task).
//
// Layer model (from CLAUDE.md and the modernization handbook):
//   app/      -> Obsidian integration shell (commands, events, settings, view lifecycle, AppContext)
//   service/  -> Business logic (chat, search, copilot, ambient, agents, tools, ...)
//   core/     -> Framework-agnostic abstractions (providers, storage, schemas, templates, utils)
//   ui/       -> React layer (views, components, hooks, stores)
//
// Intended direction (handbook): app -> service -> core/ports -> adapters.
// Anything that points "uphill" or sideways (core importing service, service importing UI)
// is flagged.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, extname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const SRC_ROOT = join(REPO_ROOT, 'src');

const LAYERS = ['app', 'core', 'service', 'ui'];
const SCAN_EXT = new Set(['.ts', '.tsx']);

// Obsidian symbols that imply runtime side effects (UI affordances, notifications,
// vault mutations, command surface). When service/core imports any of these, the
// downstream behavior cannot be faked or unit-tested without Obsidian itself.
const OBSIDIAN_SIDE_EFFECT_SYMBOLS = new Set([
  'Notice',
  'Modal',
  'MarkdownView',
  'setIcon',
  'Setting',
  'ItemView',
  'View',
  'PluginSettingTab',
  'addIcon',
  'requestUrl',
  'normalizePath',
  'stringifyYaml',
  'parseYaml',
  'Menu',
  'MenuItem',
  'Platform',
]);

// ---------- utilities ----------

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walk(full)));
      continue;
    }
    if (!ent.isFile()) continue;
    if (!SCAN_EXT.has(extname(ent.name))) continue;
    out.push(full);
  }
  return out;
}

function layerOf(absPath) {
  const rel = relative(SRC_ROOT, absPath);
  if (rel.startsWith('..')) return null;
  const seg = rel.split(/[\\/]/, 1)[0];
  return LAYERS.includes(seg) ? seg : null;
}

function resolveImportPath(fromFile, spec) {
  if (spec.startsWith('@/')) {
    return join(SRC_ROOT, spec.slice(2));
  }
  if (spec.startsWith('.')) {
    return resolve(dirname(fromFile), spec);
  }
  return null; // external package
}

// Extract import statements. Tolerant of multi-line braces, default imports,
// type-only imports, and side-effect imports.
function extractImports(content) {
  const results = [];
  const re = /import\b([\s\S]*?)from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const clause = m[1];
    const source = m[2];
    const names = new Set();
    let typeOnly = false;
    const trimmed = clause.trim();
    if (/^type\b/.test(trimmed)) typeOnly = true;
    const brace = clause.match(/\{([\s\S]*?)\}/);
    if (brace) {
      for (const raw of brace[1].split(',')) {
        const token = raw.trim();
        if (!token) continue;
        const stripped = token.replace(/^type\s+/, '');
        const local = stripped.split(/\s+as\s+/)[0].trim();
        if (local) names.add(local);
      }
    }
    results.push({ source, names, typeOnly });
  }
  // Side-effect imports: `import 'x';`
  const sideRe = /import\s*['"]([^'"]+)['"]/g;
  while ((m = sideRe.exec(content)) !== null) {
    results.push({ source: m[1], names: new Set(), typeOnly: false, sideEffect: true });
  }
  return results;
}

function classifyEdge(fromLayer, toLayer, spec, names, typeOnly) {
  // Returns { category, reason } or null for ignored / external.
  if (!fromLayer) return null;

  if (spec === 'obsidian' || spec.startsWith('obsidian/')) {
    const hits = [...names].filter((n) => OBSIDIAN_SIDE_EFFECT_SYMBOLS.has(n));
    if (fromLayer === 'service' || fromLayer === 'core') {
      if (hits.length > 0) {
        return {
          category: 'service-or-core->obsidian-side-effect',
          reason: `imports concrete Obsidian surface: ${hits.join(', ')}`,
        };
      }
      return {
        category: 'service-or-core->obsidian-types',
        reason: `imports Obsidian types${typeOnly ? ' (type-only)' : ''}: ${[...names].join(', ') || '(default/namespace)'}`,
      };
    }
    return null; // ui/app -> obsidian is expected
  }

  if (!toLayer) return null; // external package
  if (toLayer === fromLayer) return null; // intra-layer

  // Direction matrix.
  // Allowed downhill direction: app -> service -> core, ui -> service -> core.
  if (fromLayer === 'core') {
    return {
      category: 'core->upstream',
      reason: `core imports ${toLayer}: ${spec}${typeOnly ? ' (type-only)' : ''}`,
    };
  }
  if (fromLayer === 'service' && toLayer === 'ui') {
    return {
      category: 'service->ui',
      reason: `service imports UI: ${spec}${typeOnly ? ' (type-only)' : ''}`,
    };
  }
  if (fromLayer === 'service' && toLayer === 'app') {
    return {
      category: 'service->app',
      reason: `service imports app shell: ${spec}${typeOnly ? ' (type-only)' : ''}`,
    };
  }
  if (fromLayer === 'ui' && toLayer === 'app') {
    return {
      category: 'ui->app',
      reason: `ui imports app shell: ${spec}${typeOnly ? ' (type-only)' : ''}`,
    };
  }
  return null;
}

// ---------- scan ----------

async function scan() {
  const files = await walk(SRC_ROOT);
  const findings = []; // { from, fromLayer, toLayer, spec, category, reason }
  const stats = {
    filesScanned: files.length,
    layerImports: Object.fromEntries(LAYERS.map((l) => [l, Object.fromEntries(LAYERS.map((m) => [m, 0]))])),
    obsidianImportsByLayer: Object.fromEntries(LAYERS.map((l) => [l, 0])),
    appContextRefsByLayer: Object.fromEntries(LAYERS.map((l) => [l, 0])),
    zustandStoresInUi: [],
    zustandStoresOutsideUi: [],
    obsidianSideEffectInService: new Set(),
  };
  const categoryCounts = new Map();

  for (const file of files) {
    const fromLayer = layerOf(file);
    if (!fromLayer) continue;
    const content = await readFile(file, 'utf8');

    // AppContext.getInstance leak counter.
    const ctxMatches = content.match(/AppContext\.getInstance\b/g);
    if (ctxMatches) stats.appContextRefsByLayer[fromLayer] += ctxMatches.length;

    // Zustand store inventory (rough): files defining `create<...>(...)` from 'zustand'.
    if (/from\s+['"]zustand['"]/.test(content) && /\bcreate[<(]/.test(content)) {
      const relPath = posix.normalize(relative(REPO_ROOT, file).split(/[\\/]/).join('/'));
      if (fromLayer === 'ui') stats.zustandStoresInUi.push(relPath);
      else stats.zustandStoresOutsideUi.push(relPath);
    }

    const imports = extractImports(content);
    for (const imp of imports) {
      const resolved = resolveImportPath(file, imp.source);
      const toLayer = resolved ? layerOf(resolved) : null;

      if (toLayer && fromLayer !== toLayer) {
        stats.layerImports[fromLayer][toLayer] += 1;
      }
      if (imp.source === 'obsidian' || imp.source.startsWith('obsidian/')) {
        stats.obsidianImportsByLayer[fromLayer] += 1;
      }

      const edge = classifyEdge(fromLayer, toLayer, imp.source, imp.names, imp.typeOnly);
      if (!edge) continue;

      const finding = {
        from: posix.normalize(relative(REPO_ROOT, file).split(/[\\/]/).join('/')),
        fromLayer,
        toLayer,
        spec: imp.source,
        category: edge.category,
        reason: edge.reason,
        typeOnly: imp.typeOnly,
      };
      findings.push(finding);
      categoryCounts.set(edge.category, (categoryCounts.get(edge.category) ?? 0) + 1);
      if (edge.category === 'service-or-core->obsidian-side-effect' && fromLayer === 'service') {
        stats.obsidianSideEffectInService.add(finding.from);
      }
    }
  }

  stats.zustandStoresInUi.sort();
  stats.zustandStoresOutsideUi.sort();
  return { findings, stats, categoryCounts };
}

// ---------- render ----------

const CATEGORY_ORDER = [
  ['service->ui', 'Service -> UI (reverse-direction violation)'],
  ['core->upstream', 'Core -> Service/App/UI (lower layer importing upper)'],
  ['service-or-core->obsidian-side-effect', 'Service/Core -> Obsidian side-effect surface (Notice/Modal/MarkdownView/...)'],
  ['service->app', 'Service -> app shell (AppContext / settings types leak)'],
  ['service-or-core->obsidian-types', 'Service/Core -> Obsidian types (Port-extraction targets)'],
  ['ui->app', 'UI -> app shell (informational)'],
];

function groupByCategory(findings) {
  const groups = new Map();
  for (const f of findings) {
    if (!groups.has(f.category)) groups.set(f.category, []);
    groups.get(f.category).push(f);
  }
  return groups;
}

function topFromFiles(findings, n = 10) {
  const counts = new Map();
  for (const f of findings) counts.set(f.from, (counts.get(f.from) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function renderMarkdown({ findings, stats, categoryCounts }) {
  const lines = [];
  const totalCrossLayer = [...categoryCounts.values()].reduce((a, b) => a + b, 0);
  lines.push('# Boundary Baseline Report');
  lines.push('');
  lines.push('> Generated by `scripts/audit/boundary-baseline.mjs` (T0 modernization baseline).');
  lines.push('> Run `npm run audit:boundary` to refresh. This report is diagnostic, not a CI gate.');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push(`- Files scanned: **${stats.filesScanned}** under \`src/\``);
  lines.push(`- Layers: ${LAYERS.map((l) => '`' + l + '`').join(', ')}`);
  lines.push(`- Total flagged cross-layer / side-effect edges: **${totalCrossLayer}**`);
  lines.push('');

  lines.push('## Layer import matrix');
  lines.push('');
  lines.push('Row = source layer, column = target layer. Counts include relative and `@/` imports inside `src/`. Type-only imports are counted as imports because they still pin the architectural shape.');
  lines.push('');
  lines.push(`| from \\ to | ${LAYERS.join(' | ')} |`);
  lines.push(`| --- | ${LAYERS.map(() => '---:').join(' | ')} |`);
  for (const from of LAYERS) {
    const row = LAYERS.map((to) => (from === to ? '—' : String(stats.layerImports[from][to])));
    lines.push(`| **${from}** | ${row.join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Obsidian coupling by layer');
  lines.push('');
  lines.push('| Layer | `import ... from "obsidian"` count |');
  lines.push('| --- | ---: |');
  for (const layer of LAYERS) {
    lines.push(`| ${layer} | ${stats.obsidianImportsByLayer[layer]} |`);
  }
  lines.push('');
  lines.push(`Service files that import an Obsidian side-effect symbol: **${stats.obsidianSideEffectInService.size}**.`);
  lines.push('');

  lines.push('## AppContext.getInstance leak count');
  lines.push('');
  lines.push('`AppContext` is the app-shell DI container. Each non-app reference is a candidate for a Port-style injection during T2.');
  lines.push('');
  lines.push('| Layer | `AppContext.getInstance` references |');
  lines.push('| --- | ---: |');
  for (const layer of LAYERS) {
    lines.push(`| ${layer} | ${stats.appContextRefsByLayer[layer]} |`);
  }
  lines.push('');

  lines.push('## Zustand store inventory');
  lines.push('');
  lines.push(`Stores defined inside \`ui/\`: **${stats.zustandStoresInUi.length}**.
Stores defined outside \`ui/\`: **${stats.zustandStoresOutsideUi.length}** (any non-zero is a state-ownership risk).`);
  lines.push('');
  if (stats.zustandStoresInUi.length > 0) {
    lines.push('<details><summary>UI store files</summary>');
    lines.push('');
    for (const p of stats.zustandStoresInUi) lines.push(`- \`${p}\``);
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }
  if (stats.zustandStoresOutsideUi.length > 0) {
    lines.push('### Stores outside `ui/` (review for state-truth misownership)');
    lines.push('');
    for (const p of stats.zustandStoresOutsideUi) lines.push(`- \`${p}\``);
    lines.push('');
  }

  lines.push('## Findings by category');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('| --- | ---: |');
  for (const [code, label] of CATEGORY_ORDER) {
    lines.push(`| ${label} | ${categoryCounts.get(code) ?? 0} |`);
  }
  lines.push('');

  lines.push('## Top offender files');
  lines.push('');
  lines.push('Files with the highest number of flagged cross-layer / side-effect edges. These are natural first candidates for T2 Port Sketches and T4 Capability Replacement.');
  lines.push('');
  lines.push('| File | Flagged edges |');
  lines.push('| --- | ---: |');
  for (const [file, count] of topFromFiles(findings, 15)) {
    lines.push(`| \`${file}\` | ${count} |`);
  }
  lines.push('');

  const groups = groupByCategory(findings);
  for (const [code, label] of CATEGORY_ORDER) {
    const items = groups.get(code) ?? [];
    lines.push(`## ${label}`);
    lines.push('');
    if (items.length === 0) {
      lines.push('_None detected._');
      lines.push('');
      continue;
    }
    lines.push(`Total: **${items.length}**.`);
    lines.push('');
    const limit = 50;
    const shown = items.slice(0, limit);
    lines.push('| From | Import |');
    lines.push('| --- | --- |');
    for (const f of shown) {
      const note = f.typeOnly ? ' _(type-only)_' : '';
      lines.push(`| \`${f.from}\` | \`${f.spec}\`${note} |`);
    }
    if (items.length > limit) {
      lines.push('');
      lines.push(`_... and ${items.length - limit} more. Re-run \`npm run audit:boundary -- --out <file>\` to capture the full list._`);
    }
    lines.push('');
  }

  lines.push('## How to refresh this baseline');
  lines.push('');
  lines.push('```bash');
  lines.push('# print to stdout');
  lines.push('npm run audit:boundary');
  lines.push('');
  lines.push('# write to a snapshot file');
  lines.push('node scripts/audit/boundary-baseline.mjs --out docs/superpowers/audits/$(date +%Y-%m-%d)-boundary-baseline.md');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// ---------- main ----------

function parseArgs(argv) {
  const out = { outPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') {
      out.outPath = argv[++i];
    } else if (a.startsWith('--out=')) {
      out.outPath = a.slice('--out='.length);
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(
      'Usage: node scripts/audit/boundary-baseline.mjs [--out <path>]\n' +
        '\n' +
        'Scans src/ for cross-layer imports and emits a markdown baseline report.\n' +
        'Prints to stdout by default. Use --out <path> to write a snapshot file.\n'
    );
    return;
  }
  const result = await scan();
  const md = renderMarkdown(result);
  if (args.outPath) {
    const abs = resolve(process.cwd(), args.outPath);
    await writeFile(abs, md + '\n', 'utf8');
    process.stderr.write(`wrote ${relative(REPO_ROOT, abs)} (${result.findings.length} findings)\n`);
  } else {
    process.stdout.write(md);
  }
}

main().catch((err) => {
  process.stderr.write(`boundary-baseline failed: ${err.stack || err.message}\n`);
  process.exit(1);
});
