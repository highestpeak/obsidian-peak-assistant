/**
 * Peak Composer — image block UI barrel (WP7). Self-contained: imports only core
 * types, the shared primitives, and the candidates renderer registry contract.
 */
export * from './imageUiConfig';
export * from './ImageReviewControls';
export { ImageAssetCandidateCard } from './ImageAssetCandidateCard';
export { ImageAnnotationCandidateCard } from './ImageAnnotationCandidateCard';
export { ImageLayoutCandidateCard } from './ImageLayoutCandidateCard';
export { registerImageCandidateRenderers } from './imageRendererRegistry';
