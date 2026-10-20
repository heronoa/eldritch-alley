// Which screen the page's path names. The client is one document served for every path (the static
// host and `vite dev` both fall back to `index.html`), so the path is the only thing that decides
// whether the title boots or one of the two pages a mailed link lands on.
//
// A path this build does not know is the title: the game's entry point, and the only screen a mistyped
// address can sensibly land on.

export type Screen = 'title' | 'verify-email' | 'reset-password';

export function screenFor(pathname: string): Screen {
  switch (trim(pathname)) {
    case '/verify-email':
      return 'verify-email';
    case '/reset-password':
      return 'reset-password';
    default:
      return 'title';
  }
}

/** The path without its trailing slashes, so `/verify-email/` is the same screen as `/verify-email`. */
function trim(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}
