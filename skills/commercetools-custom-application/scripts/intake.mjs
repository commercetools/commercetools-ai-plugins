#!/usr/bin/env node
// Step 0 form. Two modes, both print JSON.
//   node intake.mjs form  --app-name NAME [--hosting vercel] [--email you@x.com]
//     -> { batches: [...] }  Feed each batch to AskUserQuestion, in order.
//   node intake.mjs check --answers answers.json
//     -> { ok, errors, inputs, next }  Exit 0 when every answer is valid, 1 otherwise.
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { buildForm, validateAnswers } from './lib/intake.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'app-name': { type: 'string' }, hosting: { type: 'string' },
    email: { type: 'string' }, answers: { type: 'string' },
  },
});

if (positionals[0] === 'form' && values['app-name']) {
  const batches = buildForm({ appName: values['app-name'], hosting: values.hosting, defaults: { email: values.email } });
  console.log(JSON.stringify({ batches }, null, 2));
} else if (positionals[0] === 'check' && values.answers) {
  const r = validateAnswers(JSON.parse(fs.readFileSync(values.answers, 'utf8')));
  const i = r.inputs;
  if (r.ok) {
    r.next = `node scripts/preflight.mjs --region ${i.region} --entry-point ${i.entryPointUriPath} --hosting ${i.hosting}`;
  }
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
} else {
  console.error('Usage: intake.mjs form --app-name NAME [--hosting H] [--email E] | check --answers FILE');
  process.exit(2);
}
