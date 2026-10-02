/**
 * BUG-06: thrown from a paid-generation callback when the provider answered but our own
 * validation rejected the output. settlePaidGeneration returns a terminal failure WITHOUT debiting
 * and without consuming the idempotency key, so the user is not charged and can retry with the same key.
 */
export class GenerationRejectedError extends Error {
  readonly userMessage: string;
  readonly reason: string;

  constructor(userMessage: string, reason: string) {
    super(`generation_rejected:${reason}`);
    this.name = 'GenerationRejectedError';
    this.userMessage = userMessage;
    this.reason = reason;
  }
}
