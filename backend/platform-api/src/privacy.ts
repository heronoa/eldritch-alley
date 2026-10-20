/**
 * The version of the privacy policy the platform records in `users.privacy_version_seen` (D5 of the
 * m4-05 plan). It is duplicated on the client, in `frontend/src/privacy/version.ts`, because the two
 * workspaces cannot share a module for one string: each side carries its own test, and the day the
 * page's date and this constant disagree is the day the policy was edited without a version bump.
 */
export const PRIVACY_VERSION = '2026-10-17';
