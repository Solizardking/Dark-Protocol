export const DEFAULT_MAX_JSON_BODY_BYTES = 256 * 1024;

export class JsonBodyTooLargeError extends Error {
  constructor(maxBytes = DEFAULT_MAX_JSON_BODY_BYTES) {
    super(`request body exceeds ${maxBytes} bytes`);
    this.name = 'JsonBodyTooLargeError';
    this.maxBytes = maxBytes;
    this.statusCode = 413;
  }
}

export function readJsonBody(req, { maxBytes = DEFAULT_MAX_JSON_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number.parseInt(String(req.headers?.['content-length'] ?? ''), 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      req.resume();
      reject(new JsonBodyTooLargeError(maxBytes));
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    let settled = false;

    function cleanup() {
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
    }

    function fail(error) {
      if (settled) return;
      settled = true;
      cleanup();
      req.resume();
      reject(error);
    }

    function onData(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        fail(new JsonBodyTooLargeError(maxBytes));
        return;
      }
      chunks.push(buffer);
    }

    function onEnd() {
      if (settled) return;
      settled = true;
      cleanup();

      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    }

    function onError(error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}
