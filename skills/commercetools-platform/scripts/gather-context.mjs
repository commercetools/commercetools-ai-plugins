#!/usr/bin/env node

/**
 * Gather context for the agent
 *
 * Gathers relevant commercetools documentation as grounding context for the agent, with instrumentation headers.
 * Results are written to stdout for consumption by AI agents.
 * 
 * Usage:
 *   node scripts/gather-context.mjs --query "how to create payment" --client-name <name> --model <model> --skill-name <skill> [options]
 * 
 * Required:
 *   --query <string>          Search query
 *   --client-name <string>    Client identifier (e.g., vscode-copilot, claude-desktop)
 *   --model <string>          Model name (e.g., claude-sonnet-4.5, gpt-4)
 *   --skill-name <string>     Skill identifier (e.g., commercetools-checkout)
 * 
 * Optional:
 *   --limit <number>          Number of results (default: 3)
 *   --content-types <string>  Comma-separated content types
 */

import https from 'https';
import { parseArgs } from 'util';

const CONTEXT_URL = 'https://docs.commercetools.com/apis/rest/tools/documentation-search';

// Parse command line arguments
const { values } = parseArgs({
  options: {
    query: { type: 'string' },
    limit: { type: 'string', default: '3' },
    'client-name': { type: 'string' },
    model: { type: 'string' },
    'skill-name': { type: 'string' },
    'content-types': { type: 'string' },
  },
});

// Validate required parameters
const missingParams = [];
if (!values.query) missingParams.push('--query');
if (!values['client-name']) missingParams.push('--client-name');
if (!values.model) missingParams.push('--model');
if (!values['skill-name']) missingParams.push('--skill-name');

if (missingParams.length > 0) {
  console.error(`Error: Missing required parameters: ${missingParams.join(', ')}`);
  console.error('Usage: node scripts/gather-context.mjs --query "search" --client-name "client" --model "model" --skill-name "skill"');
  process.exit(1);
}

// Build request body
const requestBody = {
  query: values.query,
  limit: parseInt(values.limit, 10),
};

// Add optional content types filter
if (values['content-types']) {
  requestBody.contentTypes = values['content-types'].split(',').map(t => t.trim());
}

const requestData = JSON.stringify(requestBody);

// Parse URL
const url = new URL(CONTEXT_URL);

// Build request options
const options = {
  hostname: url.hostname,
  port: url.port,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestData),
    'User-Agent': `${values['client-name']}/1.0 (${values.model})`,
    'X-Model': values.model,
    'X-Client-Type': values['client-name'],
    'X-Skill-Name': values['skill-name'],
  },
};

// Use http or https based on URL protocol
const protocol = url.protocol === 'https:' ? https : http;

// Make the request
const req = protocol.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode !== 200) {
      process.exit(0);
    }

    try {
      const response = JSON.parse(data);
      
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
    }
  });
});

req.on('error', (err) => {
  process.exit(0);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(0);
});

// Set timeout (60 seconds)
req.setTimeout(60000);

// Send request
req.write(requestData);
req.end();
