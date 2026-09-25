// The production server `npm run demo` runs: `next start`, plus one header.
//
// A route handler cannot see the TCP connection, only headers, and the one
// Next fills from the socket (X-Forwarded-For) it fills only when the client
// did not send one — so without a proxy in front, a caller chose its own
// address and walked around every per-address limit. This server writes the
// real peer address into `x-rasamap-peer` on every request, replacing anything
// a client sent under that name, and lib/auth/client-ip.ts reads it when no
// proxy is configured. Nothing else differs from `next start`: the same
// request handler, the same build, the same port and interfaces.
//
// Behind a real proxy (TRUSTED_PROXY_COUNT ≥ 1) the peer is the proxy itself,
// so the header is ignored there and X-Forwarded-For is read as before.

import { createServer } from "node:http";
import next from "next";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const app = next({ dev: false });
const handle = app.getRequestHandler();

await app.prepare();

createServer((req, res) => {
  req.headers["x-rasamap-peer"] = req.socket.remoteAddress ?? "";
  handle(req, res);
}).listen(port, () => {
  // Every interface, like `next start`: the demo is opened from a phone at
  // http://<lan-ip>:3000 (AGENTS.md rule 9).
  console.log(`> Rasamap ready on http://localhost:${port} (and this machine's LAN address)`);
});
