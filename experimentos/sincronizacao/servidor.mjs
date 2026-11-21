import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const port = 4173;
const origin = "http://127.0.0.1:" + port;
const db = new DatabaseSync(process.env.ATLAS_DEMO_DB || join(tmpdir(), "atlas-sync-demo.sqlite"));
db.exec(`
  CREATE TABLE IF NOT EXISTS estudos (
    seq INTEGER PRIMARY KEY,
    operacao TEXT NOT NULL UNIQUE,
    topico TEXT NOT NULL,
    dia TEXT NOT NULL,
    estudado INTEGER NOT NULL
  );
`);
const insert = db.prepare(
  "INSERT OR IGNORE INTO estudos (operacao, topico, dia, estudado) VALUES (?, ?, ?, ?)",
);
const changes = db.prepare("SELECT * FROM estudos WHERE seq > ? ORDER BY seq");

const files = new Map([
  ["/estilos.css", ["../../estilos.css", "text/css"]],
  ["/aplicativo.js", ["../../aplicativo.js", "text/javascript"]],
  ["/dados/conteudos.js", ["../../dados/conteudos.js", "text/javascript"]],
  ["/dados/vestibulares.js", ["../../dados/vestibulares.js", "text/javascript"]],
  ["/simbolo.svg", ["../../simbolo.svg", "image/svg+xml"]],
  ["/sync-demo.js", ["./sync-demo.js", "text/javascript"]],
]);

function validOperation(op) {
  return op && typeof op === "object"
    && typeof op.operation === "string" && /^[0-9a-f-]{36}$/.test(op.operation)
    && typeof op.id === "string" && /^[a-z0-9-]{1,160}$/.test(op.id)
    && typeof op.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(op.day)
    && typeof op.studied === "boolean";
}

async function readOperations(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 48_000) throw new Error("Requisição grande demais");
    chunks.push(chunk);
  }
  const operations = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!Array.isArray(operations) || operations.length > 100 || !operations.every(validOperation)) {
    throw new Error("Operações inválidas");
  }
  return operations;
}

createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.headers.host !== "127.0.0.1:" + port) {
    res.writeHead(403).end();
    return;
  }
  const url = new URL(req.url, origin);
  if (req.method === "POST" && url.pathname === "/api/sync") {
    if (req.headers.origin !== origin || req.headers["content-type"] !== "application/json") {
      res.writeHead(403).end();
      return;
    }
    try {
      const operations = await readOperations(req);
      const cursor = Number(url.searchParams.get("desde"));
      if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Cursor inválido");
      db.exec("BEGIN");
      try {
        for (const op of operations) insert.run(op.operation, op.id, op.day, Number(op.studied));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      const rows = changes.all(cursor).map(({ seq, topico, dia, estudado }) => ({
        seq, id: topico, day: dia, studied: Boolean(estudado),
      }));
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(rows));
    } catch {
      res.writeHead(400).end("Não foi possível sincronizar.");
    }
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    const page = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(
      page.replace('<script src="aplicativo.js">', '<script src="sync-demo.js"></script>\n<script src="aplicativo.js">'),
    );
    return;
  }
  const file = files.get(url.pathname);
  if (req.method === "GET" && file) {
    const [path, type] = file;
    res.writeHead(200, { "Content-Type": type + "; charset=utf-8" }).end(
      readFileSync(new URL(path, import.meta.url)),
    );
    return;
  }
  res.writeHead(404).end();
}).listen(port, "127.0.0.1", () => console.log("Prévia do Atlas: " + origin));
