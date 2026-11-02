export class RowNotFoundError extends Error {
  constructor() {
    super('Row not found');
    this.name = 'RowNotFoundError';
  }
}
