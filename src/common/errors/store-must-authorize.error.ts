export class StoreMustAuthorizeError extends Error {
  constructor(storeId: number) {
    super(`Store ${storeId} must authorize the app again.`);
    this.name = 'StoreMustAuthorizeError';
  }
}
