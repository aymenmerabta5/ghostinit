export function nextUpgradeDispatcherContent(): string {
  return `class ApplicationHttpServer extends Server {
  override emit(event: string, ...args: unknown[]): boolean {
    if (event === "upgrade") {
      const [request, socket, head] = args;
      if (request instanceof IncomingMessage && socket instanceof Duplex && Buffer.isBuffer(head)) {
        const onSocketError = () => { socket.destroy(); };
        socket.on("error", onSocketError);
        socket.once("close", () => socket.off("error", onSocketError));
        let pathname: string;
        try { pathname = new URL(request.url ?? "/", "http://localhost").pathname; }
        catch { socket.destroy(); return true; }
        if (pathname === "/api/ws") {
          // Dispatch before Next's asynchronous catch-all route listener can close this socket.
          void upgradeRequest(request, socket, head).catch(() => {
            if (!socket.destroyed) rejectUpgrade(socket, 500, "Internal Server Error");
          });
          return true;
        }
        if (process.env.NODE_ENV === "production") {
          rejectUpgrade(socket, 404, "Not Found");
          return true;
        }
      }
    }
    return super.emit(event, ...args);
  }
}
`;
}
