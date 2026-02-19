#!/usr/bin/env bun
/**
 * CLI Signal Logger - Log explicit learning signals to the observability server.
 *
 * Usage:
 *   bun scripts/observability/log-signal.ts --type <signal_type> --context '<json>' [--tags tag1,tag2] [--note 'text']
 *
 * Examples:
 *   bun scripts/observability/log-signal.ts --type test_failure --context '{"test": "auth.test.ts", "error": "timeout"}' --tags flaky
 *   bun scripts/observability/log-signal.ts --type correction --context '{"original": "v1", "fixed": "v2"}'
 */

import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const USAGE = `Usage:
  bun scripts/observability/log-signal.ts --type <signal_type> --context '<json>' [--tags tag1,tag2] [--note 'text']

Options:
  --type      Signal type (required) e.g. test_failure, correction, insight
  --context   JSON string with signal context (default: '{}')
  --tags      Comma-separated tags e.g. flaky,auth,critical
  --note      Free-text note describing the signal
  --help      Show this help message

Examples:
  bun scripts/observability/log-signal.ts --type test_failure --context '{"test": "auth.test.ts", "error": "timeout"}' --tags flaky
  bun scripts/observability/log-signal.ts --type correction --context '{"original": "v1", "fixed": "v2"}' --note 'Fixed wrong API endpoint'`;

try {
  const { values } = parseArgs({
    options: {
      type: { type: 'string', short: 't' },
      context: { type: 'string', short: 'c', default: '{}' },
      tags: { type: 'string' },
      note: { type: 'string', short: 'n' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    process.exit(0);
  }

  if (!values.type) {
    console.error('Error: --type is required');
    console.error(USAGE);
    process.exit(0); // Always exit 0 to never block Claude
  }

  // Read config from observability.json
  let serverUrl = 'http://localhost:4000';
  let sourceApp = '';

  const configPath = resolve('.claude/observability.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.server_url) serverUrl = config.server_url;
      if (config.source_app) sourceApp = config.source_app;
    } catch {
      // Config parse failure is non-fatal
    }
  }

  // Environment variables override config file
  if (process.env.CLAUDE_SOURCE_APP) sourceApp = process.env.CLAUDE_SOURCE_APP;
  const sessionId = process.env.CLAUDE_SESSION_ID || '';

  // Parse context JSON
  let contextObj: Record<string, unknown> = {};
  try {
    contextObj = JSON.parse(values.context || '{}');
  } catch {
    console.error('Warning: --context is not valid JSON, wrapping as { raw: ... }');
    contextObj = { raw: values.context };
  }

  // Parse tags
  const tags = values.tags ? values.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  // Build signal body
  const signalBody: Record<string, unknown> = {
    type: values.type,
    context: contextObj,
    source_app: sourceApp,
    session_id: sessionId,
    tags,
    timestamp: Date.now(),
  };

  if (values.note) {
    signalBody.note = values.note;
  }

  // POST to server
  const response = await fetch(`${serverUrl}/signals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signalBody),
  });

  if (response.ok) {
    const result = await response.json();
    console.log(JSON.stringify(result));
  } else {
    console.error(`Server returned ${response.status}: ${await response.text()}`);
  }
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
}

// Always exit 0 - never block Claude operations
process.exit(0);
