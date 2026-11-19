import http from 'node:http';
import {
  createSettlementConfig,
  createWorkerState,
  getRailSettlement,
  listRailSettlements,
  processAgentRailPlan,
  processRailPreflight,
  processRailRequest,
  responseBody,
} from './worker.mjs';
import {
  allowedOriginsFromEnv,
  corsHeadersForOrigin,
  truthyEnv,
} from './server-config.mjs';
import { readJsonBody } from './server-body.mjs';

const state = createWorkerState({ env: process.env });
const port = Number.parseInt(process.env.RAIL_WORKER_PORT ?? '4020', 10);
const settlementConfig = createSettlementConfig(process.env);
const allowedCorsOrigins = allowedOriginsFromEnv(process.env.RAIL_WORKER_CORS_ORIGIN);
const settlementListEnabled = truthyEnv(process.env.RAIL_WORKER_ENABLE_SETTLEMENT_LIST);

function jsonHeaders(origin, extra = {}) {
  const corsHeaders = corsHeadersForOrigin(origin, allowedCorsOrigins);
  return {
    'content-type': 'application/json',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    'access-control-expose-headers': 'PAYMENT-REQUIRED,PAYMENT-SIGNATURE',
    ...(corsHeaders ?? {}),
    ...extra,
  };
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
  const requestOrigin = req.headers.origin;

  if (req.method === 'OPTIONS') {
    const corsHeaders = corsHeadersForOrigin(requestOrigin, allowedCorsOrigins);
    if (requestOrigin && corsHeaders === null) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'origin not allowed' }));
      return;
    }

    res.writeHead(204, jsonHeaders(requestOrigin));
    res.end();
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    res.writeHead(200, jsonHeaders(requestOrigin));
    res.end(JSON.stringify({ ok: true, service: 'zolana-dark-rail-worker' }));
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/rail/preflight') {
    const result = await processRailPreflight({
      env: process.env,
      state,
      settlementConfig,
      probe: ['1', 'true', 'yes'].includes((requestUrl.searchParams.get('probe') ?? '').toLowerCase()),
    });
    res.writeHead(result.status, jsonHeaders(requestOrigin));
    res.end(responseBody(result));
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/agent/rail-plan') {
    try {
      const body = await readJsonBody(req);
      const result = await processAgentRailPlan(body, { env: process.env });
      res.writeHead(result.status, jsonHeaders(requestOrigin));
      res.end(responseBody(result));
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : error instanceof SyntaxError ? 400 : 500;
      res.writeHead(status, jsonHeaders(requestOrigin));
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/rail/settlements') {
    if (!settlementListEnabled) {
      res.writeHead(404, jsonHeaders(requestOrigin));
      res.end(JSON.stringify({ ok: false, error: 'settlement listing is disabled' }));
      return;
    }

    const limit = Number.parseInt(requestUrl.searchParams.get('limit') ?? '50', 10);
    res.writeHead(200, jsonHeaders(requestOrigin));
    res.end(JSON.stringify({
      ok: true,
      settlements: listRailSettlements(state, Number.isFinite(limit) ? limit : 50),
    }, null, 2));
    return;
  }

  const settlementMatch = requestUrl.pathname.match(/^\/rail\/settlements\/([^/]+)$/);
  if (req.method === 'GET' && settlementMatch) {
    const authorizationId = decodeURIComponent(settlementMatch[1]);
    const settlement = getRailSettlement(state, authorizationId);
    if (!settlement) {
      res.writeHead(404, jsonHeaders(requestOrigin));
      res.end(JSON.stringify({ ok: false, error: 'settlement not found' }));
      return;
    }

    res.writeHead(200, jsonHeaders(requestOrigin));
    res.end(JSON.stringify({ ok: true, settlement }, null, 2));
    return;
  }

  if (req.method !== 'POST' || requestUrl.pathname !== '/rail/authorize') {
    res.writeHead(404, jsonHeaders(requestOrigin));
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const result = await processRailRequest(body, state, { settlementConfig });
    res.writeHead(result.status, jsonHeaders(requestOrigin, result.headers ?? {}));
    res.end(responseBody(result));
  } catch (error) {
    const status = Number.isInteger(error?.statusCode) ? error.statusCode : error instanceof SyntaxError ? 400 : 500;
    res.writeHead(status, jsonHeaders(requestOrigin));
    res.end(JSON.stringify({ ok: false, error: error.message }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`ZOLana dark rail worker listening on http://127.0.0.1:${port}`);
});
