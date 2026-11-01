import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

// Both roles of a task are assumed by the ECS tasks service; what differs is
// who uses the credentials: ECS itself to start the task, or the code once it runs.
export function createEcsTaskRole(
  scope: Construct,
  id: string,
  description: string,
): iam.Role {
  return new iam.Role(scope, id, {
    assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    description,
  });
}
