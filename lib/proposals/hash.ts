import { createHash } from 'node:crypto';

/**
 * SHA-256 hex over UTF-8 bytes. Matches SQL
 * encode(sha256(convert_to(text,'UTF8')),'hex'). Server-only; never shown in UI.
 * CRLF->LF normalization is done when saving a proposal, not here.
 */
export function hashContent(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
