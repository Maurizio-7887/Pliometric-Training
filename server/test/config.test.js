import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPublicApiUrl, positiveEnv } from '../src/config.js';
test('PUBLIC_API_URL requires HTTPS outside local development', () => { assert.equal(canonicalPublicApiUrl('https://api.example.test/', { nodeEnv: 'production' }), 'https://api.example.test'); assert.throws(() => canonicalPublicApiUrl('http://api.example.test', { nodeEnv: 'production' })); assert.throws(() => canonicalPublicApiUrl('', { nodeEnv: 'production' })); assert.equal(canonicalPublicApiUrl('http://localhost:3000/', { nodeEnv: 'development' }), 'http://localhost:3000'); });
test('pairing limits are positive', () => { assert.equal(positiveEnv('5', 1, 'X'), 5); assert.throws(() => positiveEnv('0', 1, 'X')); });
