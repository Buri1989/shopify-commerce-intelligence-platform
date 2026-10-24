// The account stays a Ref: no account number anywhere in the templates.
export function matchBootstrapRoleArn(kind: string): object {
  return {
    'Fn::Join': [
      '',
      [
        'arn:aws:iam::',
        { Ref: 'AWS::AccountId' },
        `:role/cdk-hnb659fds-${kind}-role-`,
        { Ref: 'AWS::AccountId' },
        '-eu-north-1',
      ],
    ],
  };
}
