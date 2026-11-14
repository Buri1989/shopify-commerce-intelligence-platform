import { createHmac } from 'node:crypto';

export type CallbackParameters = Record<string, string>;

export function signAsShopify(message: string, clientSecret: string): string {
  return createHmac('sha256', clientSecret).update(message).digest('hex');
}

export function signShopifyCallback(
  parameters: CallbackParameters,
  clientSecret: string,
): CallbackParameters {
  const message = Object.keys(parameters)
    .sort()
    .map((key) => `${key}=${parameters[key]}`)
    .join('&');
  return { ...parameters, hmac: signAsShopify(message, clientSecret) };
}
