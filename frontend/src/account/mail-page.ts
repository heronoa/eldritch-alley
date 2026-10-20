// The page a mailed link lands on, as the DOM: it reads the token from the address, writes the view
// `mail.ts` answers, and hands the press to the platform. The token is read here and spent only on the
// press (ADR 0021 § D12), which is why the page opens with a button and not with a request.
import { getLocale } from '../i18n';
import { mailCopy } from './copy';
import { api } from './live';
import {
  initialMailState,
  mailFailure,
  mailView,
  resetProblem,
  tokenFrom,
  type MailKind,
  type MailState,
} from './mail';

/** The element with this id, or an error: the markup and this file are written together. */
function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the mail markup has no #${id}`);
  return found as T;
}

const page = byId<HTMLElement>('mail');
const heading = byId<HTMLParagraphElement>('mail-heading');
const body = byId<HTMLParagraphElement>('mail-body');
const form = byId<HTMLFormElement>('mail-form');
const passwordField = byId<HTMLLabelElement>('mail-password-field');
const password = byId<HTMLInputElement>('mail-password');
const passwordLabel = byId<HTMLSpanElement>('mail-password-label');
const passwordHint = byId<HTMLParagraphElement>('mail-password-hint');
const confirmationField = byId<HTMLLabelElement>('mail-confirmation-field');
const confirmation = byId<HTMLInputElement>('mail-confirmation');
const confirmationLabel = byId<HTMLSpanElement>('mail-confirmation-label');
const problemLine = byId<HTMLParagraphElement>('mail-problem');
const submit = byId<HTMLButtonElement>('mail-submit');
const back = byId<HTMLAnchorElement>('mail-back');

/**
 * Boots the page the path named. `verify-email` spends the token on a press; `reset-password` asks for
 * the new password first and then spends it.
 */
export async function bootMailPage(screen: 'verify-email' | 'reset-password'): Promise<void> {
  const kind: MailKind = screen === 'verify-email' ? 'verify' : 'reset';
  const token = tokenFrom(window.location.search);
  let state: MailState = initialMailState(window.location.search);

  function render(): void {
    const copy = mailCopy();
    const view = mailView(kind, state, copy);

    document.documentElement.lang = getLocale();
    page.hidden = false;

    heading.textContent = view.heading;
    body.textContent = view.body;
    form.hidden = view.action === null;
    passwordField.hidden = !view.passwordFields;
    confirmationField.hidden = !view.passwordFields;
    passwordHint.hidden = !view.passwordFields;
    passwordLabel.textContent = copy.passwordLabel;
    confirmationLabel.textContent = copy.confirmationLabel;
    passwordHint.textContent = copy.passwordHint;
    password.disabled = view.working;
    confirmation.disabled = view.working;
    submit.textContent = view.action ?? '';
    submit.disabled = !view.actionEnabled;
    problemLine.hidden = view.problem === null;
    problemLine.textContent = view.problem ?? '';
    back.textContent = view.back;
  }

  async function press(): Promise<void> {
    if (token === null || state.status === 'working') return;

    // The reset page checks the two fields before asking: a typo in the confirmation is not a round
    // trip, and the platform checks the same rules again on its side.
    if (kind === 'reset') {
      const problem = resetProblem(password.value, confirmation.value);
      if (problem !== null) {
        state = { status: 'problem', problem };
        render();
        return;
      }
    }

    state = { status: 'working' };
    render();

    try {
      if (kind === 'verify') await api.verify(token);
      else await api.reset({ token, password: password.value });
      state = { status: 'done' };
      password.value = '';
      confirmation.value = '';
    } catch (error) {
      state = mailFailure(kind, error);
    }

    render();
  }

  form.addEventListener('submit', (event) => {
    // The form is real, so Enter on either field is the browser's submit; this only stops the reload.
    event.preventDefault();
    void press();
  });

  render();

  // The focus lands where the page asks something: the new password, or the one button of the verify
  // page. A page whose link arrived broken has nothing to answer and is left alone.
  if (state.status === 'ready') {
    if (kind === 'reset') password.focus();
    else submit.focus();
  }
}
