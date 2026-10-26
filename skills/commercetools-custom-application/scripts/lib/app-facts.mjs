// Pulls entryPointUriPath and cloudIdentifier out of a scaffolded project by text,
// because the config imports from './src/constants' and cannot be import()ed standalone.
const quoted = (key) => new RegExp(`${key}\\s*[:=]\\s*(['"])([^'"]+)\\1`);

export function readAppFacts({ configSource, constantsSource }) {
  const entry =
    configSource.match(quoted('entryPointUriPath'))?.[2] ??
    constantsSource.match(quoted('entryPointUriPath'))?.[2];
  if (!entry) throw new Error('Could not determine entryPointUriPath from the config or src/constants. Pass --entry-point.');
  const region = configSource.match(quoted('cloudIdentifier'))?.[2];
  if (!region) throw new Error('Could not determine cloudIdentifier from the config. Pass --region.');
  if (region.includes('${')) throw new Error(`cloudIdentifier is "${region}", which needs the environment. Pass --region.`);
  const projectKey = configSource.match(quoted('initialProjectKey'))?.[2];
  return { entryPointUriPath: entry, cloudIdentifier: region, ...(projectKey ? { initialProjectKey: projectKey } : {}) };
}
