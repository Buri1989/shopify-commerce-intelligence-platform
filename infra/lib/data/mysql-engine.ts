import * as rds from 'aws-cdk-lib/aws-rds';

// The major version only: RDS applies 8.4 patch releases itself in the maintenance
// window, and CloudFormation prefix-matches '8.4' during drift detection (design
// §4.2). The library has no major-only constant, so the version is spelled out.
export const MYSQL_ENGINE = rds.DatabaseInstanceEngine.mysql({
  version: rds.MysqlEngineVersion.of('8.4', '8.4'),
});
