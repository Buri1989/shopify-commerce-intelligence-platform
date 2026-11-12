import { createHmac, timingSafeEqual } from 'node:crypto';

type SingleValueParameters = Record<string, string>;

export function verifyShopifyHmac(
  query: Record<string, unknown>,
  clientSecret: string,
): boolean {
  const { hmac, ...signedParameters } = query;
  if (typeof hmac !== 'string' || !isSingleValueParameters(signedParameters)) {
    return false;
  }
  const received = Buffer.from(hmac);
  const expected = Buffer.from(
    createShopifyHmac(signedParameters, clientSecret),
  );
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

function isSingleValueParameters(
  parameters: Record<string, unknown>,
): parameters is SingleValueParameters {
  return Object.values(parameters).every((value) => typeof value === 'string');
}

function createShopifyHmac(
  parameters: SingleValueParameters,
  clientSecret: string,
): string {
  const message = Object.keys(parameters)
    .sort()
    .map((key) => `${key}=${parameters[key]}`)
    .join('&');
  return createHmac('sha256', clientSecret).update(message).digest('hex');
}
