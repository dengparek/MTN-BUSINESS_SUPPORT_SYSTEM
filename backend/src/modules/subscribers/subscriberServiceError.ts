export class SubscriberServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SubscriberServiceError";
  }
}
