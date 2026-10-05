export class SourceRevisionError extends Error {
  constructor() {
    super('The source file changed. Reloading its current revision is required.');
    this.name = 'SourceRevisionError';
  }
}
