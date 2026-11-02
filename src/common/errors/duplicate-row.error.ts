export class DuplicateRowError extends Error {
  constructor() {
    super('A row with these values already exists');
    this.name = 'DuplicateRowError';
  }
}
