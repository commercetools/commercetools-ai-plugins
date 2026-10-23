// The email of the Merchant Center user who is signed in, for pre-filling the contact email.
// Tries the stored session of each region in order and asks the first valid one. Anything that
// goes wrong yields null: the form then simply asks.
import { mcApiUrlForRegion } from './validate.mjs';

export async function signedInEmail({ regions, readSession, clientFor }) {
  for (const region of regions) {
    const mcApiUrl = mcApiUrlForRegion(region);
    const session = readSession({ mcApiUrl });
    if (!session.valid) continue;
    try {
      const data = await clientFor({ mcApiUrl, token: session.token }).me();
      const email = data?.me?.email;
      if (email) return email;
    } catch {
      return null;
    }
  }
  return null;
}
