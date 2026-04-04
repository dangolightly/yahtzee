const http = require("http");
const fs = require("fs");
const path = require("path");

const DEFAULT_PORT = Number(process.env.PORT || 4173);
const root = __dirname;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function handleRequest(request, response) {
  const requestPath = request.url === "/" ? "/index.html" : request.url;
  const normalizedPath = path.normalize(requestPath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(root, normalizedPath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    response.end(data);
  });
}

function startServer(port) {
  const server = http.createServer(handleRequest);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      startServer(port + 1);
      return;
    }

    throw error;
  });

  server.listen(port, () => {
    console.log(`Yahtzee Cabin running at http://localhost:${port}`);
  });
}

startServer(DEFAULT_PORT);
