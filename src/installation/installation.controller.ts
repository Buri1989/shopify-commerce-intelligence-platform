import {
  Controller,
  Get,
  type HttpRedirectResponse,
  HttpStatus,
  Query,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { InstallationService } from './installation.service.js';
import {
  deleteOauthStateCookie,
  readOauthStateCookie,
  writeOauthStateCookie,
} from './oauth-state-cookie.js';

@Controller('installation')
export class InstallationController {
  constructor(private readonly installationService: InstallationService) {}

  @Get('start')
  @Redirect()
  startStoreInstallation(
    @Query('shop') shop: unknown,
    @Res({ passthrough: true }) response: Response,
  ): HttpRedirectResponse {
    const { state, authorizeUrl } =
      this.installationService.startStoreInstallation(shop);
    writeOauthStateCookie(response, state);
    return { url: authorizeUrl, statusCode: HttpStatus.FOUND };
  }

  @Get('callback')
  async installStore(
    @Query() query: Record<string, unknown>,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const cookieState = readOauthStateCookie(request);
    deleteOauthStateCookie(response);
    const { shopDomain } = await this.installationService.installStore(
      query,
      cookieState,
    );
    response.type('text/plain');
    return `Commerce Intelligence is installed on ${shopDomain}. You can close this page.`;
  }
}
