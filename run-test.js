#!/usr/bin/env node

/**
 * Universal Test Runner for TypeScript Test Files (parallel)
 *
 * - Uses esbuild's JS API in-process (no per-file `npx esbuild` spawn)
 * - Compiles+runs N tests concurrently (default: min(cpus, 8))
 * - Per-file stdout/stderr buffered; only failed tests print full output
 *
 * Usage:
 *   node run-test.js                            # All .test.ts under test/
 *   node run-test.js path/to/specific.test.ts   # Specific file(s)
 *   TEST_CONCURRENCY=4 node run-test.js         # Override worker count
 *   TEST_VERBOSE=1 node run-test.js             # Print output even on success
 */

const { build } = require('esbuild');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const args = process.argv.slice(2);
let testFiles = [];

if (args.length > 0) {
    testFiles = args.map((arg) => (arg.endsWith('.test.ts') ? arg : `${arg}.test.ts`));
} else {
    function findTestFiles(dir) {
        const out = [];
        for (const item of fs.readdirSync(dir)) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                out.push(...findTestFiles(fullPath));
            } else if (item.endsWith('.test.ts')) {
                out.push(fullPath);
            }
        }
        return out;
    }
    testFiles = findTestFiles('test');
}

if (testFiles.length === 0) {
    console.log('❌ No test files found!');
    process.exit(1);
}

const CONCURRENCY = Math.max(
    1,
    parseInt(process.env.TEST_CONCURRENCY || '', 10) || Math.min(os.cpus().length, 8),
);
const VERBOSE = process.env.TEST_VERBOSE === '1';
const obsidianStub = path.join(__dirname, 'test', 'stubs', 'obsidian-stub.cjs');
// Place temp files inside the project so `packages: 'external'` requires
// resolve against the project's node_modules (esbuild externalises
// dependencies without rewriting their require paths).
const tmpDir = fs.mkdtempSync(path.join(__dirname, '.tmp-tests-'));
process.on('exit', () => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
});

console.log(`Running ${testFiles.length} test file(s) with concurrency ${CONCURRENCY}...\n`);

async function runOne(testFile, idx) {
    const testName = path.basename(testFile, '.test.ts');
    const outFile = path.join(tmpDir, `${idx}-${testName}.js`);
    const started = Date.now();

    try {
        await build({
            entryPoints: [testFile],
            bundle: true,
            format: 'cjs',
            outfile: outFile,
            platform: 'node',
            tsconfig: 'tsconfig.json',
            alias: { obsidian: obsidianStub },
            packages: 'external',
            logLevel: 'silent',
            sourcemap: false,
        });
    } catch (err) {
        return {
            testFile,
            testName,
            status: 'compile-error',
            durationMs: Date.now() - started,
            stdout: '',
            stderr: String((err && err.message) || err),
        };
    }

    const perTestTimeoutMs = parseInt(process.env.TEST_TIMEOUT_MS || '', 10) || 30000;
    // Tests are synchronous assertion scripts but many leak open handles
    // (native sqlite, intervals, etc.) and never exit naturally. Wrap the
    // bundle in a tiny harness that forces process.exit after sync run.
    return new Promise((resolve) => {
        const harness = `process.on('uncaughtException',(e)=>{console.error(e&&e.stack||e);process.exit(1);});require(${JSON.stringify(outFile)});setImmediate(()=>process.exit(0));`;
        const child = spawn('node', ['-e', harness], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            try { child.kill('SIGKILL'); } catch (_) {}
        }, perTestTimeoutMs);
        child.stdout.on('data', (d) => (stdout += d.toString()));
        child.stderr.on('data', (d) => (stderr += d.toString()));
        child.on('error', (err) => {
            clearTimeout(timer);
            resolve({
                testFile,
                testName,
                status: 'spawn-error',
                durationMs: Date.now() - started,
                stdout,
                stderr: String((err && err.message) || err),
            });
        });
        child.on('exit', (code) => {
            clearTimeout(timer);
            fs.promises.unlink(outFile).catch(() => {});
            resolve({
                testFile,
                testName,
                status: timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail',
                durationMs: Date.now() - started,
                stdout,
                stderr: timedOut
                    ? stderr + `\n[runner] killed after ${perTestTimeoutMs}ms timeout`
                    : stderr,
            });
        });
    });
}

async function pool(items, n, worker) {
    const results = new Array(items.length);
    let next = 0;
    const runners = Array.from({ length: n }, async () => {
        while (true) {
            const i = next++;
            if (i >= items.length) return;
            results[i] = await worker(items[i], i);
            const r = results[i];
            const dur = `${(r.durationMs / 1000).toFixed(1)}s`;
            if (r.status === 'pass') {
                process.stdout.write(`✅ ${r.testName} (${dur})\n`);
                if (VERBOSE && r.stdout) {
                    process.stdout.write(indent(r.stdout));
                }
            } else {
                process.stdout.write(`❌ ${r.testName} [${r.status}] (${dur})\n`);
                if (r.stdout) process.stdout.write(indent(r.stdout));
                if (r.stderr) process.stderr.write(indent(r.stderr));
            }
        }
    });
    await Promise.all(runners);
    return results;
}

function indent(s) {
    return s.replace(/^/gm, '   ').replace(/\s+$/, '') + '\n';
}

(async () => {
    const start = Date.now();
    const results = await pool(testFiles, CONCURRENCY, runOne);

    let passed = 0;
    let failed = 0;
    const failedNames = [];
    for (const r of results) {
        if (r.status === 'pass') passed++;
        else {
            failed++;
            failedNames.push(r.testName);
        }
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });

    const totalSec = ((Date.now() - start) / 1000).toFixed(1);
    if (failed === 0) {
        console.log(`\n🎉 All ${testFiles.length} test file(s) passed in ${totalSec}s.`);
    } else {
        console.log(`\n⚠️  ${failed} failed / ${passed} passed (of ${testFiles.length}) in ${totalSec}s.`);
        console.log('Failed:');
        for (const name of failedNames) console.log(`  - ${name}`);
        process.exit(1);
    }
})().catch((err) => {
    console.error('Runner crashed:', err);
    process.exit(2);
});
