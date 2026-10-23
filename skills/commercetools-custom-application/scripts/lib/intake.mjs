// Step 0 intake. Builds the question form and validates the answers, so the skill never
// relies on prose to decide what to ask or what counts as a valid answer.
// The form is shaped for the AskUserQuestion tool: <= 4 questions per batch, 2-4 options each.
// Free-text fields get suggestions as options; the user types a custom value through "Other".
import { validateEntryPointUriPath, mcApiUrlForRegion } from './validate.mjs';

const REC = ' (Recommended)';
const TEMPLATES = ['starter-typescript', 'starter'];

export function slugify(name) {
  let s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (s.length < 2 || !validateEntryPointUriPath(s).ok) s = `${s || 'my'}-app`;
  return s.slice(0, 64).replace(/-+$/, '');
}

const opt = (label, description) => ({ label, description });
const rec = (value, description) => opt(`${value}${REC}`, description);

export function buildForm({ appName, hosting, defaults = {} }) {
  const slug = slugify(appName);
  const typeIt = (what) => opt('Type it myself', `Choose "Other" and enter ${what}.`);
  const questions = [
    {
      id: 'region', header: 'Region', multiSelect: false, freeText: true,
      question: 'Which cloud region does the commercetools Project live in?',
      options: [
        opt('gcp-eu', 'Google Cloud, Europe'), opt('gcp-us', 'Google Cloud, US'),
        opt('gcp-au', 'Google Cloud, Australia'), opt('aws-eu', 'AWS, Europe. For AWS US choose "Other" and type aws-us.'),
      ],
    },
    {
      id: 'projectKey', header: 'Project key', multiSelect: false, freeText: true,
      question: 'What is the key of the Project the app will be installed on?',
      options: [typeIt('the Project key'), opt('I have no Project', 'Stop here: the skill assumes an existing Project.')],
    },
    {
      id: 'entryPointUriPath', header: 'Entry path', multiSelect: false, freeText: true,
      question: 'Which entryPointUriPath? It names the permissions and is hard to change later.',
      options: [rec(slug, 'Derived from the app name'), typeIt('a lowercase path of 2 to 64 characters')],
    },
    {
      id: 'menuLabel', header: 'Menu label', multiSelect: false, freeText: true,
      question: 'What should the main-menu item say?',
      options: [rec(appName, 'The app name'), typeIt('a label')],
    },
    {
      id: 'contactEmail', header: 'Contact', multiSelect: false, freeText: true,
      question: 'Maintainer contact email (gets a verification link once per Organization)?',
      options: [
        defaults.email ? rec(defaults.email, 'Your account email') : typeIt('an email address'),
        opt('Type another', 'Choose "Other" and enter a different address.'),
      ],
    },
    {
      id: 'appDir', header: 'App dir', multiSelect: false, freeText: true,
      question: 'Where should the app be scaffolded?',
      options: [rec(`./${appName}`, 'Relative to the current directory'), typeIt('a path')],
    },
    {
      id: 'template', header: 'Language', multiSelect: false,
      question: 'TypeScript or JavaScript starter?',
      options: [rec('starter-typescript', 'TypeScript'), opt('starter', 'Plain JavaScript')],
    },
  ];
  if (!hosting) {
    questions.push({
      id: 'hosting', header: 'Hosting', multiSelect: false, freeText: true,
      question: 'Where will the app be hosted? Use what you already have.',
      options: [
        opt('vercel', 'CLI checks included'), opt('netlify', 'CLI checks included'),
        opt('surge', 'CLI checks included'), typeIt('any other static host'),
      ],
    });
  }
  const batches = [];
  for (let i = 0; i < questions.length; i += 4) {
    batches.push({ batch: batches.length + 1, questions: questions.slice(i, i + 4) });
  }
  return batches;
}

const clean = (v) => (typeof v === 'string' ? v.replace(/ \(Recommended\)$/, '').trim() : '');

export function validateAnswers(raw) {
  const a = Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, clean(v)]));
  const errors = {};
  const need = (k) => { if (!a[k]) errors[k] = 'Required.'; return Boolean(a[k]); };

  if (need('region') && !mcApiUrlForRegion(a.region)) errors.region = `Unknown region "${a.region}".`;
  if (need('projectKey') && !/^[a-z0-9][a-z0-9_-]+$/.test(a.projectKey)) {
    errors.projectKey = 'Project keys are lowercase letters, digits, hyphens and underscores.';
  }
  if (need('entryPointUriPath')) {
    const v = validateEntryPointUriPath(a.entryPointUriPath);
    if (!v.ok) errors.entryPointUriPath = v.error;
  }
  need('menuLabel');
  if (need('contactEmail') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.contactEmail)) {
    errors.contactEmail = 'Not an email address.';
  }
  need('appDir');
  if (need('template') && !TEMPLATES.includes(a.template)) {
    errors.template = `Must be one of ${TEMPLATES.join(', ')}.`;
  }
  need('hosting');

  return { ok: Object.keys(errors).length === 0, errors, inputs: a };
}
