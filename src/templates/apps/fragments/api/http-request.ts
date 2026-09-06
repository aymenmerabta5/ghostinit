/** Normalize framework Request proxies before oRPC reconstructs streamed bodies. */
export const standardApiRequestCode = `function toStandardApiRequest(request: Request): Request {
  const body = request.body;
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  };
  // Node requires duplex for stream bodies. Keep the original stream unconsumed.
  if (body !== null) init.duplex = "half";
  return new Request(request.url, init);
}
`;
