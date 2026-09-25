// The production server `npm run demo` runs: `next start`, plus one header.
//
// A route handler cannot see the TCP connection, only headers, and the one
// Next fills from the socket (X-Forwarded-For) it fills only when the client
// did not send one — so without a proxy in front, a caller chose its own
// address and walked around every per-address limit. This server writes the
// real peer address into `x-rasamap-peer` on every request, replacing anything
// a client sent under that name, and lib/auth/client-ip.ts reads it when no
// proxy is configured. Nothing else differs from `next start`: the same
// request handler, the same build, the same port, and every interface unless
// BIND_ADDRESS says otherwise.
//
// Behind a real proxy (TRUSTED_PROXY_COUNT ≥ 1) the peer is the proxy itself,
// so the header is ignored there and X-Forwarded-For is read as before.

import { createServer } from "node:http";
import next from "next";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
// Unset: every interface, which the demo needs (a phone on the Wi-Fi). Behind
// nginx it must be 127.0.0.1 (deploy/rasamap.service sets it): reachable on a
// public interface, port 3000 would let a client skip the proxy and name its
// own X-Forwarded-For.
// Not HOSTNAME: shells and containers set that one to the machine name.
const hostname = process.env.BIND_ADDRESS || undefined;
const app = next({ dev: false });
const handle = app.getRequestHandler();

await app.prepare();

createServer((req, res) => {
  req.headers["x-rasamap-peer"] = req.socket.remoteAddress ?? "";
  handle(req, res);
}).listen(port, hostname, () => {
  console.log(`> Rasamap ready on http://${hostname ?? "localhost"}:${port}${hostname ? "" : " (and this machine's LAN address)"}`);
});
