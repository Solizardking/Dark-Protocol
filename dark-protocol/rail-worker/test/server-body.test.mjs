import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  JsonBodyTooLargeError,
  readJsonBody,
} from '../src/server-body.mjs';

function requestStream(headers = {}) {
  const req = new PassThrough();
  req.headers = headers;
  return req;
}

test('readJsonBody parses valid JSON payloads', async () => {
  const req = requestStream();
  const promise = readJsonBody(req);
  req.end(JSON.stringify({ ok: true, nested: { value: 1 } }));

  await assert.doesNotReject(async () => {
    const body = await promise;
    assert.deepEqual(body, { ok: true, nested: { value: 1 } });
  });
});

test('readJsonBody returns an empty object for an empty body', async () => {
  const req = requestStream();
  const promise = readJsonBody(req);
  req.end('');

  assert.deepEqual(await promise, {});
});

test('readJsonBody rejects invalid JSON payloads', async () => {
  const req = requestStream();
  const promise = readJsonBody(req);
  req.end('{invalid');

  await assert.rejects(promise, SyntaxError);
});

test('readJsonBody rejects oversized requests from content-length', async () => {
  const req = requestStream({ 'content-length': String(DEFAULT_MAX_JSON_BODY_BYTES + 1) });
  const promise = readJsonBody(req);
  req.end('{}');

  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof JsonBodyTooLargeError);
    assert.equal(error.statusCode, 413);
    return true;
  });
});

test('readJsonBody rejects oversized streamed bodies', async () => {
  const req = requestStream();
  const promise = readJsonBody(req, { maxBytes: 8 });
  req.write('{"tool":');
  req.end('"too-large"}');

  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof JsonBodyTooLargeError);
    assert.equal(error.statusCode, 413);
    assert.equal(error.maxBytes, 8);
    return true;
  });
});
