#!/usr/bin/env node

/**
 * Fetch OpenAPI (OAS) schema for the agent
 *
 * Fetches a partial commercetools OpenAPI specification for a single resource as
 * grounding context for the agent, with instrumentation headers. Use this to
 * inspect a resource's REST endpoints, request/response payloads, and update
 * actions before generating REST clients or requests.
 * Results are written to stdout for consumption by AI agents.
 *
 * Usage:
 *   node scripts/openApi-schemata.mjs --resource-name "api-Cart-write" --app-name <name> --model <model> --skill-name <skill>
 *
 * Required:
 *   --resource-name <string>  commercetools resource name (e.g., api-Cart-read, api-Cart-write, api-Customer-write, checkout-Application)
 *   --app-name <string>       Calling app/tool (e.g., claude, copilot, cursor, codex)
 *   --model <string>          Model name (e.g., claude-sonnet-4.5, gpt-4)
 *   --skill-name <string>     Skill identifier (e.g., commercetools-platform)
 */

import { parseArgs } from 'util';

const SCHEMA_URL = 'https://docs.commercetools.com/apis/rest/tools/oas-schemata';

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
  console.error('Usage: node scripts/openApi-schemata.mjs --resource-name "api-Cart-write" --app-name "app" --model "model" --skill-name "skill"');
  process.exit(1);
}

// Fetch the partial OpenAPI spec and print it (fail soft: exit 0 on any error)
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

  // The result is an OpenAPI specification (YAML string) for the requested resource
  if (typeof response.result === 'string' && response.result.length > 0) {
    process.stdout.write(`# OpenAPI Schema for resource: ${values['resource-name']}\n\n`);
    process.stdout.write('```yaml\n');
    process.stdout.write(response.result.endsWith('\n') ? response.result : `${response.result}\n`);
    process.stdout.write('```\n');
  } else if (response.result && typeof response.result === 'object') {
    // Fallback: output a structured (JSON) result as-is
    process.stdout.write(`# OpenAPI Schema for resource: ${values['resource-name']}\n\n`);
    process.stdout.write('```json\n');
    process.stdout.write(`${JSON.stringify(response.result, null, 2)}\n`);
    process.stdout.write('```\n');
  } else {
    process.stdout.write(`No schema found for resource "${values['resource-name']}". Check the resource name spelling.\n`);
  }
} catch (err) {
  process.exit(0);
}
