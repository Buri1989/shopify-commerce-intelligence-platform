import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';

export function resolveClusterName(config: StageConfig): string {
  return `${PROJECT_NAME}-${config.stage}`;
}
