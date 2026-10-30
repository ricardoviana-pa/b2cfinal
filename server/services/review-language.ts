/**
 * The detector moved to shared/reviewLanguage.ts so the property page can put
 * the reviews in the page language first, like the homepage (29 out 2026).
 * Server callers keep this path.
 */
export { REVIEW_LANGUAGES, detectReviewLanguage, type ReviewLanguage } from '../../shared/reviewLanguage';
