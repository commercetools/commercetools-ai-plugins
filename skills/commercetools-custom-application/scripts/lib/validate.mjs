// Rules from the Custom Application config docs (entryPointUriPath restrictions).
// The reserved list "can be extended at any time", so the Merchant Center stays the final judge.
const RESERVED = new Set([
  'account', 'audit-log', 'dashboard', 'categories', 'change-history', 'customers',
  'exports', 'discounts', 'operations', 'impex', 'imports', 'imports-exports',
  'orders', 'products', 'settings', 'welcome', 'disabled', 'standalone-prices',
]);

export function validateEntryPointUriPath(value) {
  if (typeof value !== 'string' || !/^[a-z0-9_-]+$/.test(value)) {
    return { ok: false, error: 'Only lowercase alphanumeric characters, hyphens and underscores are allowed.' };
  }
  if (value.length < 2 || value.length > 64) {
    return { ok: false, error: 'Must be between 2 and 64 characters.' };
  }
  if (/^[-_]|[-_]$|[-_]{2}/.test(value)) {
    return { ok: false, error: 'Hyphens and underscores cannot lead, trail, or sit next to each other.' };
  }
  if (RESERVED.has(value)) {
    return { ok: false, error: `"${value}" is reserved for a built-in Merchant Center application.` };
  }
  return { ok: true };
}

// Mirrors MC_API_URLS in @commercetools-frontend/application-config.
const MC_API_URLS = {
  'gcp-au': 'https://mc-api.australia-southeast1.gcp.commercetools.com',
  'gcp-eu': 'https://mc-api.europe-west1.gcp.commercetools.com',
  'gcp-us': 'https://mc-api.us-central1.gcp.commercetools.com',
  'aws-eu': 'https://mc-api.eu-central-1.aws.commercetools.com',
  'aws-us': 'https://mc-api.us-east-2.aws.commercetools.com',
  'aws-fra': 'https://mc-api.eu-central-1.aws.commercetools.com',
  'aws-ohio': 'https://mc-api.us-east-2.aws.commercetools.com',
};

export function mcApiUrlForRegion(cloudIdentifier) {
  return MC_API_URLS[cloudIdentifier] ?? null;
}
