/**
 * Peak Composer — image capability pack (WP7).
 *
 * Image AI + asset flows do NOT run on the WP3 text model-stream runtime: paste
 * / convert are deterministic asset transactions, AI 改图 is media-generation,
 * and caption / smart-layout go through a text port — all coordinated by
 * {@link ImageCapabilityCoordinator} via ports, not the generic executor. This
 * file is therefore the PROJECTION side of the pack: the stable capability ids +
 * their object-toolbar action descriptors the block chrome renders (labels come
 * from config, never hard-coded dispatch keys). The chrome invokes the matching
 * coordinator method for each id.
 *
 * Keeping the descriptors here (not in the chrome) means adding an image action
 * is a single-file change and the id ⇄ presentation mapping is testable.
 */

import type { ComposerActionDescriptor, ComposerActionSurface } from '@/core/composer';

/** Stable capability ids for the image object actions (never labels). */
export const IMAGE_CAPABILITY_IDS = {
	caption: 'composer.image.caption',
	edit: 'composer.image.edit',
	convert: 'composer.image.convert',
	layout: 'composer.image.layout',
	rename: 'composer.image.rename',
} as const;

/** Presentation copy for the image actions (config-overridable; typed fallback). */
export interface ImageActionStrings {
	captionTitle: string;
	editTitle: string;
	convertTitle: string;
	layoutTitle: string;
}

export const DEFAULT_IMAGE_ACTION_STRINGS: ImageActionStrings = {
	captionTitle: '图注',
	editTitle: 'AI 改图',
	convertTitle: '转换',
	layoutTitle: '排版',
};

interface ImageActionSpec {
	capabilityId: string;
	titleOf: (s: ImageActionStrings) => string;
	lucideIcon: string;
	group: 'deterministic' | 'ai';
}

/** Object-toolbar actions for a single image block, in display order. */
const SINGLE_IMAGE_ACTIONS: readonly ImageActionSpec[] = [
	{ capabilityId: IMAGE_CAPABILITY_IDS.edit, titleOf: (s) => s.editTitle, lucideIcon: 'wand-sparkles', group: 'ai' },
	{ capabilityId: IMAGE_CAPABILITY_IDS.caption, titleOf: (s) => s.captionTitle, lucideIcon: 'captions', group: 'ai' },
	{ capabilityId: IMAGE_CAPABILITY_IDS.convert, titleOf: (s) => s.convertTitle, lucideIcon: 'crop', group: 'deterministic' },
];

/** Object-toolbar actions when a multi-image selection is active. */
const MULTI_IMAGE_ACTIONS: readonly ImageActionSpec[] = [
	{ capabilityId: IMAGE_CAPABILITY_IDS.layout, titleOf: (s) => s.layoutTitle, lucideIcon: 'layout-grid', group: 'ai' },
];

/**
 * Project the object-toolbar action descriptors for an image target. `multi`
 * selects the multi-image (layout) action set. Descriptors are pure metadata;
 * the chrome dispatches on `capabilityId`, never on `title`.
 */
export function imageObjectActions(
	strings: ImageActionStrings = DEFAULT_IMAGE_ACTION_STRINGS,
	options: { multi?: boolean; surface?: ComposerActionSurface } = {},
): ComposerActionDescriptor[] {
	const specs = options.multi ? MULTI_IMAGE_ACTIONS : SINGLE_IMAGE_ACTIONS;
	const surface: ComposerActionSurface = options.surface ?? 'object-toolbar';
	return specs.map((spec) => ({
		capabilityId: spec.capabilityId,
		surface,
		title: spec.titleOf(strings),
		lucideIcon: spec.lucideIcon,
		group: spec.group,
		acceptsInstruction: spec.group === 'ai',
	}));
}
