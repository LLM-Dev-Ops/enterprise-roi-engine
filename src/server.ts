/**
 * HTTP Server for Enterprise ROI Engine
 * Exposes /v1/roi endpoint for Cloud Run deployment
 */

import http from 'http';
import { executeROIEngine, EngineConfig, ExecutionOptions } from './index';

const PORT = parseInt(process.env['PORT'] || '8080', 10);

interface ROIRequest {
  config: EngineConfig;
  options?: ExecutionOptions;
}

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJSON(res: http.ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // Health check endpoint
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    sendJSON(res, 200, { status: 'healthy', service: 'agentics-roi' });
    return;
  }

  // ROI endpoint
  if (req.method === 'POST' && req.url === '/v1/roi') {
    try {
      const body = await parseBody(req);
      const request: ROIRequest = JSON.parse(body);

      if (!request.config) {
        sendJSON(res, 400, { error: 'Missing required field: config' });
        return;
      }

      const result = await executeROIEngine(request.config, request.options);
      sendJSON(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendJSON(res, 500, { error: message });
    }
    return;
  }

  // 404 for all other routes
  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`ROI Engine server listening on port ${PORT}`);
});
