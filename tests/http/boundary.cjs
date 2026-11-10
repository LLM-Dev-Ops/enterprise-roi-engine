const { spawn } = require('node:child_process');
const http = require('node:http');
const { once } = require('node:events');
const path = require('node:path');

// The same immutable probes run against both revisions. No external service is called.
async function evaluate(root) {
  const reserve = http.createServer();
  reserve.listen(0, '127.0.0.1');
  await once(reserve, 'listening');
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const child = spawn(process.execPath, [path.join(root, 'dist/server.js')], {
    cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore'
  });
  const request = (method, url, body, headers = {}, chunked = false) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url,
      headers: { ...headers, ...(chunked ? { 'transfer-encoding': 'chunked' } : body === undefined ? {} : { 'content-length': Buffer.byteLength(body) }) } }, res => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('probe_timeout')));
    req.on('error', reject);
    req.end(body);
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { await request('GET', '/health'); ready = true; break; }
      catch { await new Promise(r => setTimeout(r, 50)); }
    }
    if (!ready) throw new Error('server_not_ready');
    const json = { 'content-type': 'application/json' };
    const wrongType = await request('POST', '/v1/roi', '{}', { 'content-type': 'text/plain' });
    const huge = JSON.stringify({ padding: 'x'.repeat(1_048_576) });
    const declared = await request('POST', '/v1/roi', huge, json);
    const streamed = await request('POST', '/v1/roi', huge, json, true);
    const scalar = await request('POST', '/v1/roi', 'null', json);
    const array = await request('POST', '/v1/roi', '[]', json);
    const correlation = await request('POST', '/v1/roi', '{', { ...json, 'x-correlation-id': '<script>untrusted</script>' });
    const health = await request('GET', '/health');
    const missing = await request('GET', '/missing');
    const malformed = await request('POST', '/v1/roi', '{', json);
    return {
      holdout: [wrongType.status === 415, declared.status === 413, streamed.status === 413,
        scalar.status === 400, array.status === 400, !correlation.text.includes('<script>'),
        health.headers['x-content-type-options'] === 'nosniff'],
      anchors: [health.status === 200, missing.status === 404, malformed.status === 400],
      statuses: [wrongType.status, declared.status, streamed.status, scalar.status, array.status]
    };
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
}
module.exports = { evaluate };
if (require.main === module) {
  evaluate(path.resolve(process.argv[2] || '.')).then(result => {
    console.log(JSON.stringify(result));
    if (!process.argv.includes('--measure') && [...result.holdout, ...result.anchors].some(v => !v)) process.exitCode = 1;
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
