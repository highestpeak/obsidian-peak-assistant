import Handlebars from 'handlebars';
import { humanReadableTime } from '@/core/utils/date-utils';
import yaml from 'js-yaml';

/** Compiled template function. Single type for all callers so they need not import Handlebars. */
export type CompiledTemplate = (data: Record<string, unknown>) => string;

/**
 * Compile a Handlebars template string. Callers may cache the result.
 * Ensures registerTemplateEngineHelpers() has run (helpers are used by templates).
 */
export function compileTemplate(template: string): CompiledTemplate {
	registerTemplateEngineHelpers();
	return Handlebars.compile(template) as CompiledTemplate;
}

/** Bounded cache for tool buildResponse to avoid re-compiling the same template every call. */
const MAX_COMPILE_CACHE = 64;
const buildResponseCompileCache = new Map<string, CompiledTemplate>();

/**
 * Get a compiled template, with bounded cache (for buildResponse). Call clearBuildResponseCompileCache() on plugin unload.
 */
export function getCompiledBounded(template: string): CompiledTemplate {
	let fn = buildResponseCompileCache.get(template);
	if (!fn) {
		if (buildResponseCompileCache.size >= MAX_COMPILE_CACHE) {
			const firstKey = buildResponseCompileCache.keys().next().value;
			if (firstKey !== undefined) buildResponseCompileCache.delete(firstKey);
		}
		fn = compileTemplate(template);
		buildResponseCompileCache.set(template, fn);
	}
	return fn;
}

/** Call on plugin unload to release compiled template references. */
export function clearBuildResponseCompileCache(): void {
	buildResponseCompileCache.clear();
}

/** Helper names we register; unregister on unload so HandlebarsEnvironment can release _exception2 and error refs. */
const REGISTERED_HELPER_NAMES = [
	'join', 'humanReadableTime', 'eq', 'gt', 'lt', 'gte', 'lte',
	'take', 'toJson',
	'formatNodeLabel', 'hasNodeType', 'inc', 'toYaml', 'similarLabel', 'lookup', 'nonEmpty', 'flattenEvidenceFacts'
];

/**
 * Unregister Handlebars helpers, clear partials and any internal caches. Call on plugin unload to break
 * HandlebarsEnvironment retention chain (Exception/OperationalError in bundle main.js).
 */
export function clearTemplateEngineForUnload(): void {
	clearBuildResponseCompileCache();
	try {
		for (const name of REGISTERED_HELPER_NAMES) {
			if (typeof (Handlebars as any).unregisterHelper === 'function') {
				(Handlebars as any).unregisterHelper(name);
			}
		}
		helpersRegistered = false;
		// Unregister all partials (Handlebars.partials is the registry object in 4.x) to release template/Exception refs
		const partials = (Handlebars as any).partials;
		if (partials && typeof partials === 'object') {
			for (const key of Object.keys(partials)) {
				try {
					if (typeof (Handlebars as any).unregisterPartial === 'function') {
						(Handlebars as any).unregisterPartial(key);
					}
				} catch (_) { /* ignore */ }
			}
		}
	} catch (_) { /* ignore */ }
}

let helpersRegistered = false;

/**
 * Register global Handlebars helpers once. Idempotent to avoid duplicate helpers and closure retention on re-init.
 */
export function registerTemplateEngineHelpers() {
    if (helpersRegistered) return;
    helpersRegistered = true;

    Handlebars.registerHelper('join', (array: unknown[] | unknown, separator: string) =>
        Array.isArray(array) ? array.join(separator ?? ',') : String(array ?? '')
    );
    /** Take first N items from an array; returns [] for non-array inputs. */
    Handlebars.registerHelper('take', (arr: unknown, n: number) => {
        if (!Array.isArray(arr)) return [];
        const limit = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
        return arr.slice(0, limit);
    });
    /** Truncate string to maxLen chars; append "..." if truncated. */
    Handlebars.registerHelper('truncate', (str: unknown, maxLen: number) => {
        const s = typeof str === 'string' ? str : String(str ?? '');
        const len = typeof maxLen === 'number' ? maxLen : 300;
        if (s.length <= len) return s;
        return s.slice(0, len) + '...';
    });
    /** JSON.stringify for objects/arrays; returns empty string for non-values. */
    Handlebars.registerHelper('toJson', (value: unknown) => {
        if (value === undefined || value === null) return '';
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    });
    Handlebars.registerHelper('humanReadableTime', function (timestamp: number) {
        return timestamp ? humanReadableTime(timestamp) : 'N/A';
    });
    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });
    Handlebars.registerHelper('gt', function (a, b) {
        return a > b;
    });
    Handlebars.registerHelper('lt', function (a, b) {
        return a < b;
    });
    Handlebars.registerHelper('gte', function (a, b) {
        return a >= b;
    });
    Handlebars.registerHelper('lte', function (a, b) {
        return a <= b;
    });
    /** Returns " _(N similar)_" when count > 1, else "". Use in partials so sameGroupCount is passed explicitly. */
    Handlebars.registerHelper('similarLabel', function (count: number | undefined) {
        const n = typeof count === 'number' ? count : 0;
        return n > 1 ? ` _(${n} similar)_` : '';
    });
    /** (obj, key) => obj[key]. Use e.g. (lookup @root.sameGroupCountByLinkPath linkPath) so value comes from root. */
    Handlebars.registerHelper('lookup', function (obj: unknown, key: string) {
        return obj != null && typeof obj === 'object' && key != null
            ? (obj as Record<string, unknown>)[key]
            : undefined;
    });
    /** True only when value is an array with at least one element (use for {{#if (nonEmpty children)}}). */
    Handlebars.registerHelper('nonEmpty', (arr: unknown) => Array.isArray(arr) && arr.length > 0);
    /** Flatten evidence packs to fact-only entries for templates: [{ n, claim, sourceId }]. No summary or fallback logic; template should output summary per pack. */
    Handlebars.registerHelper('flattenEvidenceFacts', (packs: unknown) => {
        if (!Array.isArray(packs)) return [];
        const out: Array<{ n: number; claim: string; sourceId: string }> = [];
        let n = 0;
        for (let i = 0; i < packs.length; i++) {
            const p = packs[i] as { facts?: Array<{ claim?: string }> };
            const sourceId = `S${i + 1}`;
            const facts = Array.isArray(p?.facts) ? p.facts : [];
            for (const f of facts) {
                n++;
                const claim = (f?.claim ?? '').trim();
                out.push({ n, claim, sourceId });
            }
        }
        return out;
    });
    Handlebars.registerHelper('formatNodeLabel', function (label, type) {
        switch (type) {
            case 'tag':
                return `#${label}`;
            case 'category':
                return `📁${label}`;
            case 'document':
            default:
                return `[[${label}]]`;
        }
    });
    Handlebars.registerHelper('hasNodeType', function (nodes, nodeType) {
        return nodes.some((node: any) => node.nodeType === nodeType);
    });
    Handlebars.registerHelper('inc', function (value) {
        return parseInt(value) + 1;
    });
    /** Repeat spaces for tree indent: depth 0 => '', depth 1 => 4 spaces, etc. */
    Handlebars.registerHelper('indent', function (depth: number) {
        const d = Number(depth) || 0;
        return ' '.repeat(4 * d);
    });
    Handlebars.registerHelper('toYaml', (jsonStr, baseIndent) => {
        try {
            const obj = JSON.parse(jsonStr);
            // dump the object to a nicely indented YAML string
            const rawYaml = yaml.dump(obj, {
                indent: 2,
                skipInvalid: true,
                // disable automatic wrapping
                lineWidth: -1,
                noRefs: true,
                // force double quotes instead of block mode
                quotingType: '"'
            }).trim();

            // prepare the indent spaces (if the template doesn't pass indentSize, default to 0)
            const spaces = ' '.repeat(typeof baseIndent === 'number' ? baseIndent : 0);

            // add the indent spaces to each line
            return rawYaml.split('\n').map(line => `${spaces}${line}`).join('\n')
        } catch {
            return jsonStr;
        }
    });
}
