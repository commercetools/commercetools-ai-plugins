import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLayout } from '../scripts/lib/layout.mjs';

// Connect builds from a GitHub repository whose root holds connect.yaml and whose application
// folder is named like the deployAs entry. So for Connect the form's folder is the repository
// root and the app lives one level down; for every other host the folder is the app itself.
const existsIn = (paths) => (p) => paths.includes(p);

test('a static host: the folder is the app, there is no separate repo root', () => {
  assert.deepEqual(resolveLayout({ hosting: 'vercel', folder: '/work/my-app', appName: 'My App', exists: existsIn([]) }), { repoDir: null, appDir: '/work/my-app' });
});

test('connect, fresh: the folder is the repo root and the app goes in a subfolder named from the app name', () => {
  assert.deepEqual(resolveLayout({ hosting: 'connect', folder: '/work/my-app', appName: 'My App', exists: existsIn([]) }), { repoDir: '/work/my-app', appDir: '/work/my-app/my-app' });
});

test('connect, resumed from the repo root: the existing app subfolder is found', () => {
  const exists = existsIn(['/work/my-app/connect.yaml', '/work/my-app/my-app/custom-application-config.mjs']);
  assert.deepEqual(resolveLayout({ hosting: 'connect', folder: '/work/my-app', appName: 'My App', exists }), { repoDir: '/work/my-app', appDir: '/work/my-app/my-app' });
});

test('connect, resumed from the app subfolder: the parent with connect.yaml is the repo root', () => {
  const exists = existsIn(['/work/my-app/connect.yaml', '/work/my-app/my-app/custom-application-config.mjs']);
  assert.deepEqual(resolveLayout({ hosting: 'connect', folder: '/work/my-app/my-app', appName: 'My App', exists }), { repoDir: '/work/my-app', appDir: '/work/my-app/my-app' });
});

test('an existing app folder without connect.yaml anywhere is left alone even for connect, so the layout is explained, not forced', () => {
  const exists = existsIn(['/work/my-app/custom-application-config.mjs']);
  assert.deepEqual(resolveLayout({ hosting: 'connect', folder: '/work/my-app', appName: 'My App', exists }), { repoDir: null, appDir: '/work/my-app' });
});
