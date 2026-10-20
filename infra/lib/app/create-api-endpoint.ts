import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import type * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/stage-config.js';

// By id and name from the config, never a lookup: synth needs no credentials
// and the account id stays out of cdk.context.json (design §4.8).
export function importHostedZone(
  scope: Construct,
  config: StageConfig,
): route53.IHostedZone {
  return route53.HostedZone.fromHostedZoneAttributes(scope, 'HostedZone', {
    hostedZoneId: config.hostedZoneId,
    zoneName: config.hostedZoneName,
  });
}

// CloudFormation writes the validation record into the zone and waits for ACM
// to issue; no custom resource, no manual step.
export function createApiCertificate(
  scope: Construct,
  hostedZone: route53.IHostedZone,
  config: StageConfig,
): acm.Certificate {
  return new acm.Certificate(scope, 'ApiCertificate', {
    domainName: config.apiDomainName,
    validation: acm.CertificateValidation.fromDns(hostedZone),
  });
}

// The record lives and dies with the stack: without the balancer it would point
// at nothing.
export function createApiRecord(
  scope: Construct,
  hostedZone: route53.IHostedZone,
  loadBalancer: elbv2.ILoadBalancerV2,
  config: StageConfig,
): route53.ARecord {
  return new route53.ARecord(scope, 'ApiRecord', {
    zone: hostedZone,
    recordName: config.apiDomainName,
    target: route53.RecordTarget.fromAlias(
      new targets.LoadBalancerTarget(loadBalancer),
    ),
  });
}
