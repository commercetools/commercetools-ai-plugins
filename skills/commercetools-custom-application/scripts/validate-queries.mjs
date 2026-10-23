#!/usr/bin/env node
// Validates every GraphQL document in lib/settings-api.mjs against the settings
// schema shipped in merchant-center-application-kit (schemas/settings.json).
// Run it after editing a query or when the schema changes: string-matching tests
// cannot tell you a field was renamed upstream.
//
// Usage: node validate-queries.mjs <path-to-merchant-center-application-kit>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { GQL, CORE_GQL, MC_GQL } from './lib/settings-api.mjs';

const kit = process.argv[2];
if (!kit) {
  console.error('Usage: validate-queries.mjs <path-to-merchant-center-application-kit>');
  process.exit(2);
}
const require = createRequire(path.join(kit, 'package.json'));
const { buildClientSchema, parse, validate } = require('graphql');
const load = (file) => {
  const raw = JSON.parse(fs.readFileSync(path.join(kit, 'schemas', file), 'utf8'));
  return buildClientSchema(raw.data ?? raw);
};
const sets = [
  [load('settings.json'), GQL],
  [load('core.json'), CORE_GQL],
  [load('mc.json'), MC_GQL],
];

let failures = 0;
for (const [schema, docs] of sets) {
  for (const [name, doc] of Object.entries(docs)) {
    const errors = validate(schema, parse(doc));
    console.log(`${errors.length ? 'FAIL' : 'ok  '} ${name}${errors.length ? ': ' + errors.map((e) => e.message).join('; ') : ''}`);
    failures += errors.length;
  }
}
process.exit(failures ? 1 : 0);
