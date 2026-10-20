import type { Node } from 'constructs';

// The tag changes on every deploy, so it is a deploy argument, never stage
// configuration (design §4.2).
const CONTEXT_KEY = 'imageTag';

export function resolveImageTag(node: Node): string {
  const imageTag: unknown = node.tryGetContext(CONTEXT_KEY);
  if (typeof imageTag !== 'string' || imageTag.length === 0) {
    throw new Error(
      `Missing context value '${CONTEXT_KEY}'. Deploy with: cdk deploy -c ${CONTEXT_KEY}=<git sha>`,
    );
  }
  return imageTag;
}
