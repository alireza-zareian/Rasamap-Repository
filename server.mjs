// The production server (`npm run demo`, `npm start`): `next start` plus two
// things.
//
// A route sees headers, not the socket, and Next fills X-Forwarded-For from the
// socket only when the client sent none — so without a proxy a caller chose its
// own address. This writes the real peer into `x-rasamap-peer`, replacing any
// value a client sent, for lib/auth/client-ip.ts. Behind a proxy
// (TRUSTED_PROXY_COUNT ≥ 1) the peer is the proxy and the header is ignored.

import { createServer } from "node:http";
import next from "next";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
// Unset: every interface, for a phone on the demo Wi-Fi. Behind nginx it must
// be 127.0.0.1 (deploy/rasamap.service), or a client could skip the proxy.
// Not HOSTNAME, which shells set to the machine name.
const hostname = process.env.BIND_ADDRESS || undefined;
const app = next({ dev: false });
const handle = app.getRequestHandler();

await app.prepare();

const server = createServer((req, res) => {
  req.headers["x-rasamap-peer"] = req.socket.remoteAddress ?? "";
  handle(req, res);
}).listen(port, hostname, () => {
  console.log(`> Rasamap ready on http://${hostname ?? "localhost"}:${port}${hostname ? "" : " (and this machine's LAN address)"}`);
});

// The second: on a stop (a deploy, Ctrl+C) take no new connections, let the
// requests in flight finish, then exit — at most ten seconds later.
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    // A kept-alive connection that goes idle later would hold close() open.
    setInterval(() => server.closeIdleConnections(), 100).unref();
    server.closeIdleConnections();
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
