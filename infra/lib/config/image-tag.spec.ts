import { App } from 'aws-cdk-lib';
import { resolveImageTag } from './image-tag.js';

describe('resolveImageTag', () => {
  it('returns the image tag passed as CDK context', () => {
    const app = new App({ context: { imageTag: 'abc123' } });

    expect(resolveImageTag(app.node)).toBe('abc123');
  });

  it('refuses to synthesize without a tag and says how to pass one', () => {
    const app = new App();

    expect(() => resolveImageTag(app.node)).toThrow(
      "Missing context value 'imageTag'. Deploy with: cdk deploy -c imageTag=<git sha>",
    );
  });

  it('treats an empty tag as missing', () => {
    const app = new App({ context: { imageTag: '' } });

    expect(() => resolveImageTag(app.node)).toThrow(
      "Missing context value 'imageTag'. Deploy with: cdk deploy -c imageTag=<git sha>",
    );
  });
});
