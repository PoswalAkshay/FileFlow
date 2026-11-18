const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { pipeline } = require("stream");
const { promisify } = require("util");

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const pipelineAsync = promisify(pipeline);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function safeFileName(fileName) {
  let decodedName = String(fileName || "unnamed-file");
  try {
    decodedName = decodeURIComponent(decodedName);
  } catch {
    decodedName = String(fileName || "unnamed-file");
  }
  const cleanName = path.basename(decodedName);
  return cleanName.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "unnamed-file";
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function contentType(filePath) {
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
  };
  return types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function getFiles() {
  return fs.readdirSync(UPLOAD_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(UPLOAD_DIR, entry.name);
      const stats = fs.statSync(filePath);
      return {
        name: entry.name,
        size: stats.size,
        receivedAt: stats.mtime.toISOString(),
        downloadUrl: `/download/${encodeURIComponent(entry.name)}`,
      };
    })
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((address) => address && address.family === "IPv4" && !address.internal)
    .map((address) => `http://${address.address}:${PORT}`);
}

async function receiveUpload(request, response) {
  const fileName = safeFileName(request.headers["x-file-name"]);
  const destination = path.join(UPLOAD_DIR, fileName);

  try {
    if (fs.existsSync(destination)) {
      sendJson(response, 409, { message: "A file with that name already exists." });
      request.resume();
      return;
    }
    await pipelineAsync(request, fs.createWriteStream(destination, { flags: "w" }));
    const stats = fs.statSync(destination);
    sendJson(response, 201, {
      message: "File received successfully.",
      file: { name: fileName, size: stats.size },
    });
  } catch (error) {
    if (fs.existsSync(destination)) fs.unlinkSync(destination);
    console.error("Upload failed:", error.message);
    sendJson(response, 500, { message: "The file could not be received." });
  }
}

function serveStatic(request, response) {
  const requestedPath = request.url === "/" ? "/index.html" : request.url;
  const decodedPath = decodeURIComponent(requestedPath.split("?")[0]);
  const filePath = path.resolve(PUBLIC_DIR, `.${decodedPath}`);

  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && requestUrl.pathname === "/api/files") {
    sendJson(response, 200, { files: getFiles() });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/network") {
    sendJson(response, 200, { addresses: getLanAddresses() });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/upload") {
    receiveUpload(request, response);
    return;
  }

  if (request.method === "DELETE" && requestUrl.pathname.startsWith("/api/files/")) {
    const fileName = safeFileName(decodeURIComponent(requestUrl.pathname.slice("/api/files/".length)));
    const filePath = path.join(UPLOAD_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      sendJson(response, 404, { message: "File not found." });
      return;
    }
    try {
      fs.unlinkSync(filePath);
      sendJson(response, 200, { message: "File deleted successfully." });
    } catch (error) {
      console.error("Delete failed:", error.message);
      sendJson(response, 500, { message: "The file could not be deleted." });
    }
    return;
  }

  if (request.method === "GET" && requestUrl.pathname.startsWith("/download/")) {
    const fileName = safeFileName(decodeURIComponent(requestUrl.pathname.slice("/download/".length)));
    const filePath = path.join(UPLOAD_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end("File not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
    });
    fs.createReadStream(filePath).pipe(response);
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  sendJson(response, 405, { message: "Method not allowed." });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`File Transfer UI is running at http://localhost:${PORT}`);
  for (const address of getLanAddresses()) console.log(`Open on another device: ${address}`);
  console.log(`Received files are stored in ${UPLOAD_DIR}`);
});