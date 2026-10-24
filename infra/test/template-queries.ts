import { Match, type Matcher, type Template } from 'aws-cdk-lib/assertions';

export type ResourceProperties = Record<string, any>;

type RuleDirection = 'Ingress' | 'Egress';

export function findOnlyResourceId(
  template: Template,
  resourceType: string,
): string {
  const logicalIds = Object.keys(template.findResources(resourceType));
  if (logicalIds.length !== 1) {
    throw new Error(
      `Expected exactly one ${resourceType}, found ${logicalIds.length}`,
    );
  }
  return logicalIds[0];
}

export function readResourceProperties(
  template: Template,
  logicalId: string,
): ResourceProperties {
  return template.toJSON().Resources[logicalId].Properties;
}

export function readResourceTypes(template: Template): string[] {
  const resources: Record<string, { Type: string }> =
    template.toJSON().Resources;
  const types = Object.values(resources).map((resource) => resource.Type);
  return [...new Set(types)].sort();
}

export function findSubnetIdsOfTier(
  template: Template,
  tier: string,
): string[] {
  return Object.keys(
    template.findResources('AWS::EC2::Subnet', {
      Properties: {
        Tags: Match.arrayWith([{ Key: 'aws-cdk:subnet-type', Value: tier }]),
      },
    }),
  );
}

export function findRouteTableIdsOfTier(
  template: Template,
  tier: string,
): string[] {
  return findSubnetIdsOfTier(template, tier).map((subnetId) =>
    findRouteTableIdOfSubnet(template, subnetId),
  );
}

export function findDefaultRoutes(
  template: Template,
  routeTableId: string,
): ResourceProperties[] {
  const routes = template.findResources('AWS::EC2::Route', {
    Properties: {
      RouteTableId: { Ref: routeTableId },
      DestinationCidrBlock: '0.0.0.0/0',
    },
  });
  return Object.values(routes).map((route) => route.Properties);
}

export function securityGroupIdAttribute(
  template: Template,
  constructId: string,
): object {
  return {
    'Fn::GetAtt': [findSecurityGroupId(template, constructId), 'GroupId'],
  };
}

export function findInboundRules(
  template: Template,
  constructId: string,
): ResourceProperties[] {
  return findRules(template, constructId, 'Ingress');
}

export function findOutboundRules(
  template: Template,
  constructId: string,
): ResourceProperties[] {
  return findRules(template, constructId, 'Egress');
}

export function findPolicyStatementsOfRole(
  template: Template,
  roleId: string,
): ResourceProperties[] {
  const policies = template.findResources('AWS::IAM::Policy', {
    Properties: { Roles: [{ Ref: roleId }] },
  });
  return Object.values(policies).flatMap(
    (policy) => policy.Properties.PolicyDocument.Statement,
  );
}

export function findRoleId(template: Template, roleName: string): string {
  const logicalIds = Object.keys(
    template.findResources('AWS::IAM::Role', {
      Properties: { RoleName: roleName },
    }),
  );
  if (logicalIds.length !== 1) {
    throw new Error(
      `Expected exactly one role named ${roleName}, found ${logicalIds.length}`,
    );
  }
  return logicalIds[0];
}

// The app stack reads the other stacks through CDK's weak references; this
// matches one such reference by the producing stack and part of the output name.
export function matchStackOutput(
  stackName: string,
  outputNamePattern: string,
): Matcher {
  return Match.objectLike({
    'Fn::GetStackOutput': Match.objectLike({
      StackName: stackName,
      OutputName: Match.stringLikeRegexp(outputNamePattern),
    }),
  });
}

function findRouteTableIdOfSubnet(
  template: Template,
  subnetId: string,
): string {
  const [association] = Object.values(
    template.findResources('AWS::EC2::SubnetRouteTableAssociation', {
      Properties: { SubnetId: { Ref: subnetId } },
    }),
  );
  return association.Properties.RouteTableId.Ref;
}

function findSecurityGroupId(template: Template, constructId: string): string {
  const logicalId = Object.keys(
    template.findResources('AWS::EC2::SecurityGroup'),
  ).find((id) => id.startsWith(constructId));
  if (logicalId === undefined) {
    throw new Error(
      `No security group was created with construct id ${constructId}`,
    );
  }
  return logicalId;
}

// CDK writes a rule inline on the group when its peer is an address range, and as a
// standalone resource when its peer is another group. Callers get one list.
function findRules(
  template: Template,
  constructId: string,
  direction: RuleDirection,
): ResourceProperties[] {
  const groupId = findSecurityGroupId(template, constructId);
  const inline =
    readResourceProperties(template, groupId)[`SecurityGroup${direction}`] ??
    [];
  const standalone = Object.values(
    template.findResources(`AWS::EC2::SecurityGroup${direction}`, {
      Properties: { GroupId: { 'Fn::GetAtt': [groupId, 'GroupId'] } },
    }),
  ).map((rule) => rule.Properties);
  return [...inline, ...standalone];
}
