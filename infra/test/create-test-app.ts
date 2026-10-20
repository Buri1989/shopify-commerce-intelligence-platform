import { readFileSync } from 'node:fs';
import { App } from 'aws-cdk-lib';

// The CLI hands `cdk synth` the feature flags from cdk.json; a bare App has none.
// Tests get the same flags so the templates they assert on are the deployed ones.
export function createTestApp(): App {
  return new App({ context: readCdkJson().context });
}

function readCdkJson(): { context: Record<string, unknown> } {
  return JSON.parse(
    readFileSync(new URL('../cdk.json', import.meta.url), 'utf8'),
  );
}
