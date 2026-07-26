// T2 composer architecture source guards.
//
// This test enforces Wave 10/closure-level constraints for the WP Composer
// architecture:
//   1) Source code under src/ cannot import/require/import() docs/gstack assets.
//   2) src/ui/view/composer/** cannot import provider adapters or provider SDK
//      modules, including imports that resolve into provider implementation paths.
//   3) src/service/composer/** and src/core/composer/** cannot keep module-level
//      mutable runtime singleton bindings or set/get-runtime registries.
//   4) Composer production paths cannot dispatch by presentation label or id
//      matching (`switch(action.id)`, `label === 'x'`, `id.includes(...)`).
//   5) Document-composer production modules cannot import protected Chat Composer
//      or CodeMirror modules/paths.

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, 'src');
const DOCS_GSTACK_ROOT = path.join(ROOT, 'docs', 'gstack');

const COMPOSER_UI_ROOT = path.join(SRC_ROOT, 'ui', 'view', 'composer');
const COMPOSER_SERVICE_ROOT = path.join(SRC_ROOT, 'service', 'composer');
const COMPOSER_APP_ROOT = path.join(SRC_ROOT, 'app', 'composer');
const COMPOSER_CORE_ROOT = path.join(SRC_ROOT, 'core', 'composer');

const COMPOSER_RUNTIME_ROOTS = [COMPOSER_SERVICE_ROOT, COMPOSER_CORE_ROOT];
const PRODUCER_SCOPES = [
	COMPOSER_APP_ROOT,
	COMPOSER_SERVICE_ROOT,
	COMPOSER_CORE_ROOT,
	COMPOSER_UI_ROOT,
];

const PROVIDER_ROOTS = [
	path.join(SRC_ROOT, 'core', 'providers'),
	path.join(SRC_ROOT, 'app', 'providers'),
	path.join(SRC_ROOT, 'service', 'providers'),
];

const PROTECTED_CHAT_COMPOSER_FILES = [
	path.resolve(ROOT, 'src/ui/view/chat-view/components/Composer.tsx'),
];

const PROTECTED_CHAT_COMPOSER_DIRS = [
	path.resolve(ROOT, 'src/ui/view/chat-view/components/composer'),
];

const PROTECTED_CODEMIRROR_DIRS = [];

const PROTECTED_CODEMIRROR_FILES = [
	path.resolve(ROOT, 'src/ui/component/mine/codemirror-input.tsx'),
];

const PROVIDER_PACKAGE_RE =
	/^(?:@ai-sdk\/|@anthropic(?:-ai)?\/sdk(?:\/|$)|@google\/generative-ai(?:\/|$)|@azure\/openai(?:\/|$)|openai(?:\/|$)|ollama(?:\/|$)|perplexity(?:\/|$)|cohere(?:\/|$)|mistral(?:\/|$)|deepseek(?:\/|$)|xai(?:\/|$)|groq(?:\/|$)|replicate(?:\/|$)|openrouter(?:\/|$))/i;

const CODEMIRROR_PACKAGE_RE =
	/^(?:@uiw\/react-codemirror(?:\/|$)|@codemirror\/|codemirror(?:\/|$))/i;

const PRESENTATION_SELECTOR_NAMES = new Set([
	'id',
	'label',
	'actionId',
	'actionLabel',
	'capabilityId',
	'capabilityLabel',
]);

const BINARY_DISPATCH_OPERATORS = new Set<ts.SyntaxKind>([
	ts.SyntaxKind.EqualsEqualsToken,
	ts.SyntaxKind.EqualsEqualsEqualsToken,
	ts.SyntaxKind.ExclamationEqualsToken,
	ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

interface Offense {
	file: string;
	line: number;
	code: string;
	reason: string;
}

interface ParsedFile {
	absPath: string;
	relPath: string;
	source: string;
	lines: string[];
	sourceFile: ts.SourceFile;
}

interface ImportReference {
	spec: string;
	node: ts.Node;
}

const parsedFileCache = new Map<string, ParsedFile>();
const importRefCache = new Map<string, ImportReference[]>();

function listSourceFiles(root: string): string[] {
	const out: string[] = [];
	if (!fs.existsSync(root)) return out;
	for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
		const full = path.join(root, entry.name);
		if (entry.isDirectory()) {
			out.push(...listSourceFiles(full));
		} else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
			out.push(full);
		}
	}
	return out.sort((a, b) => a.localeCompare(b));
}

function getParsedFile(absPath: string): ParsedFile {
	const cached = parsedFileCache.get(absPath);
	if (cached) return cached;

	const source = fs.readFileSync(absPath, 'utf8');
	const sourceFile = ts.createSourceFile(
		absPath,
		source,
		ts.ScriptTarget.Latest,
		true,
		absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);

	const parsed: ParsedFile = {
		absPath,
		relPath: path.relative(ROOT, absPath).replace(/\\/g, '/'),
		source,
		lines: source.split(/\r?\n/),
		sourceFile,
	};
	parsedFileCache.set(absPath, parsed);
	return parsed;
}

function getParsedFiles(root: string): ParsedFile[] {
	return listSourceFiles(root).map(getParsedFile);
}

function getParsedFilesFromRoots(roots: string[]): ParsedFile[] {
	const files = new Set<string>();
	for (const root of roots) {
		for (const file of listSourceFiles(root)) files.add(file);
	}
	return Array.from(files).sort((a, b) => a.localeCompare(b)).map(getParsedFile);
}

function lineOfNode(parsed: ParsedFile, node: ts.Node): number {
	return parsed.sourceFile.getLineAndCharacterOfPosition(node.getStart(parsed.sourceFile)).line + 1;
}

function codeLine(parsed: ParsedFile, line: number): string {
	return parsed.lines[line - 1] ?? '';
}

function makeOffense(parsed: ParsedFile, node: ts.Node, reason: string): Offense {
	const line = lineOfNode(parsed, node);
	return {
		file: parsed.relPath,
		line,
		reason,
		code: codeLine(parsed, line),
	};
}

function formatOffenses(offenses: Offense[]): string {
	return offenses
		.map((o) => `${o.file}:${o.line} ${o.reason}\n  ${o.code.trim()}`)
		.join('\n');
}

function failIfAny(offenses: Offense[], title: string): void {
	if (offenses.length === 0) return;
	offenses.sort((a, b) =>
		a.file.localeCompare(b.file) || a.line - b.line || a.reason.localeCompare(b.reason),
	);
	assert.fail(`${title}:\n${formatOffenses(offenses)}`);
}

function isStringLiteralLike(node: ts.Node | undefined): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
	return !!node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

function collectImportReferences(parsed: ParsedFile): ImportReference[] {
	const cached = importRefCache.get(parsed.absPath);
	if (cached) return cached;

	const refs: ImportReference[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isImportDeclaration(node) && isStringLiteralLike(node.moduleSpecifier)) {
			refs.push({ spec: node.moduleSpecifier.text, node: node.moduleSpecifier });
		} else if (ts.isExportDeclaration(node) && node.moduleSpecifier && isStringLiteralLike(node.moduleSpecifier)) {
			refs.push({ spec: node.moduleSpecifier.text, node: node.moduleSpecifier });
		} else if (
			ts.isCallExpression(node) &&
			node.arguments.length >= 1 &&
			isStringLiteralLike(node.arguments[0])
		) {
			if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
				refs.push({ spec: node.arguments[0].text, node: node.arguments[0] });
			}
			if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
				refs.push({ spec: node.arguments[0].text, node: node.arguments[0] });
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(parsed.sourceFile);
	importRefCache.set(parsed.absPath, refs);
	return refs;
}

function resolveImportBase(importer: string, spec: string): string | null {
	if (spec.startsWith('@/')) {
		return path.resolve(ROOT, 'src', spec.slice(2));
	}
	if (spec.startsWith('./') || spec.startsWith('../')) {
		return path.resolve(path.dirname(importer), spec);
	}
	if (spec.startsWith('/')) {
		return path.resolve(ROOT, '.' + spec);
	}
	if (spec.startsWith('docs/')) {
		return path.resolve(ROOT, spec);
	}
	return null;
}

function expandResolvedCandidates(resolved: string): string[] {
	return Array.from(
		new Set(
			[
				resolved,
				`${resolved}.ts`,
				`${resolved}.tsx`,
				`${resolved}.js`,
				`${resolved}.jsx`,
				`${resolved}.mjs`,
				`${resolved}.cjs`,
				path.join(resolved, 'index.ts'),
				path.join(resolved, 'index.tsx'),
				path.join(resolved, 'index.js'),
				path.join(resolved, 'index.jsx'),
			].map((candidate) => path.normalize(candidate)),
		),
	);
}

function resolveImportCandidates(importer: string, spec: string): string[] {
	const base = resolveImportBase(importer, spec);
	if (!base) return [];
	return expandResolvedCandidates(base);
}

function pathEqualsOrInside(candidate: string, target: string): boolean {
	const normalizedCandidate = path.normalize(candidate);
	const normalizedTarget = path.normalize(target);
	return (
		normalizedCandidate === normalizedTarget ||
		normalizedCandidate.startsWith(normalizedTarget + path.sep)
	);
}

function pathLooksLikeCodeMirror(candidate: string): boolean {
	const normalized = path.normalize(candidate).toLowerCase();
	return (
		normalized.includes(`${path.sep}codemirror`) ||
		path.basename(normalized).includes('codemirror')
	);
}

function isDocsGstackImport(importer: string, spec: string): boolean {
	if (spec === 'docs/gstack' || spec.startsWith('docs/gstack/')) return true;
	return resolveImportCandidates(importer, spec).some((candidate) =>
		pathEqualsOrInside(candidate, DOCS_GSTACK_ROOT),
	);
}

function resolvesIntoProviderRoot(importer: string, spec: string): boolean {
	return resolveImportCandidates(importer, spec).some((candidate) =>
		PROVIDER_ROOTS.some((root) => pathEqualsOrInside(candidate, root)),
	);
}

function isProviderImport(importer: string, spec: string): boolean {
	return PROVIDER_PACKAGE_RE.test(spec) || resolvesIntoProviderRoot(importer, spec);
}

function isProtectedComposerSurfaceImport(importer: string, spec: string): boolean {
	if (CODEMIRROR_PACKAGE_RE.test(spec)) return true;

	const candidates = resolveImportCandidates(importer, spec);
	return candidates.some((candidate) => {
		if (PROTECTED_CHAT_COMPOSER_FILES.some((file) => path.normalize(candidate) === path.normalize(file))) {
			return true;
		}
		if (PROTECTED_CHAT_COMPOSER_DIRS.some((dir) => pathEqualsOrInside(candidate, dir))) {
			return true;
		}
		if (PROTECTED_CODEMIRROR_FILES.some((file) => path.normalize(candidate) === path.normalize(file))) {
			return true;
		}
		if (PROTECTED_CODEMIRROR_DIRS.some((dir) => pathEqualsOrInside(candidate, dir))) {
			return true;
		}
		return pathLooksLikeCodeMirror(candidate);
	});
}

function unwrapExpression(expr: ts.Expression): ts.Expression {
	let current = expr;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isTypeAssertionExpression(current) ||
		ts.isNonNullExpression(current) ||
		ts.isSatisfiesExpression(current)
	) {
		current =
			ts.isParenthesizedExpression(current) ? current.expression :
			ts.isAsExpression(current) ? current.expression :
			ts.isTypeAssertionExpression(current) ? current.expression :
			ts.isNonNullExpression(current) ? current.expression :
			current.expression;
	}
	return current;
}

function isPresentationSelectorExpression(expr: ts.Expression): boolean {
	const node = unwrapExpression(expr);
	if (ts.isIdentifier(node)) {
		return PRESENTATION_SELECTOR_NAMES.has(node.text);
	}
	if (ts.isPropertyAccessExpression(node)) {
		return node.name.text === 'id' || node.name.text === 'label';
	}
	if (ts.isElementAccessExpression(node) && isStringLiteralLike(node.argumentExpression)) {
		return node.argumentExpression.text === 'id' || node.argumentExpression.text === 'label';
	}
	return false;
}

function containsPresentationSelector(expr: ts.Expression): boolean {
	const root = unwrapExpression(expr);
	let found = false;
	const visit = (node: ts.Node): void => {
		if (found) return;
		if (ts.isExpression(node) && isPresentationSelectorExpression(node)) {
			found = true;
			return;
		}
		ts.forEachChild(node, visit);
	};
	visit(root);
	return found;
}

function collectTopLevelDeclaredNames(name: ts.BindingName, out: string[]): void {
	if (ts.isIdentifier(name)) {
		out.push(name.text);
		return;
	}
	for (const element of name.elements) {
		if (!ts.isBindingElement(element)) continue;
		collectTopLevelDeclaredNames(element.name, out);
	}
}

function isRuntimeSingletonName(name: string): boolean {
	return (
		/(runtime|singleton|instance|registry)/i.test(name) ||
		/^(current|active|default|global)(Runtime|Singleton|Instance|Registry)?$/i.test(name)
	);
}

function isRuntimeRegistryFunctionName(name: string): boolean {
	return /^(set|get|register|clear|reset)[A-Za-z0-9_]*(Runtime|Singleton|Registry)$/i.test(name);
}

function testNoDocsGstackImportsInSrc(): void {
	const files = getParsedFiles(SRC_ROOT);
	assert.ok(files.length > 0, `expected src/ to contain .ts/.tsx files, found ${files.length}`);

	const offenses: Offense[] = [];
	for (const parsed of files) {
		for (const ref of collectImportReferences(parsed)) {
			if (!isDocsGstackImport(parsed.absPath, ref.spec)) continue;
			offenses.push(
				makeOffense(parsed, ref.node, `import-like dependency from docs/gstack: ${ref.spec}`),
			);
		}
	}

	failIfAny(offenses, 'T2 architecture guard violated: src/ must not import/require docs/gstack');
	console.log('PASS: noDocsGstackImportsInSrc');
}

function testComposerUiNoProviderAdapterOrSdkImports(): void {
	const files = getParsedFiles(COMPOSER_UI_ROOT);
	assert.ok(
		files.length > 0,
		`expected ${path.relative(ROOT, COMPOSER_UI_ROOT)} to contain .ts/.tsx files, found ${files.length}`,
	);

	const offenses: Offense[] = [];
	for (const parsed of files) {
		for (const ref of collectImportReferences(parsed)) {
			if (!isProviderImport(parsed.absPath, ref.spec)) continue;
			offenses.push(makeOffense(parsed, ref.node, `provider import in composer UI: ${ref.spec}`));
		}
	}

	failIfAny(
		offenses,
		'T2 architecture guard violated: src/ui/view/composer/** cannot import provider adapters/SDKs',
	);
	console.log('PASS: noProviderAdapterOrSdkImportsInComposerUi');
}

function testComposerServiceCoreHasNoRuntimeSingletonBindings(): void {
	const files = getParsedFilesFromRoots(COMPOSER_RUNTIME_ROOTS);
	const offenses: Offense[] = [];

	for (const parsed of files) {
		for (const statement of parsed.sourceFile.statements) {
			if (ts.isVariableStatement(statement)) {
				const flags = ts.getCombinedNodeFlags(statement.declarationList);
				if ((flags & ts.NodeFlags.Let) === 0 && (flags & ts.NodeFlags.Var) === 0) continue;
				for (const declaration of statement.declarationList.declarations) {
					const names: string[] = [];
					collectTopLevelDeclaredNames(declaration.name, names);
					const badName = names.find(isRuntimeSingletonName);
					if (!badName) continue;
					offenses.push(
						makeOffense(
							parsed,
							declaration.name,
							`module-level mutable runtime singleton binding '${badName}'`,
						),
					);
				}
				continue;
			}

			if (ts.isFunctionDeclaration(statement) && statement.name) {
				if (isRuntimeRegistryFunctionName(statement.name.text)) {
					offenses.push(
						makeOffense(
							parsed,
							statement.name,
							`runtime singleton registry function '${statement.name.text}'`,
						),
					);
				}
				continue;
			}

			if (ts.isClassDeclaration(statement)) {
				for (const member of statement.members) {
					if (!ts.isPropertyDeclaration(member)) continue;
					if (!member.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.StaticKeyword)) continue;
					if (!member.name || !ts.isIdentifier(member.name)) continue;
					if (!isRuntimeSingletonName(member.name.text)) continue;
					offenses.push(
						makeOffense(
							parsed,
							member.name,
							`static runtime singleton binding '${member.name.text}'`,
						),
					);
				}
			}
		}
	}

	failIfAny(
		offenses,
		'T2 architecture guard violated: src/service/composer/** and src/core/composer/** must not keep mutable runtime singleton bindings',
	);
	console.log('PASS: noMutableRuntimeSingletonInComposerServiceCore');
}

function testComposerProductionNoPresentationLabelOrIdDispatch(): void {
	const files = getParsedFilesFromRoots(PRODUCER_SCOPES);
	const offenses: Offense[] = [];

	for (const parsed of files) {
		const visit = (node: ts.Node): void => {
			if (ts.isSwitchStatement(node)) {
				if (
					containsPresentationSelector(node.expression) &&
					node.caseBlock.clauses.some(
						(clause) => ts.isCaseClause(clause) && isStringLiteralLike(clause.expression),
					)
				) {
					offenses.push(
						makeOffense(parsed, node.expression, 'forbidden behavior dispatch pattern (switch on label/id)'),
					);
				}
			} else if (ts.isBinaryExpression(node)) {
				if (!BINARY_DISPATCH_OPERATORS.has(node.operatorToken.kind)) {
					ts.forEachChild(node, visit);
					return;
				}
				const left = unwrapExpression(node.left);
				const right = unwrapExpression(node.right);
				const matches =
					(isPresentationSelectorExpression(left) && isStringLiteralLike(right)) ||
					(isPresentationSelectorExpression(right) && isStringLiteralLike(left));
				if (matches) {
					offenses.push(
						makeOffense(parsed, node, 'forbidden behavior dispatch pattern (label/id equality comparison)'),
					);
				}
			} else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
				const method = node.expression.name.text;
				if (!['includes', 'startsWith', 'endsWith'].includes(method)) {
					ts.forEachChild(node, visit);
					return;
				}
				if (
					isPresentationSelectorExpression(node.expression.expression) &&
					node.arguments.length >= 1 &&
					isStringLiteralLike(node.arguments[0])
				) {
					offenses.push(
						makeOffense(
							parsed,
							node,
							`forbidden behavior dispatch pattern (label/id.${method}())`,
						),
					);
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(parsed.sourceFile);
	}

	failIfAny(
		offenses,
		'T2 architecture guard violated: composer production cannot dispatch behavior by labels or id matching',
	);
	console.log('PASS: noComposerProductionDispatchByLabelOrId');
}

function testDocumentComposerModulesCannotImportProtectedSurfaces(): void {
	const files = getParsedFilesFromRoots(PRODUCER_SCOPES);
	const offenses: Offense[] = [];

	for (const parsed of files) {
		for (const ref of collectImportReferences(parsed)) {
			if (!isProtectedComposerSurfaceImport(parsed.absPath, ref.spec)) continue;
			offenses.push(
				makeOffense(
					parsed,
					ref.node,
					`import of protected Chat Composer/CodeMirror surface '${ref.spec}'`,
				),
			);
		}
	}

	failIfAny(
		offenses,
		'T2 architecture guard violated: document-composer modules cannot import Chat Composer/CodeMirror protected surfaces',
	);
	console.log('PASS: documentComposerModulesDoNotImportProtectedComposerSurfaces');
}

function main(): void {
	testNoDocsGstackImportsInSrc();
	testComposerUiNoProviderAdapterOrSdkImports();
	testComposerServiceCoreHasNoRuntimeSingletonBindings();
	testComposerProductionNoPresentationLabelOrIdDispatch();
	testDocumentComposerModulesCannotImportProtectedSurfaces();
}

try {
	main();
	process.exit(0);
} catch (err) {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
}
