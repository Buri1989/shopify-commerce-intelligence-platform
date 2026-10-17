import { STATUS_CODES } from 'node:http';

export function reasonPhrase(statusCode: number): string {
  return STATUS_CODES[statusCode] ?? 'Error';
}
