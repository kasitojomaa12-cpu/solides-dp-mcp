import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";

const AUTH = process.env.SOLIDES_TOKEN || "";
const BASE = "https://employer.tangerino.com.br";
const PUNCH = "https://api.tangerino.com.br/api/punch";
const REPORT = "https://api.tangerino.com.br/api/report";
const PORT = process.env.PORT || 3000;

async function api(base, path, method = "GET", body = null) {
  const opts = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(base + path, opts);
  if (!r.ok) throw new Error("API " + r.status + ": " + (await r.text()).substring(0, 300));
  return r.json();
}

const server = new McpServer({ name: "Solides DP", version: "1.0.0" });

server.tool("solides_testar_conexao", "Testa conexao com a API Solides DP", {}, async () => {
  const d = await api(BASE, "/test");
  return { content: [{ type: "text", text: JSON.stringify(d) }] };
});

server.tool("solides_listar_colaboradores", "Lista colaboradores (paginado)", {
  page: z.number().default(0), size: z.number().default(50)
}, async ({ page, size }) => {
  const d = await api(BASE, "/employee/find-all?page=" + page + "&size=" + size);
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
});

server.tool("solides_buscar_colaborador", "Busca colaborador por ID ou externalId", {
  id: z.string().optional(), externalId: z.string().optional()
}, async ({ id, externalId }) => {
  const p = id ? "id=" + id : "externalId=" + externalId;
  const d = await api(BASE, "/employee/find?" + p);
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
});

server.tool("solides_listar_cargos", "Lista cargos cadastrados", {
  page: z.number().default(0), size: z.number().default(50)
}, async ({ page, size }) => {
  const d = await api(BASE, "/job-role/find-all?page=" + page + "&size=" + size);
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
});

server.tool("solides_listar_locais", "Lista locais de trabalho (filiais)", {
  page: z.number().default(0), size: z.number().default(50)
}, async ({ page, size }) => {
  const d = await api(BASE, "/workplace/find-all?page=" + page + "&size=" + size);
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
});

server.tool("solides_listar_escalas", "Lista escalas de trabalho", {
  page: z.number().default(0), size: z.number().default(50)
}, async ({ page, size }) => {
  const d = await api(BASE, "/work-schedule?page=" + page + "&size=" + size);
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
});

server.tool("solides_consultar_pontos", "Consulta registros de ponto", {
  startDate: z.string().optional(), endDate: z.string().optional(),
  employeeId: z.string().optional(), page: z.number().default(0), size: z.number().default(50)
}, async ({ startDate, endDate, employeeId, page, size }) => {
  let p = "/?page=" + page + "&size=" + size;
  if (startDate) p += "&startDate=" + startDate;
  if (endDate) p += "&endDate=" + endDate;
  if (employeeId) p += "&employeeId=" + employeeId;
  const d = await api(PUNCH, p);
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
});

server.tool("solides_listar_motivos_ajuste", "Lista motivos de ajuste (ferias, abono, etc)", {}, async () => {
  const d = await api(BASE, "/adjustment-reason/find-all");
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
});

server.tool("solides_lancar_ajuste", "Lanca ajuste de ponto para colaborador", {
  adjustmentReasonId: z.number(), employeeId: z.number(),
  startDate: z.number(), endDate: z.number(),
  status: z.enum(["APROVADO", "PENDENTE", "REPROVADO"]).default("PENDENTE")
}, async ({ adjustmentReasonId, employeeId, startDate, endDate, status }) => {
  const body = {
    adjustmentReasonDTO: { id: adjustmentReasonId },
    employeeDTO: { id: employeeId },
    startDate, endDate, fullDay: true, origem: "Claude AI", status
  };
  const d = await api(BASE, "/adjustment/register", "POST", body);
  return { content: [{ type: "text", text: JSON.stringify(d, null, 2) }] };
});

server.tool("solides_emitir_folha_ponto", "Emite folha de ponto (PDF)", {
  employeeId: z.number(), startDate: z.string(), endDate: z.string()
}, async ({ employeeId, startDate, endDate }) => {
  const d = await api(REPORT, "/time-sheet?employeeId=" + employeeId + "&startDate=" + startDate + "&endDate=" + endDate);
  return { content: [{ type: "text", text: JSON.stringify({ fileName: d.fileName, fileExtension: d.fileExtension, base64Length: d.base64FileContent?.length || 0 }) }] };
});

const app = express();
const transports = {};

app.get("/health", (_, res) => res.json({ status: "Solides DP MCP Server online" }));

app.get("/sse", async (req, res) => {
  const t = new SSEServerTransport("/messages", res);
  transports[t.sessionId] = t;
  res.on("close", () => delete transports[t.sessionId]);
  await server.connect(t);
});

app.post("/messages", async (req, res) => {
  const t = transports[req.query.sessionId];
  if (!t) return res.status(400).json({ error: "No session" });
  await t.handlePostMessage(req, res);
});

app.listen(PORT, () => console.log("Solides DP MCP on port " + PORT));
