import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { App } from 'aws-cdk-lib';

export type ValidationViolation = {
  readonly ruleName: string;
  readonly description: string;
  readonly severity: string;
  readonly violatingConstructs: readonly { readonly constructPath: string }[];
};

type ValidationReport = {
  readonly pluginReports: readonly {
    readonly violations: readonly ValidationViolation[];
  }[];
};

// CDK's validation rules run inside app.synth() and write their findings to the
// assembly's report file, not to construct metadata, so Annotations cannot see them.
export function readValidationViolations(app: App): ValidationViolation[] {
  const reportPath = join(app.synth().directory, 'validation-report.json');
  const report: ValidationReport = JSON.parse(readFileSync(reportPath, 'utf8'));
  return report.pluginReports.flatMap(
    (pluginReport) => pluginReport.violations,
  );
}
