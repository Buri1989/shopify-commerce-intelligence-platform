export class StoreMustAuthorizeError extends Error {
  constructor(storeId: number, reason?: string) {
    const instruction = `Store ${storeId} must authorize the app again.`;
    super(reason === undefined ? instruction : `${instruction} ${reason}`);
    this.name = 'StoreMustAuthorizeError';
  }
}
