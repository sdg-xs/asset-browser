export class CatalogDomainError extends Error {
  constructor(
    public readonly code:
      | "REVISION_CONFLICT"
      | "NOT_FOUND"
      | "INVALID_COMMAND"
      | "PUBLICATION_INVALID",
    message: string,
    public readonly issues: string[] = [],
  ) {
    super(message);
    this.name = "CatalogDomainError";
  }
}
