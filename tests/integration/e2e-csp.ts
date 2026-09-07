/** Scheme-only CSP sources grant every websocket origin; explicit hosts do not. */
export function hasBroadWebSocketCspSource(csp: string): boolean {
  return csp.split(/[;,\t\n\r\f ]+/).some((source) => /^wss?:$/i.test(source));
}
