import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CORS_ORIGINS,
  allowedOriginsFromEnv,
  corsHeadersForOrigin,
  truthyEnv,
} from '../src/server-config.mjs';

test('allowedOriginsFromEnv defaults to local wallet origins', () => {
  assert.deepEqual(allowedOriginsFromEnv(undefined), DEFAULT_CORS_ORIGINS);
  assert.deepEqual(allowedOriginsFromEnv(''), DEFAULT_CORS_ORIGINS);
});

test('allowedOriginsFromEnv parses comma-separated allowlists', () => {
  assert.deepEqual(
    allowedOriginsFromEnv('https://wallet.example, http://127.0.0.1:5173'),
    ['https://wallet.example', 'http://127.0.0.1:5173'],
  );
});

test('corsHeadersForOrigin reflects only allowed origins', () => {
  assert.deepEqual(
    corsHeadersForOrigin('http://127.0.0.1:5173', ['http://127.0.0.1:5173']),
    {
      'access-control-allow-origin': 'http://127.0.0.1:5173',
      vary: 'Origin',
    },
  );
  assert.equal(corsHeadersForOrigin('https://evil.example', ['http://127.0.0.1:5173']), null);
  assert.deepEqual(corsHeadersForOrigin(undefined, ['http://127.0.0.1:5173']), {});
});

test('corsHeadersForOrigin preserves explicit wildcard opt-in', () => {
  assert.deepEqual(
    corsHeadersForOrigin('https://any.example', ['*']),
    {
      'access-control-allow-origin': '*',
    },
  );
});

test('truthyEnv accepts common positive values', () => {
  assert.equal(truthyEnv('1'), true);
  assert.equal(truthyEnv('true'), true);
  assert.equal(truthyEnv('yes'), true);
  assert.equal(truthyEnv('on'), true);
  assert.equal(truthyEnv('0'), false);
  assert.equal(truthyEnv(undefined), false);
});
