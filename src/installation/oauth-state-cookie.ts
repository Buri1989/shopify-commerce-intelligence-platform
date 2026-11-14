import type { CookieOptions, Request, Response } from 'express';

const COOKIE_NAME = 'oauth_state';
const TEN_MINUTES_IN_MILLISECONDS = 10 * 60 * 1000;
const COOKIE_ATTRIBUTES: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/installation',
};

export function writeOauthStateCookie(response: Response, state: string): void {
  response.cookie(COOKIE_NAME, state, {
    ...COOKIE_ATTRIBUTES,
    signed: true,
    maxAge: TEN_MINUTES_IN_MILLISECONDS,
  });
}

export function readOauthStateCookie(request: Request): string | undefined {
  const state: unknown = request.signedCookies[COOKIE_NAME];
  return typeof state === 'string' ? state : undefined;
}

export function deleteOauthStateCookie(response: Response): void {
  response.clearCookie(COOKIE_NAME, COOKIE_ATTRIBUTES);
}
