// The contact form as the page: the footer's control, the card over the title and Cloudflare's
// widget. The rules are `contact.ts`'s — what the form accepts, what it sends, how a failure reads —
// and this file only writes them onto the document.
import { api } from '../account/live';
import { cardClosed, cardOpened } from '../account/modal';
import { buildEnv, turnstileSiteKey } from '../config';
import { getLocale } from '../i18n';
import { privacyPath } from '../privacy/version';
import { onLocaleChange } from '../title/title';
import {
  contactCopy,
  contactFailure,
  contactRequest,
  turnstileLanguage,
  validateContact,
  type ContactField,
} from './contact';

/** The smallest surface of Cloudflare's script this page uses; the widget's own script is a third party. */
interface TurnstileWidget {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      language: string;
      theme: 'dark';
      callback: (token: string) => void;
      'expired-callback': () => void;
    },
  ): string | number;
  reset(widget: string | number): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the contact markup has no #${id}`);
  return found as T;
}

const openButton = byId<HTMLButtonElement>('contact-open');
const card = byId<HTMLDivElement>('contact');
const title = byId<HTMLParagraphElement>('contact-title');
const closeButton = byId<HTMLButtonElement>('contact-close');
const form = byId<HTMLFormElement>('contact-form');
const nameInput = byId<HTMLInputElement>('contact-name');
const nameLabel = byId<HTMLSpanElement>('contact-name-label');
const emailInput = byId<HTMLInputElement>('contact-email');
const emailLabel = byId<HTMLSpanElement>('contact-email-label');
const messageInput = byId<HTMLTextAreaElement>('contact-message');
const messageLabel = byId<HTMLSpanElement>('contact-message-label');
const widgetContainer = byId<HTMLDivElement>('contact-turnstile');
const privacyLink = byId<HTMLAnchorElement>('contact-privacy');
const problemLine = byId<HTMLParagraphElement>('contact-problem');
const submit = byId<HTMLButtonElement>('contact-submit');
const success = byId<HTMLDivElement>('contact-success');
const successHeading = byId<HTMLParagraphElement>('contact-success-heading');
const successBody = byId<HTMLParagraphElement>('contact-success-body');
const successClose = byId<HTMLButtonElement>('contact-success-close');

/** The token the challenge produced, empty until it answers. */
let token = '';
/** The widget Cloudflare drew, so a second opening resets it instead of drawing another. */
let widget: string | number | null = null;
/** The script's load, once: a second opening waits on the same promise. */
let script: Promise<void> | null = null;
/** A request is out: every control that would send another is off. */
let busy = false;
/** The sentence of the last failure, already in the language on screen, or `null`. */
let problem: string | null = null;
/** The form was accepted: the card shows the thanks and no longer the fields. */
let sent = false;

/** Puts the card on the screen or takes it off, and tells `modal.ts` with it. */
function setCard(open: boolean): void {
  if (card.hidden === !open) return;
  card.hidden = !open;
  if (open) cardOpened();
  else cardClosed();
}

/** The card's lines, written from the catalog of the language on screen. */
function render(): void {
  const copy = contactCopy();

  title.textContent = copy.title;
  closeButton.setAttribute('aria-label', copy.close);
  nameLabel.textContent = copy.nameLabel;
  emailLabel.textContent = copy.emailLabel;
  messageLabel.textContent = copy.messageLabel;
  submit.textContent = busy ? copy.sending : copy.submit;
  submit.disabled = busy;
  privacyLink.href = privacyPath(getLocale());
  privacyLink.textContent = copy.privacyLabel;
  problemLine.hidden = problem === null;
  problemLine.textContent = problem ?? '';

  form.hidden = sent;
  success.hidden = !sent;
  successHeading.textContent = copy.sentHeading;
  successBody.textContent = copy.sentBody;
  successClose.textContent = copy.close;
}

function open(): void {
  sent = false;
  busy = false;
  problem = null;
  token = '';
  nameInput.value = '';
  emailInput.value = '';
  messageInput.value = '';
  setCard(true);
  render();
  nameInput.focus();
  void mountWidget();
}

function close(): void {
  setCard(false);
  openButton.focus();
}

/**
 * Draws the widget, or resets the one already drawn. A build with no site key leaves the form usable
 * and sends a placeholder token: the local platform's verifier accepts it, and a deployment reaches
 * the challenge through the key.
 */
async function mountWidget(): Promise<void> {
  if (widget !== null) {
    token = '';
    window.turnstile?.reset(widget);
    render();
    return;
  }

  const sitekey = turnstileSiteKey(buildEnv());
  if (sitekey === null) {
    token = 'local-development';
    render();
    return;
  }

  try {
    await loadScript();
    widget =
      window.turnstile?.render(widgetContainer, {
        sitekey,
        language: turnstileLanguage(getLocale()),
        theme: 'dark',
        callback: (value) => {
          token = value;
          render();
        },
        'expired-callback': () => {
          token = '';
          render();
        },
      }) ?? null;
  } catch {
    // A script that does not load leaves no token, and the platform refuses the send: the challenge
    // fails closed on this side too.
    token = '';
  }
  render();
}

/** Cloudflare's widget script, loaded once and in the language on screen. */
function loadScript(): Promise<void> {
  script ??= new Promise((resolve, reject) => {
    const element = document.createElement('script');
    element.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&hl=' +
      encodeURIComponent(turnstileLanguage(getLocale()));
    element.async = true;
    element.addEventListener('load', () => resolve());
    element.addEventListener('error', () => reject(new Error('the Turnstile script did not load')));
    document.head.append(element);
  });
  return script;
}

/** The field a stopped form names, focused so the player can fix it without hunting. */
function fieldElement(field: ContactField): HTMLInputElement | HTMLTextAreaElement {
  return field === 'name' ? nameInput : field === 'email' ? emailInput : messageInput;
}

async function submitForm(): Promise<void> {
  if (busy || sent) return;
  const copy = contactCopy();

  const draft = {
    name: nameInput.value,
    email: emailInput.value,
    message: messageInput.value,
  };

  const invalid = validateContact(draft);
  if (invalid !== null) {
    problem = copy.fieldProblems[invalid];
    render();
    fieldElement(invalid).focus();
    return;
  }

  if (token === '') {
    problem = copy.problems['challenge-failed'];
    render();
    return;
  }

  busy = true;
  problem = null;
  render();

  try {
    await api.contact(contactRequest(draft, token, getLocale()));
    sent = true;
  } catch (error) {
    problem = copy.problems[contactFailure(error)];
  } finally {
    busy = false;
    render();
  }
}

// The footer's control opens the card; the form is the only way it sends.
openButton.addEventListener('click', open);
closeButton.addEventListener('click', close);
successClose.addEventListener('click', close);

form.addEventListener('submit', (event) => {
  // A real form submit, so Enter is the browser's: `preventDefault` only stops the page's reload.
  event.preventDefault();
  void submitForm();
});

// The card's keys belong to the card: Escape closes it, and Enter starts no match from inside it.
card.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
  }
});

// A language change rewrites whatever the card is showing, the way the title does.
onLocaleChange(() => {
  if (!card.hidden) render();
});
