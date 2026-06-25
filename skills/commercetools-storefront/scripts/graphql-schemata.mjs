#!/usr/bin/env node

/**
 * Fetch GraphQL schema for the agent
 *
 * Fetches a partial commercetools GraphQL SDL for a single resource as grounding
 * context for the agent, with instrumentation headers. Use this to inspect a
 * resource's fields and available operations before writing queries or mutations.
 * Results are written to stdout for consumption by AI agents.
 *
 * Usage:
 *   node scripts/graphql-schemata.mjs --resource-name "Cart" --app-name <name> --model <model> --skill-name <skill>
 *
 * Required:
 *   --resource-name <string>  commercetools resource name (e.g., Cart, Product, Order)
 *   --app-name <string>       Calling app/tool (e.g., claude, copilot, cursor, codex)
 *   --model <string>          Model name (e.g., claude-sonnet-4.5, gpt-4)
 *   --skill-name <string>     Skill identifier (e.g., commercetools-platform)
 */

import { parseArgs } from 'util';

const SCHEMA_URL = 'https://docs.commercetools.com/apis/rest/tools/graphql-schemata';

// Parse command line arguments
const { values } = parseArgs({
  options: {
    'resource-name': { type: 'string' },
    'app-name': { type: 'string' },
    model: { type: 'string' },
    'skill-name': { type: 'string' },
  },
});

// Validate required parameters
const missingParams = [];
if (!values['resource-name']) missingParams.push('--resource-name');
if (!values['app-name']) missingParams.push('--app-name');
if (!values.model) missingParams.push('--model');
if (!values['skill-name']) missingParams.push('--skill-name');

if (missingParams.length > 0) {
  console.error(`Error: Missing required parameters: ${missingParams.join(', ')}`);
  console.error('Usage: node scripts/graphql-schemata.mjs --resource-name "Cart" --app-name "app" --model "model" --skill-name "skill"');
  process.exit(1);
}

// Fetch the partial GraphQL SDL and print it (fail soft: exit 0 on any error)
try {
  const res = await fetch(SCHEMA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `${values['app-name']}/1.0 (${values.model})`,
      'X-Model': values.model,
      'X-Client-Type': values['app-name'],
      'X-Skill-Name': values['skill-name'],
    },
    body: JSON.stringify({ resourceName: values['resource-name'] }),
    signal: AbortSignal.timeout(60000),
  });

  const response = await res.json();

  // Surface API errors (e.g. an invalid resourceName returns HTTP 400)
  if (response.error) {
    const details = response.error.details;
    const validValues = Array.isArray(details)
      ? details.find((d) => Array.isArray(d.values))?.values
      : undefined;

    process.stdout.write(`No schema found for resource "${values['resource-name']}". Check the resource name spelling.\n`);
    if (validValues?.length) {
      process.stdout.write(`\nValid resource names:\n${validValues.join(', ')}\n`);
    }
    process.exit(0);
  }

  if (!res.ok) process.exit(0);

  // The result is a GraphQL SDL string for the requested resource
  if (typeof response.result === 'string' && response.result.length > 0) {
    process.stdout.write(`# GraphQL Schema for resource: ${values['resource-name']}\n\n`);
    process.stdout.write('```graphql\n');
    process.stdout.write(response.result.endsWith('\n') ? response.result : `${response.result}\n`);
    process.stdout.write('```\n');
  } else if (response.result) {
    // Fallback: output structured result as-is
    process.stdout.write(`${JSON.stringify(response.result, null, 2)}\n`);
  } else {
    process.stdout.write(`No schema found for resource "${values['resource-name']}". Check the resource name spelling.\n`);
  }
} catch (err) {
  process.exit(0);
}
