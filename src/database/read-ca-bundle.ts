import { readFileSync } from 'node:fs';

export function readCaBundle(path: string): string {
  return readFileSync(path, 'utf8');
}
