// The region is the host part of mc.<region>.commercetools.com. Both scripts interpolate it
// into https://mc-api.<region>.commercetools.com and send the session token there, so a value
// that could change the host is rejected.

const REGION = /^[a-z0-9-]+\.(gcp|aws)$/;
const PROJECT = /^[a-z0-9_-]+$/i;

export function checkRegion(region) {
  return region && REGION.test(region) ? '' : 'Use the region part of mc.<region>.commercetools.com, for example europe-west1.gcp.';
}

export function checkProject(project) {
  return project && PROJECT.test(project) ? '' : 'Pass the project key.';
}

export function mcApiUrl(region) {
  return `https://mc-api.${region}.commercetools.com`;
}

// Drops empty messages. Key order follows the pairs, which is the order the errors object is built.
export function fieldErrors(pairs) {
  const errors = {};
  for (const [name, message] of pairs) if (message) errors[name] = message;
  return Object.keys(errors).length ? errors : null;
}
