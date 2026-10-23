// The intake form as a pure model: fields, values, focus, derivation from the app name, and
// validation on submit. The terminal code only paints it and feeds keys in.
import { slugify, validateAnswers } from './intake.mjs';

export const REGIONS = ['gcp-eu', 'gcp-us', 'gcp-au', 'aws-eu', 'aws-us'];

export const FIELDS = [
  { id: 'appName', label: 'App name', kind: 'text', hint: 'How the app is called in the Merchant Center' },
  { id: 'region', label: 'Region', kind: 'choice', options: REGIONS, hint: 'Where the Project lives' },
  { id: 'projectKey', label: 'Project key', kind: 'text', hint: 'A Project in the owner Organization, used for local development' },
  { id: 'entryPointUriPath', label: 'Entry path', kind: 'text', hint: 'Unique per region, names the permissions, hard to change later', derive: (name) => slugify(name) },
  { id: 'menuLabel', label: 'Menu label', kind: 'text', hint: 'What the main menu shows', derive: (name) => name },
  { id: 'contactEmail', label: 'Contact email', kind: 'text', hint: 'Maintainer contact, gets a verification email once per Organization. Starts as your sign-in email when signed in.' },
  { id: 'appDir', label: 'Folder', kind: 'text', hint: 'Where the app is created', derive: (name, cwd) => `${cwd}/${slugify(name)}` },
  { id: 'template', label: 'Language', kind: 'choice', options: ['starter-typescript', 'starter'], hint: 'TypeScript or plain JavaScript starter' },
  { id: 'hosting', label: 'Hosting', kind: 'choice', options: ['vercel', 'netlify', 'cloudflare', 'connect', 'surge', 'other'], hint: 'Vercel, Netlify, Cloudflare Pages and Connect have deployment help; otherwise you deploy and give the URL' },
];

export function initForm({ cwd, defaults = {} }) {
  const values = {};
  const pinned = new Set(Object.keys(defaults).filter((k) => defaults[k] !== undefined && defaults[k] !== ''));
  for (const f of FIELDS) values[f.id] = defaults[f.id] ?? (f.kind === 'choice' ? f.options[0] : '');
  const s = { cwd, values, pinned, focus: 0, errors: {}, submitted: false, quit: false };
  return derive(s);
}

// Derived fields follow the app name until the user edits them (or supplied them up front).
function derive(s) {
  const values = { ...s.values };
  for (const f of FIELDS) if (f.derive && !s.pinned.has(f.id)) values[f.id] = f.derive(values.appName, s.cwd);
  return { ...s, values };
}

export function reduceForm(state, key) {
  const s = { ...state, values: { ...state.values }, errors: { ...state.errors }, pinned: new Set(state.pinned) };
  delete s.message;
  if (key === 'abort' || key === 'escape') return { ...s, quit: true };
  const field = FIELDS[s.focus];
  const edit = (next) => {
    s.values[field.id] = next;
    delete s.errors[field.id];
    if (field.derive) s.pinned.add(field.id);
  };
  if (key === 'up') s.focus = Math.max(0, s.focus - 1);
  if (key === 'down' || key === 'tab') s.focus = Math.min(FIELDS.length - 1, s.focus + 1);
  if (field.kind === 'choice' && (key === 'right' || key === 'left' || key === 'space')) {
    const n = field.options.length;
    const i = field.options.indexOf(s.values[field.id]);
    edit(field.options[(i + (key === 'left' ? -1 : 1) + n) % n]);
  }
  if (field.kind === 'text') {
    if (key.startsWith('char:')) edit(s.values[field.id] + key.slice(5));
    if (key === 'space') edit(`${s.values[field.id]} `);
    if (key === 'backspace') edit(s.values[field.id].slice(0, -1));
    if (key === 'ctrl-u') edit('');
  }
  if (key === 'enter') {
    // The shared validator covers everything but the app name, which only the form needs.
    const r = validateAnswers(s.values);
    const errors = { ...(s.values.appName.trim() ? {} : { appName: 'Required.' }), ...r.errors };
    if (!Object.keys(errors).length) return { ...s, submitted: true };
    s.errors = errors;
    s.message = `Fix the ${Object.keys(errors).length === 1 ? 'field' : 'fields'} marked below.`;
    s.focus = FIELDS.findIndex((f) => errors[f.id]);
    return s;
  }
  return field.id === 'appName' && key !== 'enter' ? derive(s) : s;
}

export const formAnswers = (s) => validateAnswers(s.values).inputs;
