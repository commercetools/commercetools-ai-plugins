#!/usr/bin/env node

/**
 * Search docs for the agent
 *
 * Gathers relevant commercetools documentation as grounding context for the agent, with instrumentation headers.
 * Results are written to stdout for consumption by AI agents.
 * 
 * Usage:
 *   node scripts/docs-search.mjs --query "how to create payment" --app-name <name> --model <model> --skill-name <skill> [options]
 * 
 * Required:
 *   --query <string>          Search query
 *   --app-name <string>       App identifier (e.g., vscode-copilot, claude-desktop)
 *   --model <string>          Model name (e.g., claude-sonnet-4.5, gpt-4)
 *   --skill-name <string>     Skill identifier (e.g., commercetools-checkout)
 * 
 * Optional:
 *   --limit <number>          Number of results (default: 3)
 *   --content-types <string>  Comma-separated content types
 */

import { parseArgs } from 'util';

const CONTEXT_URL = 'https://docs.commercetools.com/apis/rest/tools/documentation-search';


// Parse command line arguments
const { values } = parseArgs({
  options: {
    query: { type: 'string' },
    limit: { type: 'string', default: '3' },
    'app-name': { type: 'string' },
    model: { type: 'string' },
    'skill-name': { type: 'string' },
    'content-types': { type: 'string' },
  },
});

// Validate required parameters
const missingParams = [];
if (!values.query) missingParams.push('--query');
if (!values['app-name']) missingParams.push('--app-name');
if (!values.model) missingParams.push('--model');
if (!values['skill-name']) missingParams.push('--skill-name');

if (missingParams.length > 0) {
  console.error(`Error: Missing required parameters: ${missingParams.join(', ')}`);
  console.error('Usage: node scripts/docs-search.mjs --query "search" --app-name "app" --model "model" --skill-name "skill"');
  process.exit(1);
}

const normalizedLimit = Math.min(parseInt(values.limit, 10), 20)

// Build request body
const requestBody = {
  query: values.query,
  limit: normalizedLimit,
  products: ['Composable Commerce', 'Checkout', 'Connect', 'InStore', 'AI Hub']
};

// Add optional content types filter
if (values['content-types']) {
  requestBody.contentTypes = values['content-types'].split(',').map(t => t.trim());
}

const requestData = JSON.stringify(requestBody);

async function main() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(CONTEXT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestData),
        'User-Agent': `${values['app-name']}/1.0 (${values.model})`,
        'X-Model': values.model,
        'X-Client-Type': values['app-name'],
        'X-Skill-Name': values['skill-name'],
      },
      body: requestData,
      signal: controller.signal,
    });

    if (res.status !== 200) {
      process.exit(0);
    }

    let response;
    try {
      response = await res.json();
    } catch (err) {
      process.exit(0);
    }

    if (response.error) {
      process.exit(0);
    }

    // Format results for AI agent consumption
    if (response.result && Array.isArray(response.result)) {
      const results = response.result;

      if (results.length === 0) {
        process.stdout.write('No results found. Try broadening your search query or adjusting filters.\n');
        process.exit(0);
      }

      // Write results in markdown format
      process.stdout.write(`# Documentation Search Results\n\n`);
      process.stdout.write(`Query: "${values.query}"\n`);
      process.stdout.write(`Found ${results.length} result(s)\n\n`);
      process.stdout.write('---\n\n');

      results.forEach((item, index) => {
        process.stdout.write(`## Result ${index + 1}\n\n`);

        if (item.metadata) {
          if (item.metadata.title) {
            process.stdout.write(`**Title:** ${item.metadata.title}\n\n`);
          }
          if (item.metadata.url) {
            const url = item.metadata.url.split('#')[0];
            process.stdout.write(`**URL:** ${url}\n\n`);
          }
          if (item.metadata.contentType) {
            process.stdout.write(`**Type:** ${item.metadata.contentType}\n\n`);
          }
        }

        if (item.content) {
          process.stdout.write(`**Content:**\n\n${item.content}\n\n`);
        }

        process.stdout.write('---\n\n');
      });
    } else {
      // Fallback: output raw response
      process.stdout.write(JSON.stringify(response, null, 2));
      process.stdout.write('\n');
    }
  } catch (err) {
    process.exit(0);
  } finally {
    clearTimeout(timeoutId);
  }
}

main();
