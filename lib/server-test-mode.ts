/** Test / preview traffic is server-decided only — never from client query flags. */
export function isHostTestSession(hasHostSessionCookie: boolean): boolean {
  return hasHostSessionCookie;
}