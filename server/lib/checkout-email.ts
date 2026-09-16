/** Customer checkout links must always use the site that accepts live payments. */
export const CHECKOUT_EMAIL_ORIGIN = "https://www.portugalactive.com";

/**
 * Never let a preview process claim recovery stages or send real guests a
 * test checkout, even if production configuration is accidentally copied.
 * Both the explicit switch and production URL are required; Render branches
 * provide an additional guard against copying production configuration to DEV.
 */
export function canSendCheckoutRecovery(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CHECKOUT_RECOVERY !== "true") return false;
  if (env.RENDER_GIT_BRANCH && env.RENDER_GIT_BRANCH !== "main") return false;
  if (env.NODE_ENV && env.NODE_ENV !== "production") return false;
  const configured = env.SITE_URL || env.PUBLIC_BASE_URL || env.PUBLIC_URL || env.APP_URL;
  try {
    const url = new URL(configured || "");
    return (
      (url.origin === CHECKOUT_EMAIL_ORIGIN || url.origin === "https://portugalactive.com") &&
      !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
    );
  } catch {
    return false;
  }
}
