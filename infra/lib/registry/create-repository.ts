import { RemovalPolicy } from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';

export function createRepository(
  scope: Construct,
  stage: string,
): ecr.Repository {
  return new ecr.Repository(scope, 'Repository', {
    repositoryName: `${PROJECT_NAME}-${stage}`,
    // A SHA tag must always mean the same bytes.
    imageTagMutability: ecr.TagMutability.IMMUTABLE,
    imageScanOnPush: true,
    lifecycleRules: [
      {
        maxImageCount: RETAINED_IMAGE_COUNT,
        description: `Keep the last ${RETAINED_IMAGE_COUNT} images`,
      },
    ],
    // Images outlive the stack: an infrastructure mistake must never delete them.
    removalPolicy: RemovalPolicy.RETAIN,
  });
}

// Enough rollback targets while storage stays at cents.
const RETAINED_IMAGE_COUNT = 20;
