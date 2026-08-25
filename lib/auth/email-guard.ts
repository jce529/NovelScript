export interface OAuthUserLike {
  email: string | null | undefined;
}

/** D-02: never let a user proceed without an email on file. Kakao specifically may
 * return no email until its app is Biz-App-approved (see 01-RESEARCH.md Pitfall 1). */
export function needsEmailCompletion(user: OAuthUserLike): boolean {
  return !user.email || user.email.trim() === '';
}
