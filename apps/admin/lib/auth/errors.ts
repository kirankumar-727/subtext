export class AdminAccessError extends Error {
  constructor(
    readonly kind: "unauthenticated" | "unauthorized",
    options?: ErrorOptions,
  ) {
    super(kind === "unauthenticated" ? "Authentication required" : "Access denied", options);
    this.name = "AdminAccessError";
  }
}
