import { resolveStageConfig } from '../config/stage-config.js';
import { resolveClusterName } from './cluster-name.js';

describe('resolveClusterName', () => {
  it('names the cluster after the project and the stage', () => {
    expect(resolveClusterName(resolveStageConfig('dev'))).toBe(
      'commerce-intelligence-dev',
    );
  });
});
