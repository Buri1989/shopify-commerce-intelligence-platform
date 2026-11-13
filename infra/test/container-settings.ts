import type { ResourceProperties } from './template-queries.js';

const APP_ONLY_SETTING_NAMES = [
  'SHOPIFY_CLIENT_ID',
  'SHOPIFY_CALLBACK_URL',
  'SHOPIFY_CLIENT_SECRET',
  'COOKIE_SECRET',
];

export function withoutAppOnlySettings(
  settings: ResourceProperties[],
): ResourceProperties[] {
  return settings.filter(
    (setting) => !APP_ONLY_SETTING_NAMES.includes(setting.Name),
  );
}
