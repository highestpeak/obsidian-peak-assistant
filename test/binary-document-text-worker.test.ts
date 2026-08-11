import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import alias from 'esbuild-plugin-alias';
import JSZip from 'jszip';

import { BinaryDocumentTextWorkerClient } from '@/app/document/worker/BinaryDocumentTextWorkerClient';

const ROOT = process.cwd();

async function buildWorker(entryPoint: string, outfile: string): Promise<void> {
	await build({
		entryPoints: [path.join(ROOT, entryPoint)],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		target: 'es2018',
		outfile,
		plugins: [alias({ '@': path.join(ROOT, 'src') })],
		logLevel: 'silent',
	});
}

async function createDocx(): Promise<ArrayBuffer> {
	const archive = new JSZip();
	archive.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
	archive.folder('_rels')!.file('.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
	archive.folder('word')!.file('document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Disposable DOCX parser</w:t></w:r></w:p></w:body></w:document>');
	return archive.generateAsync({ type: 'arraybuffer' });
}

async function createPptx(): Promise<ArrayBuffer> {
	const archive = new JSZip();
	archive.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
	archive.folder('_rels')!.file('.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
	archive.folder('ppt')!.file('presentation.xml', '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
	archive.folder('ppt')!.folder('slides')!.file('slide1.xml', '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Disposable PPTX parser</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
	return archive.generateAsync({ type: 'arraybuffer' });
}

async function testDisposableDocumentParsers(): Promise<void> {
	const directory = mkdtempSync(path.join(tmpdir(), 'peak-document-workers-'));
	try {
		await Promise.all([
			buildWorker(
				'src/app/document/worker/DocxTextWorker.ts',
				path.join(directory, 'document-docx-text-worker.js'),
			),
			buildWorker(
				'src/app/document/worker/PptxTextWorker.ts',
				path.join(directory, 'document-pptx-text-worker.js'),
			),
		]);
		const client = new BinaryDocumentTextWorkerClient(directory);
		const [docxText, pptxText] = await Promise.all([
			client.extract('docx', await createDocx()),
			client.extract('pptx', await createPptx()),
		]);
		assert.match(docxText, /Disposable DOCX parser/);
		assert.match(pptxText, /Disposable PPTX parser/);
		assert.equal(client.activeWorkerCount, 0);
		assert.equal(client.peakActiveWorkerCount, 1, 'heavy parser workers must be serialized');
		client.dispose();
		await assert.rejects(client.extract('docx', new ArrayBuffer(0)), /disposed/);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

testDisposableDocumentParsers()
	.then(() => console.log('binary document text workers: passed'))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
