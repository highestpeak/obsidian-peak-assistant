/**
 * Peak Composer — result renderer & materializer dispatch (WP3, CMP-AI-04).
 *
 * Spec §10 / §15.1: renderers and materializers dispatch on declared result
 * kind + renderer ID — never on a capability label — and an unknown renderer
 * id resolves to the VISIBLE unsupported fallback instead of silently
 * dropping the candidate.
 */

import fs from 'fs';
import path from 'path';
import {
	createDefaultResultMaterializers,
	createPolishDefinition,
	createProseCapabilityPack,
	createTextPatchMaterializer,
	DEFAULT_COMPOSER_CAPABILITIES_CONFIG,
} from '@/service/composer';
import {
	COMPOSER_STREAMING_TEXT_RENDERER_ID,
	COMPOSER_ANALYSIS_RENDERER_ID,
	COMPOSER_TEXT_PATCH_WRITEBACK_ID,
	type ComposerContextSnapshot,
} from '@/core/composer';
import {
	createDefaultCandidateRendererRegistry,
	AnalysisCandidateCard,
	StreamingTextCandidateCard,
	UnsupportedCandidateCard,
} from '@/ui/view/composer/candidates';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();
const config = () => DEFAULT_COMPOSER_CAPABILITIES_CONFIG;

const SNAPSHOT: ComposerContextSnapshot = {
	documentId: 'doc.md',
	revision: 'r-x',
	target: { kind: 'block', blockId: 'b1' },
	targetSource: 'original',
};

function testMaterializerRegistry(): void {
	const registry = createDefaultResultMaterializers();
	check('default materializers cover text-patch', registry.has('text-patch'));
	check('default materializers cover read-only analysis', registry.has('analysis'));

	const definition = createPolishDefinition(config);
	const envelope = registry.resolve('text-patch').materialize({
		definition,
		snapshot: SNAPSHOT,
		text: 'Polished text.',
	});
	check('envelope kind is text-patch', envelope.resultKind === 'text-patch');
	check('envelope carries the definition rendererId', envelope.rendererId === COMPOSER_STREAMING_TEXT_RENDERER_ID);
	check('envelope carries the writeback adapter id', envelope.writebackAdapterId === COMPOSER_TEXT_PATCH_WRITEBACK_ID);
	check(
		'payload is the schema-validated replacement text',
		(envelope.payload as { replacementText: string }).replacementText === 'Polished text.',
	);

	let threw = false;
	try {
		registry.resolve('table-patch');
	} catch {
		threw = true;
	}
	check('unknown result kind fails loud', threw);

	let duplicateThrew = false;
	try {
		registry.register(createTextPatchMaterializer());
	} catch {
		duplicateThrew = true;
	}
	check('duplicate materializer registration refused', duplicateThrew);
}

function testRendererRegistry(): void {
	const registry = createDefaultCandidateRendererRegistry();
	check('streaming-text renderer registered', registry.has(COMPOSER_STREAMING_TEXT_RENDERER_ID));
	check('analysis renderer registered', registry.has(COMPOSER_ANALYSIS_RENDERER_ID));

	const resolved = registry.resolve(COMPOSER_STREAMING_TEXT_RENDERER_ID);
	check('renderer resolves by id', resolved.component === StreamingTextCandidateCard && !resolved.unsupported);
	const analysis = registry.resolve(COMPOSER_ANALYSIS_RENDERER_ID);
	check('analysis renderer resolves by id', analysis.component === AnalysisCandidateCard && !analysis.unsupported);

	const unknown = registry.resolve('composer.renderer.does-not-exist');
	check('unknown renderer id → visible unsupported fallback', unknown.unsupported && unknown.component === UnsupportedCandidateCard);

	const nullResolved = registry.resolve(null);
	check('null renderer id → visible unsupported fallback', nullResolved.unsupported);

	let duplicateThrew = false;
	try {
		registry.register(COMPOSER_STREAMING_TEXT_RENDERER_ID, StreamingTextCandidateCard);
	} catch {
		duplicateThrew = true;
	}
	check('duplicate renderer registration refused', duplicateThrew);
}

function testPackRendererCoverage(): void {
	// Cross-registry conformance: every rendererId declared by a shipped pack
	// must have a UI binding — an unbound id would ship the fallback card.
	const registry = createDefaultCandidateRendererRegistry();
	for (const def of createProseCapabilityPack(config).definitions()) {
		check(`renderer binding exists for '${def.manifest.id}'`, registry.has(def.rendererId), def.rendererId);
	}
}

function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function testNoLabelDispatch(): void {
	// Source guard: the dispatch modules must not branch on presentation
	// fields — `title` / `label` identifiers and `id.includes(...)` may not
	// appear in the CODE (comments stripped) of the dispatch sources.
	const files = [
		'src/ui/view/composer/candidates/rendererRegistry.ts',
		'src/service/composer/capabilities/resultMaterializers.ts',
		'src/service/composer/capabilities/writebackAdapters.ts',
	];
	for (const file of files) {
		const source = stripComments(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
		check(`${file} has no title-based dispatch`, !/\btitle\b/.test(source), file);
		check(`${file} has no label-based dispatch`, !/\blabel\b/i.test(source), file);
		check(`${file} has no id-substring dispatch`, !/id\.includes\(/.test(source), file);
	}
}

testMaterializerRegistry();
testRendererRegistry();
testPackRendererCoverage();
testNoLabelDispatch();
done('composer-result-renderer');
