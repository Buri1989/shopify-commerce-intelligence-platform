import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeRegistryStack } from '../../test/synthesize-registry-stack.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createRepository', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeRegistryStack(resolveStageConfig('dev'));
  });

  it('creates one repository named after the stage', () => {
    template.resourceCountIs('AWS::ECR::Repository', 1);
    template.hasResourceProperties('AWS::ECR::Repository', {
      RepositoryName: 'commerce-intelligence-dev',
    });
  });

  it('never lets a pushed tag be overwritten', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      ImageTagMutability: 'IMMUTABLE',
    });
  });

  it('scans every pushed image', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      ImageScanningConfiguration: { ScanOnPush: true },
    });
  });

  it('expires everything but the last 20 images', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      LifecyclePolicy: {
        LifecyclePolicyText: Match.serializedJson({
          rules: [
            Match.objectLike({
              selection: Match.objectLike({
                tagStatus: 'any',
                countType: 'imageCountMoreThan',
                countNumber: 20,
              }),
              action: { type: 'expire' },
            }),
          ],
        }),
      },
    });
  });

  it('keeps the images when the stack is deleted', () => {
    template.hasResource('AWS::ECR::Repository', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });
});
