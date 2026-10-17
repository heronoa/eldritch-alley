// The account as the page: the control in the corner, the sign-in dialog, the profile, the security
// card, the deletion confirmation and the battle history. What is left here is the DOM, on the same
// split as `title.ts`: the steps of the dialog are `auth-flow.ts`'s, the account and its transitions are
// `account/session.ts`'s, the deletion rules are `account/delete-account.ts`'s, the history is
// `account/history.ts`'s, the strings are `account/copy.ts`'s and the panel views are theirs. This file
// finds the elements, writes the views and hands every press to the rules.
//
// It depends on `title.ts` only for `onLocaleChange`, the way the onboarding does: the switcher rewrites
// the card that is open, and the card has no way of being told otherwise. The title does not import this
// file, so there is no cycle.
import { oauthStart, type ProviderName } from '../api/client';
import { getLocale } from '../i18n';
import { onLocaleChange } from '../title/title';
import {
  canSubmit,
  EMPTY_FIELDS,
  formFailure,
  nextStep,
  signInFailure,
  type AuthEvent,
  type AuthFields,
  type AuthStep,
} from './auth-flow';
import { accountCopy, type AccountCopy } from './copy';
import {
  confirmationAccepted,
  deleteAccount,
  type DeletionDraft,
  type DeletionRefusal,
} from './delete-account';
import { emptyHistory, loadMore, startLoading, type HistoryState } from './history';
import { historyView } from './history-panel';
import { api, platformUrl } from './live';
import { cardClosed, cardOpened } from './modal';
import { profileView } from './panel';
import { currentAccount, onAccountChange, setAccount, signIn, signOut } from './session';
import type { AccountState } from './types';

/** The element with this id, or an error: the markup and this file are written together. */
function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`the account markup has no #${id}`);
  return found as T;
}

const control = byId<HTMLButtonElement>('account-control');

// The sign-in dialog.
const auth = byId<HTMLDivElement>('auth');
const authTitle = byId<HTMLParagraphElement>('auth-title');
const authClose = byId<HTMLButtonElement>('auth-close');
const authTabs = byId<HTMLDivElement>('auth-tabs');
const authProvidersLabel = byId<HTMLParagraphElement>('auth-providers-label');
const authProviders = byId<HTMLDivElement>('auth-providers');
const authForm = byId<HTMLFormElement>('auth-form');
const authEmailField = byId<HTMLLabelElement>('auth-email-field');
const authEmail = byId<HTMLInputElement>('auth-email');
const authEmailLabel = byId<HTMLSpanElement>('auth-email-label');
const authPasswordField = byId<HTMLLabelElement>('auth-password-field');
const authPassword = byId<HTMLInputElement>('auth-password');
const authPasswordLabel = byId<HTMLSpanElement>('auth-password-label');
const authPasswordHint = byId<HTMLParagraphElement>('auth-password-hint');
const authDisplayNameField = byId<HTMLLabelElement>('auth-display-name-field');
const authDisplayName = byId<HTMLInputElement>('auth-display-name');
const authDisplayNameLabel = byId<HTMLSpanElement>('auth-display-name-label');
const authProblem = byId<HTMLParagraphElement>('auth-problem');
const authSubmit = byId<HTMLButtonElement>('auth-submit');
const authCheckMail = byId<HTMLDivElement>('auth-check-mail');
const authCheckMailHeading = byId<HTMLParagraphElement>('auth-check-mail-heading');
const authCheckMailBody = byId<HTMLParagraphElement>('auth-check-mail-body');
const authCheckMailBack = byId<HTMLButtonElement>('auth-check-mail-back');

/** The three tabs, by the step each one opens. */
const tabs: Readonly<Record<'sign-in' | 'sign-up' | 'forgot', HTMLButtonElement>> = {
  'sign-in': byId<HTMLButtonElement>('auth-tab-sign-in'),
  'sign-up': byId<HTMLButtonElement>('auth-tab-sign-up'),
  forgot: byId<HTMLButtonElement>('auth-tab-forgot'),
};

// The profile panel.
const profile = byId<HTMLDivElement>('profile');
const profileTitle = byId<HTMLParagraphElement>('profile-title');
const profileClose = byId<HTMLButtonElement>('profile-close');
const profileAvatar = byId<HTMLImageElement>('profile-avatar');
const profileName = byId<HTMLParagraphElement>('profile-name');
const profileEmail = byId<HTMLParagraphElement>('profile-email');
const profileAgentsHeading = byId<HTMLParagraphElement>('profile-agents-heading');
const profileAgents = byId<HTMLUListElement>('profile-agents');
const profileNoAgents = byId<HTMLParagraphElement>('profile-no-agents');
const profileProblem = byId<HTMLParagraphElement>('profile-problem');
const profileHistory = byId<HTMLButtonElement>('profile-history');
const profileSecurity = byId<HTMLButtonElement>('profile-security');
const profileSignOut = byId<HTMLButtonElement>('profile-sign-out');

// The history panel.
const historyCard = byId<HTMLDivElement>('history');
const historyTitle = byId<HTMLParagraphElement>('history-title');
const historyClose = byId<HTMLButtonElement>('history-close');
const historyRows = byId<HTMLUListElement>('history-rows');
const historyEmpty = byId<HTMLParagraphElement>('history-empty');
const historyFailure = byId<HTMLParagraphElement>('history-failure');
const historyMore = byId<HTMLButtonElement>('history-more');

// The security card and the deletion confirmation.
const security = byId<HTMLDivElement>('security');
const securityTitle = byId<HTMLParagraphElement>('security-title');
const securityClose = byId<HTMLButtonElement>('security-close');
const securityMethods = byId<HTMLParagraphElement>('security-methods');
const securityDelete = byId<HTMLButtonElement>('security-delete');

const deleteCard = byId<HTMLDivElement>('delete-account');
const deleteTitle = byId<HTMLParagraphElement>('delete-title');
const deleteClose = byId<HTMLButtonElement>('delete-close');
const deleteWarning = byId<HTMLParagraphElement>('delete-warning');
const deleteForm = byId<HTMLFormElement>('delete-form');
const deleteConfirmLabel = byId<HTMLSpanElement>('delete-confirm-label');
const deleteConfirmation = byId<HTMLInputElement>('delete-confirmation');
const deletePasswordField = byId<HTMLLabelElement>('delete-password-field');
const deletePasswordLabel = byId<HTMLSpanElement>('delete-password-label');
const deletePassword = byId<HTMLInputElement>('delete-password');
const deleteProblemLine = byId<HTMLParagraphElement>('delete-problem');
const deleteSubmit = byId<HTMLButtonElement>('delete-submit');
const deleteCancel = byId<HTMLButtonElement>('delete-cancel');

/** Where the sign-in dialog is. `closed` is what the card's `hidden` follows. */
let step: AuthStep = 'closed';
/** What the form holds. Kept across a redraw, so a language change does not empty the fields. */
let fields: AuthFields = EMPTY_FIELDS;
/** The sentence of the last failure, already in the language on screen, or `null`. */
let problem: string | null = null;
/** A request of the dialog is out: every control that would send another is off. */
let busy = false;
/** The providers this deployment draws buttons for. Asked once; a deployment does not change its apps. */
let providers: readonly ProviderName[] = [];
let providersAsked = false;
/** The battle history, as `history.ts` keeps it. The panel asks for a page when it opens, not before. */
let history: HistoryState = emptyHistory();
/** What the confirmation holds. Kept across a redraw, so a language change does not empty the fields. */
let deletion: DeletionDraft = { confirmation: '', password: '' };
/** The reason of the last refusal, which the copy translates, or `null`. */
let deletionProblem: DeletionRefusal | null = null;
/** A deletion is out: the button is off until the platform answers. */
let deleting = false;

/**
 * Whether the platform said the account has a usable password. The card asks for one only then — and
 * the word is the whole proof for an account that has none.
 */
function accountHasPassword(): boolean {
  const state = currentAccount();
  return state.status === 'signed-in' && state.account.hasPassword;
}

/**
 * Puts a card on the screen or takes it off, and tells `modal.ts` with it: the title's Enter has to
 * know a card is answering. Calling it with the state the card is already in changes nothing, so a
 * redraw cannot double-count.
 */
function setCard(card: HTMLElement, open: boolean): void {
  if (card.hidden === !open) return;
  card.hidden = !open;
  if (open) cardOpened();
  else cardClosed();
}

// --- the control ---------------------------------------------------------------------------------

function renderControl(state: AccountState): void {
  const copy = accountCopy();
  control.textContent = state.status === 'signed-in' ? state.account.user.displayName : copy.signIn;
  control.setAttribute('aria-label', copy.control);
  control.classList.toggle('on', state.status === 'signed-in');
}

// --- the sign-in dialog --------------------------------------------------------------------------

/** Opens the dialog on a step. The fields start empty; a failure of the last visit is forgotten. */
function openAuth(target: 'sign-in' | 'sign-up' | 'forgot'): void {
  closeProfile();
  closeHistory();
  step = nextStep('closed', target);
  fields = EMPTY_FIELDS;
  problem = null;
  busy = false;
  authEmail.value = '';
  authPassword.value = '';
  authDisplayName.value = '';
  setCard(auth, true);
  renderAuth();
  authEmail.focus();
  askProviders();
}

function closeAuth(): void {
  step = 'closed';
  renderAuth();
  control.focus();
}

function go(event: AuthEvent): void {
  step = nextStep(step, event);
  problem = null;
  renderAuth();
  authEmail.focus();
}

/**
 * Asks the platform which providers it has, once. A list that does not arrive draws no button — the
 * form stays, and the screen is honest about a deployment that only has address and password.
 */
function askProviders(): void {
  if (providersAsked) return;
  providersAsked = true;

  void api.providers().then((names) => {
    providers = names;
    if (step !== 'closed') renderProviders(accountCopy());
  });
}

/** One button per provider, built in code: a deployment's list is not the markup's to know. */
function renderProviders(copy: AccountCopy): void {
  const buttons = providers.map((name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'account-provider';
    button.textContent = copy.providerNames[name];
    button.addEventListener('click', () => {
      // A navigation, not a request: the platform answers with a redirect to the provider, which a
      // cross-origin `fetch` could not follow.
      window.location.assign(oauthStart(platformUrl, name, getLocale()));
    });
    return button;
  });

  const empty = buttons.length === 0;
  authProviders.replaceChildren(...buttons);
  authProviders.hidden = empty;
  authProvidersLabel.hidden = empty;
  authProvidersLabel.textContent = copy.providers;
}

/** Writes the dialog from the step, the fields and the language on screen. */
function renderAuth(): void {
  if (step === 'closed') {
    setCard(auth, false);
    return;
  }

  setCard(auth, true);
  const copy = accountCopy();

  authTitle.textContent = copy.dialogTitle;
  authClose.setAttribute('aria-label', copy.close);

  const onForm = step !== 'check-mail';
  authTabs.hidden = !onForm;
  authForm.hidden = !onForm;
  authCheckMail.hidden = onForm;
  authSubmit.textContent = submitLabel(step, copy);
  authSubmit.disabled = busy || !canSubmit(step, fields);
  authEmailLabel.textContent = copy.emailLabel;
  authPasswordLabel.textContent = copy.passwordLabel;
  authDisplayNameLabel.textContent = copy.displayNameLabel;
  authPasswordHint.textContent = copy.passwordHint;

  for (const target of ['sign-in', 'sign-up', 'forgot'] as const) {
    const tab = tabs[target];
    tab.textContent = copy[target === 'sign-in' ? 'tabSignIn' : target === 'sign-up' ? 'tabSignUp' : 'tabForgot'];
    tab.setAttribute('aria-selected', String(step === target));
  }

  // The address is asked in every form; the password everywhere but the forgotten one (where the
  // answer is the mail, not the password); the name only when an account is being created.
  authEmailField.hidden = !onForm;
  authPasswordField.hidden = step === 'forgot';
  authDisplayNameField.hidden = step !== 'sign-up';
  authPasswordHint.hidden = step !== 'sign-up';

  authProblem.hidden = problem === null;
  authProblem.textContent = problem ?? '';

  authCheckMailHeading.textContent = copy.checkMailHeading;
  authCheckMailBody.textContent = copy.checkMailBody;
  authCheckMailBack.textContent = copy.checkMailBack;

  if (onForm) renderProviders(copy);
}

function submitLabel(step: AuthStep, copy: AccountCopy): string {
  switch (step) {
    case 'sign-up':
      return copy.submitSignUp;
    case 'forgot':
      return copy.submitForgot;
    case 'sign-in':
    case 'check-mail':
    case 'closed':
      return copy.submitSignIn;
  }
}

/** Reads the fields as they are now. Called on every keystroke, which is what enables the button. */
function readFields(): void {
  fields = {
    email: authEmail.value,
    password: authPassword.value,
    displayName: authDisplayName.value,
  };
  renderAuth();
}

/**
 * The form's press. Each step is one route: the sign-in, the register and the forgotten password all
 * answer `check-mail` for a request the platform took, which is the same sentence for a known and an
 * unknown address.
 */
async function submitAuth(): Promise<void> {
  if (busy || !canSubmit(step, fields)) return;

  const attempt = step;
  problem = null;
  busy = true;
  renderAuth();

  try {
    switch (attempt) {
      case 'sign-in': {
        const state = await signIn(api, { email: fields.email.trim(), password: fields.password });
        // The dialog goes only after the store knows who is playing: a card that closes first would
        // leave the control showing a guest for the moment the request took.
        setAccount(state);
        step = 'closed';
        break;
      }
      case 'sign-up': {
        const displayName = fields.displayName.trim();
        await api.register({
          email: fields.email.trim(),
          password: fields.password,
          ...(displayName === '' ? {} : { displayName }),
        });
        step = nextStep(attempt, 'sent');
        break;
      }
      case 'forgot':
        await api.forgot(fields.email.trim());
        step = nextStep(attempt, 'sent');
        break;
      case 'closed':
      case 'check-mail':
        break;
    }
  } catch (error) {
    problem = accountCopy().problems[attempt === 'sign-in' ? signInFailure(error) : formFailure(error)];
  } finally {
    busy = false;
    renderAuth();
    if (step === 'closed') control.focus();
  }
}

// --- the profile ---------------------------------------------------------------------------------

function openProfile(): void {
  if (currentAccount().status !== 'signed-in') return;
  closeAuth();
  closeHistory();
  setCard(profile, true);
  renderProfile();
  profileClose.focus();
}

function closeProfile(): void {
  setCard(profile, false);
}

function renderProfile(): void {
  const view = profileView(currentAccount(), accountCopy());

  profileTitle.textContent = view.title;
  profileClose.setAttribute('aria-label', view.closeLabel);
  profileName.textContent = view.name;
  profileEmail.textContent = view.email ?? '';
  profileEmail.hidden = view.email === null;
  profileAvatar.hidden = view.avatarUrl === null;
  if (view.avatarUrl !== null) profileAvatar.src = view.avatarUrl;
  profileAgentsHeading.textContent = view.agentsHeading;
  profileAgents.replaceChildren(
    ...view.agents.map((agent) => {
      const row = document.createElement('li');
      row.className = 'account-agent';
      const label = document.createElement('span');
      label.textContent = agent.label;
      const level = document.createElement('span');
      level.className = 'account-level';
      level.textContent = agent.level;
      row.append(label, level);
      return row;
    }),
  );
  profileNoAgents.hidden = view.agents.length > 0;
  profileNoAgents.textContent = view.noAgents;
  profileHistory.textContent = view.historyLabel;
  profileSecurity.textContent = view.securityLabel;
  profileSignOut.textContent = view.signOutLabel;
  profileProblem.hidden = true;
  profileProblem.textContent = '';
}

/** The avatar the platform knows can be gone: the panel keeps its shape, only without the picture. */
profileAvatar.addEventListener('error', () => {
  profileAvatar.hidden = true;
  profileAvatar.removeAttribute('src');
});

async function leave(): Promise<void> {
  const copy = accountCopy();
  const outcome = await signOut(api, currentAccount());
  setAccount(outcome.state);

  if (outcome.failure === null) {
    closeProfile();
    control.focus();
    return;
  }

  // The cookie may still be alive, so the panel stays and the failure is said out loud.
  profileProblem.textContent = outcome.failure === 'offline' ? copy.problems.offline : copy.problems.unknown;
  profileProblem.hidden = false;
}

// --- the security card and the deletion ----------------------------------------------------------

function openSecurity(): void {
  if (currentAccount().status !== 'signed-in') return;
  closeAuth();
  closeHistory();
  closeProfile();
  setCard(security, true);
  renderSecurity();
  securityClose.focus();
}

function closeSecurity(): void {
  setCard(security, false);
}

function renderSecurity(): void {
  const copy = accountCopy();

  securityTitle.textContent = copy.securityLabel;
  securityClose.setAttribute('aria-label', copy.close);
  // The platform gives one fact about how the account signs in, and the line reads the side it names.
  securityMethods.textContent = accountHasPassword()
    ? copy.securityMethodsPassword
    : copy.securityMethodsProvider;
  securityDelete.textContent = copy.securityDelete;
}

/** Opens the confirmation empty and with nothing to say: a refusal of the last visit is forgotten. */
function openDeletion(): void {
  closeSecurity();
  deletion = { confirmation: '', password: '' };
  deletionProblem = null;
  deleting = false;
  deleteConfirmation.value = '';
  deletePassword.value = '';
  setCard(deleteCard, true);
  renderDeletion();
  deleteConfirmation.focus();
}

function closeDeletion(): void {
  setCard(deleteCard, false);
}

function renderDeletion(): void {
  const copy = accountCopy();
  const hasPassword = accountHasPassword();

  deleteTitle.textContent = copy.deleteTitle;
  deleteClose.setAttribute('aria-label', copy.close);
  deleteWarning.textContent = copy.deleteWarning;
  deleteConfirmLabel.textContent = copy.deleteConfirmationLabel;
  deletePasswordLabel.textContent = copy.deletePasswordLabel;
  // An account without a password has no field to ask in: the word alone is the whole proof.
  deletePasswordField.hidden = !hasPassword;
  deleteSubmit.textContent = copy.deleteSubmit;
  deleteSubmit.disabled = deleting || !confirmationAccepted(deletion, hasPassword);
  deleteCancel.textContent = copy.deleteCancel;
  // The problem line is the last press's, and a keystroke does not clear it: it stays until the next
  // answer, so the player can read why while correcting what caused it.
  deleteProblemLine.hidden = deletionProblem === null;
  deleteProblemLine.textContent = deletionProblem === null ? '' : copy.deletionProblems[deletionProblem];
}

/** Reads the fields as they are now, which is what keeps the button honest on every keystroke. */
function readDeletion(): void {
  deletion = { confirmation: deleteConfirmation.value, password: deletePassword.value };
  renderDeletion();
}

async function submitDeletion(): Promise<void> {
  const hasPassword = accountHasPassword();
  if (deleting || !confirmationAccepted(deletion, hasPassword)) return;

  deleting = true;
  deletionProblem = null;
  renderDeletion();

  const outcome = await deleteAccount(api, deletion, hasPassword);
  deleting = false;

  // Both answers that end well are the guest state: the account is gone, or the cookie names one that
  // no longer exists. The card closes either way and the title is the one the player came from.
  if (outcome.status === 'deleted' || outcome.reason === 'signed-out') {
    setAccount({ status: 'guest' });
    closeDeletion();
    control.focus();
    return;
  }

  deletionProblem = outcome.reason;
  renderDeletion();
  // The next try starts where it went wrong: the word if the platform refused it, the password if not.
  if (outcome.reason === 'confirmation') deleteConfirmation.focus();
  else if (outcome.reason === 'password') deletePassword.focus();
}

// --- the history ---------------------------------------------------------------------------------

function openHistory(): void {
  closeAuth();
  closeProfile();
  setCard(historyCard, true);
  // Every opening asks for the first page again: a match just played is in the history without a
  // reload, and the panel never draws a list from before the last match.
  history = emptyHistory();
  renderHistory();
  historyClose.focus();
  void fetchPage();
}

function closeHistory(): void {
  setCard(historyCard, false);
}

/** One page more, from wherever the last one stopped. A failure keeps the rows already on screen. */
async function fetchPage(): Promise<void> {
  history = startLoading(history);
  renderHistory();
  history = await loadMore(history, (cursor) => api.matches(cursor));
  renderHistory();
}

/** The day a match ended, in the language on screen; an unreadable date is shown as it arrived. */
function formatDate(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(getLocale(), { year: 'numeric', month: 'short', day: '2-digit' }).format(at);
}

function renderHistory(): void {
  const view = historyView(history, accountCopy(), formatDate);

  historyTitle.textContent = view.title;
  historyClose.setAttribute('aria-label', view.closeLabel);
  historyRows.replaceChildren(
    ...view.rows.map((row) => {
      const line = document.createElement('li');
      line.className = 'history-row';
      for (const [name, text] of [
        ['history-date', row.date],
        ['history-map', row.map],
        ['history-result', row.result],
        ['history-rounds', row.rounds],
      ] as const) {
        const cell = document.createElement('span');
        cell.className = name;
        cell.textContent = text;
        line.append(cell);
      }
      return line;
    }),
  );
  historyEmpty.hidden = !view.empty;
  historyEmpty.textContent = view.emptyText;
  historyFailure.hidden = view.failure === null;
  historyFailure.textContent = view.failure ?? '';
  historyMore.hidden = view.action === 'exhausted';
  historyMore.textContent = view.actionLabel;
  historyMore.disabled = view.action === 'loading';
}

// --- the wiring ----------------------------------------------------------------------------------

/**
 * A card's keys belong to the card: Enter starts a match from anywhere on the page, and inside a form
 * or on a button it must do what the card says. Escape closes the card that is open.
 */
function keepKeys(card: HTMLElement, close: () => void): void {
  card.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      control.focus();
    }
  });
}

control.addEventListener('click', () => {
  if (currentAccount().status === 'signed-in') openProfile();
  else openAuth('sign-in');
});

authClose.addEventListener('click', closeAuth);
profileClose.addEventListener('click', closeProfile);
historyClose.addEventListener('click', () => {
  closeHistory();
  control.focus();
});

for (const target of ['sign-in', 'sign-up', 'forgot'] as const) {
  tabs[target].addEventListener('click', () => go(target));
}

authCheckMailBack.addEventListener('click', () => go('back'));

// The `input` events are what keep `canSubmit` honest: the button enables the moment the form is one
// the platform can read, and not before.
authEmail.addEventListener('input', readFields);
authPassword.addEventListener('input', readFields);
authDisplayName.addEventListener('input', readFields);

authForm.addEventListener('submit', (event) => {
  // A real form submit, so Enter is the browser's: `preventDefault` only stops the page's reload.
  event.preventDefault();
  void submitAuth();
});

profileHistory.addEventListener('click', openHistory);
profileSecurity.addEventListener('click', openSecurity);
profileSignOut.addEventListener('click', () => void leave());

historyMore.addEventListener('click', () => void fetchPage());

// The security card hands the screen to the confirmation; every way out of either returns the focus to
// the control, which is where the player came from.
securityClose.addEventListener('click', () => {
  closeSecurity();
  control.focus();
});
securityDelete.addEventListener('click', openDeletion);

deleteClose.addEventListener('click', () => {
  closeDeletion();
  control.focus();
});
deleteCancel.addEventListener('click', () => {
  closeDeletion();
  control.focus();
});

deleteConfirmation.addEventListener('input', readDeletion);
deletePassword.addEventListener('input', readDeletion);

deleteForm.addEventListener('submit', (event) => {
  // A real form submit, so Enter is the browser's: `preventDefault` only stops the page's reload.
  event.preventDefault();
  void submitDeletion();
});

keepKeys(auth, closeAuth);
keepKeys(profile, closeProfile);
keepKeys(historyCard, closeHistory);
keepKeys(security, closeSecurity);
keepKeys(deleteCard, closeDeletion);

// The store is the one source the control and the panel follow: a sign-in in the dialog, a sign-out in
// the panel, and the boot's `/me` all arrive here.
onAccountChange((state) => {
  renderControl(state);

  if (state.status !== 'signed-in') {
    // A deletion ends here too: the store turns guest and the cards have nobody left to speak to.
    closeProfile();
    closeSecurity();
    closeDeletion();
    return;
  }

  if (!profile.hidden) renderProfile();
  if (!security.hidden) renderSecurity();
  if (!deleteCard.hidden) renderDeletion();
});

// A language change rewrites whatever is on the screen from the catalog, the way the title does.
onLocaleChange(() => {
  renderControl(currentAccount());
  if (step !== 'closed') renderAuth();
  if (!profile.hidden) renderProfile();
  if (!historyCard.hidden) renderHistory();
  // The typed word and password are kept: only the lines around them change.
  if (!security.hidden) renderSecurity();
  if (!deleteCard.hidden) renderDeletion();
});

document.documentElement.lang = getLocale();
renderControl(currentAccount());
