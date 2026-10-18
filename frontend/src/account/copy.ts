// Every line the account screens show, read from the catalog of the language the client is in, on the
// same contract as `title/copy.ts`: the type is the list, so a line missing from this map is a compile
// error and a key the reference catalog does not define is another.
//
// The copy is read on every call and never held as a constant: the switcher rewrites the screens while
// they are open, and a constant cannot follow a language that changes after the page is up.
import { t } from '../i18n';
import type { ProviderName } from '../api/client';
import type { FormProblem, ResetProblem, SignInProblem } from './auth-flow';
import type { DeletionRefusal } from './delete-account';

/** A sentence for every failure a screen can name. `invalid-token` is not one: it is the link's state. */
export type AccountProblem =
  | SignInProblem
  | FormProblem
  | Exclude<ResetProblem, 'invalid-token'>
  | 'too-short'
  | 'too-long'
  | 'mismatch';

/** A sentence for the two failures a mailed link's page can name. */
export type MailProblem = Exclude<
  AccountProblem,
  'invalid-credentials' | 'email-not-verified' | 'too-many-attempts' | 'invalid-body'
>;

/** Every line the sign-in dialog, the profile and the history show. */
export interface AccountCopy {
  /** What the account control is called, for a screen reader. */
  readonly control: string;
  /** The control while nobody is signed in. */
  readonly signIn: string;
  readonly signOut: string;
  readonly close: string;
  readonly dialogTitle: string;
  readonly tabSignIn: string;
  readonly tabSignUp: string;
  readonly tabForgot: string;
  /** The line above the provider buttons. */
  readonly providers: string;
  readonly providerNames: Readonly<Record<ProviderName, string>>;
  readonly emailLabel: string;
  readonly passwordLabel: string;
  readonly confirmationLabel: string;
  readonly displayNameLabel: string;
  readonly passwordHint: string;
  readonly submitSignIn: string;
  readonly submitSignUp: string;
  readonly submitForgot: string;
  readonly checkMailHeading: string;
  readonly checkMailBody: string;
  readonly checkMailBack: string;
  readonly problems: Readonly<Record<AccountProblem, string>>;
  readonly profileTitle: string;
  readonly agentsHeading: string;
  readonly noAgents: string;
  /** `nível 3`, `level 3`: the level of one agent of the squad. */
  readonly level: (level: number) => string;
  readonly historyLabel: string;
  readonly historyTitle: string;
  readonly historyEmpty: string;
  /** The release-e-mail consent's label, beside the checkbox the profile shows (m4-05, D6). */
  readonly releaseEmailsLabel: string;
  readonly historyLoadMore: string;
  readonly historyLoading: string;
  readonly historyFailure: string;
  /** `12 rodadas`, `12 rounds`: how long one finished match lasted. */
  readonly rounds: (rounds: number) => string;
  readonly resultWon: string;
  readonly resultLost: string;
  /** The name of each map the history can list, by the id the platform stores. */
  readonly mapNames: Readonly<Record<string, string>>;
  /** The profile's action and the security card's title. */
  readonly securityLabel: string;
  /** How the account signs in, by the one fact the platform gives: a password, or a provider. */
  readonly securityMethodsPassword: string;
  readonly securityMethodsProvider: string;
  /** The exit the security card offers. */
  readonly securityDelete: string;
  readonly deleteTitle: string;
  /** What is erased, and that it cannot be undone. */
  readonly deleteWarning: string;
  readonly deleteConfirmationLabel: string;
  readonly deletePasswordLabel: string;
  readonly deleteSubmit: string;
  readonly deleteCancel: string;
  /** The line the confirmation shows for each refusal the platform — or the network — can give. */
  readonly deletionProblems: Readonly<Record<DeletionRefusal, string>>;
}

/** Every line of the account screens, in the language the client is showing right now. */
export function accountCopy(): AccountCopy {
  return {
    control: t('account.control'),
    signIn: t('account.signIn'),
    signOut: t('account.signOut'),
    close: t('account.close'),
    dialogTitle: t('account.dialog.title'),
    tabSignIn: t('account.tab.signIn'),
    tabSignUp: t('account.tab.signUp'),
    tabForgot: t('account.tab.forgot'),
    providers: t('account.providers'),
    providerNames: {
      // Keycloak is the realm's own door and not a provider the player recognises, so the button says
      // what it is: the deployment's single sign-on.
      keycloak: t('account.provider.keycloak'),
      github: t('account.provider.github'),
      google: t('account.provider.google'),
    },
    emailLabel: t('account.field.email'),
    passwordLabel: t('account.field.password'),
    confirmationLabel: t('account.field.confirmation'),
    displayNameLabel: t('account.field.displayName'),
    passwordHint: t('account.password.hint'),
    submitSignIn: t('account.submit.signIn'),
    submitSignUp: t('account.submit.signUp'),
    submitForgot: t('account.submit.forgot'),
    checkMailHeading: t('account.checkMail.heading'),
    checkMailBody: t('account.checkMail.body'),
    checkMailBack: t('account.checkMail.back'),
    problems: problems(),
    profileTitle: t('account.profile.title'),
    agentsHeading: t('account.profile.agents'),
    noAgents: t('account.profile.noAgents'),
    level: (level) => t('account.profile.level', { level }),
    historyLabel: t('account.history'),
    historyTitle: t('account.history.title'),
    historyEmpty: t('account.history.empty'),
    releaseEmailsLabel: t('account.releaseEmails.label'),
    historyLoadMore: t('account.history.loadMore'),
    historyLoading: t('account.history.loading'),
    historyFailure: t('account.history.failure'),
    rounds: (rounds) => t('account.history.rounds', { rounds }),
    resultWon: t('account.history.won'),
    resultLost: t('account.history.lost'),
    // The three maps the game ships. An id this build does not name is drawn by the id itself, so a
    // newer server's map is a row with a plain name instead of a row with nothing.
    mapNames: {
      street: t('map.street.title'),
      park: t('map.park.title'),
      roof: t('map.roof.title'),
    },
    securityLabel: t('account.security.label'),
    securityMethodsPassword: t('account.security.methods.password'),
    securityMethodsProvider: t('account.security.methods.provider'),
    securityDelete: t('account.security.delete'),
    deleteTitle: t('account.delete.title'),
    deleteWarning: t('account.delete.warning'),
    deleteConfirmationLabel: t('account.delete.confirmLabel'),
    deletePasswordLabel: t('account.field.password'),
    deleteSubmit: t('account.delete.submit'),
    deleteCancel: t('account.delete.cancel'),
    deletionProblems: {
      confirmation: t('account.delete.problem.confirmation'),
      password: t('account.delete.problem.password'),
      throttled: t('account.problem.tooManyAttempts'),
      'signed-out': t('account.delete.problem.signedOut'),
      offline: t('account.problem.offline'),
      unknown: t('account.problem.unknown'),
    },
  };
}

/** Every line the two mailed-link pages show. */
export interface MailCopy {
  readonly verifyHeading: string;
  readonly verifyBody: string;
  readonly verifyAction: string;
  readonly verifyWorking: string;
  readonly verifyDoneHeading: string;
  readonly verifyDoneBody: string;
  readonly resetHeading: string;
  readonly resetBody: string;
  readonly resetAction: string;
  readonly resetWorking: string;
  readonly resetDoneHeading: string;
  readonly resetDoneBody: string;
  readonly invalidHeading: string;
  readonly invalidBody: string;
  readonly missingHeading: string;
  readonly missingBody: string;
  readonly back: string;
  readonly passwordLabel: string;
  readonly confirmationLabel: string;
  readonly passwordHint: string;
  readonly problems: Readonly<Record<MailProblem, string>>;
}

/** Every line of the mailed-link pages, in the language the client is showing right now. */
export function mailCopy(): MailCopy {
  const all = problems();
  return {
    verifyHeading: t('mail.verify.heading'),
    verifyBody: t('mail.verify.body'),
    verifyAction: t('mail.verify.action'),
    verifyWorking: t('mail.verify.working'),
    verifyDoneHeading: t('mail.verify.doneHeading'),
    verifyDoneBody: t('mail.verify.doneBody'),
    resetHeading: t('mail.reset.heading'),
    resetBody: t('mail.reset.body'),
    resetAction: t('mail.reset.action'),
    resetWorking: t('mail.reset.working'),
    resetDoneHeading: t('mail.reset.doneHeading'),
    resetDoneBody: t('mail.reset.doneBody'),
    invalidHeading: t('mail.invalid.heading'),
    invalidBody: t('mail.invalid.body'),
    missingHeading: t('mail.missing.heading'),
    missingBody: t('mail.missing.body'),
    back: t('mail.back'),
    passwordLabel: t('account.field.password'),
    confirmationLabel: t('account.field.confirmation'),
    passwordHint: t('account.password.hint'),
    problems: {
      'invalid-password': all['invalid-password'],
      offline: all.offline,
      unknown: all.unknown,
      'too-short': all['too-short'],
      'too-long': all['too-long'],
      mismatch: all.mismatch,
    },
  };
}

/** The failure sentences, shared by the dialog and the mailed-link pages. */
function problems(): Readonly<Record<AccountProblem, string>> {
  return {
    'invalid-credentials': t('account.problem.invalidCredentials'),
    'email-not-verified': t('account.problem.emailNotVerified'),
    'too-many-attempts': t('account.problem.tooManyAttempts'),
    offline: t('account.problem.offline'),
    unknown: t('account.problem.unknown'),
    'invalid-password': t('account.problem.invalidPassword'),
    'invalid-body': t('account.problem.invalidBody'),
    'too-short': t('account.problem.tooShort'),
    'too-long': t('account.problem.tooLong'),
    mismatch: t('account.problem.mismatch'),
  };
}
