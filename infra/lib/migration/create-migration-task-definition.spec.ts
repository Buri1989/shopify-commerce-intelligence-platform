import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeAppStack } from '../../test/synthesize-app-stack.js';
import { synthesizeMigrationStack } from '../../test/synthesize-migration-stack.js';
import {
  findOnlyResourceId,
  findPolicyStatementsOfRole,
  matchStackOutput,
  readResourceProperties,
  type ResourceProperties,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const devConfig = resolveStageConfig('dev');
const REGISTRY_STACK = 'commerce-intelligence-dev-registry';
const DATA_STACK = 'commerce-intelligence-dev-data';

describe('createMigrationTaskDefinition', () => {
  let template: Template;
  let taskDefinition: ResourceProperties;
  let container: ResourceProperties;

  beforeAll(() => {
    template = synthesizeMigrationStack(devConfig, 'abc123');
    taskDefinition = readResourceProperties(
      template,
      findOnlyResourceId(template, 'AWS::ECS::TaskDefinition'),
    );
    container = taskDefinition.ContainerDefinitions[0];
  });

  it("runs on Fargate at the app's size under the migration family", () => {
    expect(taskDefinition).toEqual(
      expect.objectContaining({
        Family: 'commerce-intelligence-dev-migration',
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

  it('runs the migration script once from the same image as the app, with no port', () => {
    expect(taskDefinition.ContainerDefinitions).toHaveLength(1);
    expect(container).toEqual(
      expect.objectContaining({
        Name: 'migration',
        Essential: true,
        Image: { 'Fn::Join': ['', expect.arrayContaining([':abc123'])] },
        Command: ['node', 'dist/database/migrate.js'],
      }),
    );
    expect(container.PortMappings).toBeUndefined();
  });

  it("carries the app's environment and secrets, word for word", () => {
    const appTemplate = synthesizeAppStack(devConfig, 'abc123');
    const appContainer = readResourceProperties(
      appTemplate,
      findOnlyResourceId(appTemplate, 'AWS::ECS::TaskDefinition'),
    ).ContainerDefinitions[0];

    expect(container.Environment).toEqual(appContainer.Environment);
    expect(container.Secrets).toEqual(appContainer.Secrets);
  });

  it('writes every log line to the migration log group before going on', () => {
    expect(container.LogConfiguration).toEqual({
      LogDriver: 'awslogs',
      Options: {
        'awslogs-group': {
          Ref: findOnlyResourceId(template, 'AWS::Logs::LogGroup'),
        },
        'awslogs-stream-prefix': 'migration',
        'awslogs-region': 'eu-north-1',
        mode: 'blocking',
      },
    });
  });

  it('lets the execution role pull the image, write this log group and read the database secret', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      Roles: [{ Ref: taskDefinition.ExecutionRoleArn['Fn::GetAtt'][0] }],
      PolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: Match.arrayWith(['ecr:BatchGetImage']),
            Resource: matchStackOutput(REGISTRY_STACK, 'Repository'),
          }),
          Match.objectLike({ Action: 'ecr:GetAuthorizationToken' }),
          Match.objectLike({
            Action: ['logs:CreateLogStream', 'logs:PutLogEvents'],
            Resource: {
              'Fn::GetAtt': [
                findOnlyResourceId(template, 'AWS::Logs::LogGroup'),
                'Arn',
              ],
            },
          }),
          Match.objectLike({
            Action: Match.arrayWith(['secretsmanager:GetSecretValue']),
            Resource: matchStackOutput(DATA_STACK, 'DatabaseAdminSecret'),
          }),
        ],
      },
    });
  });

  it('gives the task role nothing', () => {
    expect(
      findPolicyStatementsOfRole(
        template,
        taskDefinition.TaskRoleArn['Fn::GetAtt'][0],
      ),
    ).toEqual([]);
  });
});
