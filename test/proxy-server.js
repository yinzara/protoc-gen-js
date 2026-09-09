// Minimal HTTP CONNECT proxy used by the CI "test-proxy" job. It records every
// tunnelled host to the file named by PROXY_LOG so the test can assert that the
// download in post-install.js really went through a proxy (rather than silently
// connecting direct). Not part of the published package.
const net = require("net");
const http = require("http");
const fs = require("fs");

const PORT = Number(process.env.PROXY_PORT || 8899);
const LOG = process.env.PROXY_LOG || "proxy.log";

const server = http.createServer((req, res) => {
  res.writeHead(405);
  res.end("this proxy only supports CONNECT\n");
});

server.on("connect", (req, clientSocket, head) => {
  fs.appendFileSync(LOG, `CONNECT ${req.url}\n`);
  const [host, port] = req.url.split(":");
  const upstream = net.connect(Number(port) || 443, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`CONNECT proxy listening on 127.0.0.1:${PORT}, logging to ${LOG}`);
});
