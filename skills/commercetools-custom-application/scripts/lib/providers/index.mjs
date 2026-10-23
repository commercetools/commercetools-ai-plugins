// The hosts the session can deploy to by itself. Each provider exposes the same seam: `label`
// for the step title, `cli` for preflight, `planLines` for the review screen, `protectedPattern`
// and `protectedHint` for the host check, and `deploy(ctx, tools)`, the deploy step's body.
// A host absent from this map is still fine: the user deploys and the session asks for the URL.
import { vercel } from './vercel.mjs';
import { netlify } from './netlify.mjs';
import { cloudflare } from './cloudflare.mjs';
import { connect } from './connect.mjs';

export const PROVIDERS = { vercel, netlify, cloudflare, connect };

export const providerFor = (hosting) => (hosting && PROVIDERS[hosting]) || null;
