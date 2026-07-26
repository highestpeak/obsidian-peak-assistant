/**
 * Peak Composer — image capability runtime composition (WP7).
 *
 * Assembles the image coordinator with its Obsidian adapters (attachment /
 * reference / media edit) and returns a per-document factory. Owned at the app
 * layer (a slot the composition root / DocumentComposerRuntime holds) — no
 * service-side singleton, no `AppContext.getInstance()` in service code. The
 * coordinator implements the frozen `ComposerCandidateRuntimePort`, so the block
 * chrome drives image candidates through the same host as WP3 text candidates.
 */

import type { App } from 'obsidian';
import {
	ImageCapabilityCoordinator,
	loadImageDomainConfig,
	DEFAULT_IMAGE_DOMAIN_CONFIG,
	type ComposerImageTextPort,
	type ComposerDocumentSession,
	type ComposerTransactionHub,
	type ImageDomainConfig,
} from '@/service/composer';
import {
	ComposerMediaImageEditAdapter,
	ObsidianComposerImageAttachmentAdapter,
	ObsidianComposerImageReferenceAdapter,
	type ComposerMediaProducer,
} from './ObsidianComposerImageAdapters';

export interface ImageCapabilityRuntimeFactory {
	forDocument(session: ComposerDocumentSession, hub: ComposerTransactionHub): ImageCapabilityCoordinator;
}

export interface ComposeImageCapabilityRuntimeOptions {
	app: App;
	/** The shared media generation service (structurally satisfies the producer). */
	producer: ComposerMediaProducer;
	/** Resolves the media attachment folder (vault-relative) from settings. */
	resolveMediaFolder: () => string;
	/** Config preset id for composer image edits. */
	editPresetId: string;
	/** Optional caption / smart-layout text port (those flows no-op without it). */
	text?: ComposerImageTextPort;
}

export function composeImageCapabilityRuntime(
	options: ComposeImageCapabilityRuntimeOptions,
): ImageCapabilityRuntimeFactory {
	// Late-loading config reaches long-lived coordinators through a getter.
	let config: ImageDomainConfig = DEFAULT_IMAGE_DOMAIN_CONFIG;
	void loadImageDomainConfig().then((loaded) => {
		config = loaded;
	});
	const configProvider = (): ImageDomainConfig => config;

	const attachment = new ObsidianComposerImageAttachmentAdapter(options.app, options.resolveMediaFolder);
	const reference = new ObsidianComposerImageReferenceAdapter(options.app);
	const edit = new ComposerMediaImageEditAdapter(options.producer, options.editPresetId);

	return {
		forDocument: (session, hub) =>
			new ImageCapabilityCoordinator({
				session,
				hub,
				attachment,
				reference,
				edit,
				config: configProvider,
				...(options.text ? { text: options.text } : {}),
			}),
	};
}
