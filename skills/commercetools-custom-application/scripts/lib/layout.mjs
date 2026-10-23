// Where the app lives relative to the folder the user named. For every static host the folder is
// the app. Connect builds from a GitHub repository whose root holds connect.yaml and whose
// application folder is named like its deployAs entry, so for Connect the folder is the
// repository root and the app is one level down, named from the app name. A resume may start
// from either level. `exists(path)` is injected so this stays pure.
import path from 'node:path';
import { slugify } from './intake.mjs';

export function resolveLayout({ hosting, folder, appName, exists }) {
  const flat = { repoDir: null, appDir: folder };
  if (hosting !== 'connect') return flat;
  const parent = path.dirname(folder);
  // Resumed from the app subfolder of a Connect repo.
  if (exists(path.join(folder, 'custom-application-config.mjs')) && exists(path.join(parent, 'connect.yaml'))) {
    return { repoDir: parent, appDir: folder };
  }
  // Do not infer a parent repository for an existing app without a Connect layout.
  if (exists(path.join(folder, 'custom-application-config.mjs'))) {
    throw new Error('Connect requires an app subfolder beneath a repository root containing connect.yaml. Set up that layout before retrying; the parent directory will not be used automatically.');
  }
  return { repoDir: folder, appDir: path.join(folder, slugify(appName)) };
}
