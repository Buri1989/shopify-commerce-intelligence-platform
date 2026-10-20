import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeAppStack } from '../../test/synthesize-app-stack.js';
import {
  findOnlyResourceId,
  findPolicyStatementsOfRole,
  readResourceProperties,
  type ResourceProperties,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createTaskDefinition', () => {
  let template: Template;
  let taskDefinition: ResourceProperties;

  beforeAll(() => {
    template = synthesizeAppStack(resolveStageConfig('dev'), 'abc123');
    taskDefinition = readResourceProperties(
      template,
      findOnlyResourceId(template, 'AWS::ECS::TaskDefinition'),
    );
  });

  it('runs on Fargate at the configured size, on ARM Linux', () => {
    expect(taskDefinition).toEqual(
      expect.objectContaining({
        RequiresCompatibilities: ['FARGATE'],
        NetworkMode: 'awsvpc',
        Cpu: '256',
        Memory: '512',
        RuntimePlatform: {
          CpuArchitecture: 'ARM64',
          OperatingSystemFamily: 'LINUX',
        },
      }),
    );
  });

  it('runs one container from the repository image at the given tag', () => {
    expect(taskDefinition.ContainerDefinitions).toHaveLength(1);
    expect(taskDefinition.ContainerDefinitions[0]).toEqual(
      expect.objectContaining({
        Name: 'app',
        Essential: true,
        Image: { 'Fn::Join': ['', expect.arrayContaining([':abc123'])] },
        PortMappings: [{ ContainerPort: 3000, Protocol: 'tcp' }],
      }),
    );
  });

  it('passes the three validated environment variables and nothing else', () => {
    expect(taskDefinition.ContainerDefinitions[0].Environment).toEqual([
      { Name: 'NODE_ENV', Value: 'production' },
      { Name: 'PORT', Value: '3000' },
      { Name: 'LOG_LEVEL', Value: 'info' },
    ]);
  });

  it('ships logs to the app log group without ever blocking the app', () => {
    expect(taskDefinition.ContainerDefinitions[0].LogConfiguration).toEqual({
      LogDriver: 'awslogs',
      Options: {
        'awslogs-group': {
          Ref: findOnlyResourceId(template, 'AWS::Logs::LogGroup'),
        },
        'awslogs-stream-prefix': 'app',
        'awslogs-region': 'eu-north-1',
        mode: 'non-blocking',
        'max-buffer-size': '26214400b',
      },
    });
  });

  it('lets the execution role pull only this image and write only this log group', () => {
    const executionRoleId = taskDefinition.ExecutionRoleArn['Fn::GetAtt'][0];
    expect(findPolicyStatementsOfRole(template, executionRoleId)).toEqual([
      {
        Action: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:BatchGetImage',
          'ecr:GetDownloadUrlForLayer',
        ],
        Effect: 'Allow',
        Resource: {
          'Fn::GetStackOutput': expect.objectContaining({
            StackName: 'commerce-intelligence-dev-registry',
          }),
        },
      },
      { Action: 'ecr:GetAuthorizationToken', Effect: 'Allow', Resource: '*' },
      {
        Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        Effect: 'Allow',
        Resource: {
          'Fn::GetAtt': [
            findOnlyResourceId(template, 'AWS::Logs::LogGroup'),
            'Arn',
          ],
        },
      },
    ]);
  });

  it('gives the task role no permissions yet, separate from the execution role', () => {
    const taskRoleId = taskDefinition.TaskRoleArn['Fn::GetAtt'][0];
    expect(taskRoleId).not.toBe(
      taskDefinition.ExecutionRoleArn['Fn::GetAtt'][0],
    );
    expect(findPolicyStatementsOfRole(template, taskRoleId)).toEqual([]);
    template.allResourcesProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
          }),
        ],
      },
    });
  });
});
