// The deployed version: the commit on Vercel. "dev" elsewhere turns the
// "new version" notice off. Read at build time, so a page and /api/version of
// the same deployment always agree.
export const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev";
