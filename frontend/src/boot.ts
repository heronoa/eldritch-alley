// The page's one entry point. Each screen imports only what it needs, and does so dynamically on
// purpose: the title's modules run side effects as they load (the canvas, the keys, the city), and a
// mailed link must never pay for them. A page whose script fails before this point still shows the
// markup's fallback text.
import { screenFor } from './boot-screen';

async function boot(): Promise<void> {
  const screen = screenFor(window.location.pathname);

  if (screen !== 'title') {
    // The title's markup is in the same document; it is hidden rather than removed, and the mail page
    // is the one on screen.
    document.getElementById('title-screen')?.setAttribute('hidden', '');
    const { bootMailPage } = await import('./account/mail-page');
    await bootMailPage(screen);
    return;
  }

  // The title first: the onboarding and the account screens both register with it for a language
  // change, so it has to be up before they are.
  await import('./title/title');
  await import('./onboarding/onboarding');
  await import('./account/account');
  await import('./contact/contact-panel');
}

void boot().catch((error: unknown) => {
  // A failed download or a markup mismatch: the console says which, and the markup's own text stands.
  console.error(error);
});
