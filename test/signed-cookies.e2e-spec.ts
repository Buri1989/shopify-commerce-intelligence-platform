import {
  Controller,
  Get,
  type INestApplication,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './create-test-app.js';

const COOKIE_NAME = 'probe';
const COOKIE_VALUE = 'signed-value';

@Controller('test-signed-cookie')
class SignedCookieController {
  @Get('write')
  write(@Res({ passthrough: true }) response: Response): void {
    response.cookie(COOKIE_NAME, COOKIE_VALUE, { signed: true });
  }

  @Get('read')
  read(@Req() incoming: Request): { value: unknown } {
    return { value: incoming.signedCookies[COOKIE_NAME] };
  }
}

describe('signed cookies (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp([SignedCookieController]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('reads back the value of a cookie the app signed', async () => {
    const browser = request.agent(app.getHttpServer());
    await browser.get('/test-signed-cookie/write').expect(200);

    await browser
      .get('/test-signed-cookie/read')
      .expect(200)
      .expect({ value: COOKIE_VALUE });
  });

  it('refuses a signed cookie whose value was changed', async () => {
    const written = await request(app.getHttpServer())
      .get('/test-signed-cookie/write')
      .expect(200);
    const [signedCookie] = written.get('Set-Cookie') ?? [];
    const [nameAndValue] = signedCookie.split(';');

    await request(app.getHttpServer())
      .get('/test-signed-cookie/read')
      .set('Cookie', nameAndValue.replace(COOKIE_VALUE, 'changed-value'))
      .expect(200)
      .expect({ value: false });
  });
});
