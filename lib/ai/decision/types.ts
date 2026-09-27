/**
 * Project-owned decision contract. Jev selects from bounded candidates; it does
 * not generate text and intentionally shares no contract with ProviderClient.
 */

export type DecisionProvider = 'jev';

/** Identifies the decision stage for logs, metrics, and evaluation. */
export type DecisionType = 'task' | 'category' | 'folder' | 'template';

export interface DecisionCandidate {
  /** Opaque key only; never place a database ID here. */
  key: string;
  /** Human-readable description sent to Jev as the choice criterion for this key. */
  label: string;
  [field: string]: unknown;
}

export interface DecisionRequest {
  decisionType: DecisionType;
  /** UUID generated with crypto.randomUUID(); the only logged request identifier. */
  requestId: string;
  /** The Jev "choice" question instructions — what the model should decide. */
  instructions: string;
  state: Record<string, unknown>;
  candidates: DecisionCandidate[];
}

export interface DecisionResult {
  /** Always one of request.candidates keys; the adapter enforces membership. */
  key: string;
  confidence: number;
  probabilities: Record<string, number>;
  latencyMs: number;
  modelVersion: string;
}

export interface DecisionClient {
  readonly provider: DecisionProvider;
  /** Throws only a sanitized DecisionCallError, never a raw fetch/JSON/Zod error. */
  decide(request: DecisionRequest): Promise<DecisionResult>;
}

export type DecisionErrorKind = 'rate_limited' | 'unavailable' | 'config' | 'invalid_response';

export interface SanitizedDecisionError {
  provider: DecisionProvider;
  status: number | null;
  kind: DecisionErrorKind;
  /** Allowlist: missing config, timeout, HTTP status, malformed JSON/schema, or unknown candidate key. */
  providerErrorCode: string | null;
}
