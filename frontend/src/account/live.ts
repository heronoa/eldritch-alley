// The platform client the page holds. One instance for the whole page: the title asks it for a ticket
// at press time, and the account screens ask it for the profile, the history and the session. The
// deployment value is resolved once, here, so a build without a platform fails at load in one place.
import { createApi, type Api } from '../api/client';
import { apiBaseUrl, buildEnv } from '../config';

/** The platform's own origin, without a trailing slash. `oauthStart` builds the sign-in URLs from it. */
export const platformUrl = apiBaseUrl(buildEnv()).replace(/\/+$/, '');

export const api: Api = createApi(platformUrl);
