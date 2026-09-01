const assert = require('assert');

console.log('Running unit test: tests/unit/rateLimiter.test.js');

const { createRateLimiter } = require('../../src/middleware/rateLimiter');

function fakeReq(ip) {
  return { ip };
}

function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function run() {
  // --- Scenario 1: under the limit -> always calls next() -------------
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });

  for (let i = 0; i < 3; i += 1) {
    let nextCalled = false;
    limiter(fakeReq('1.2.3.4'), fakeRes(), () => {
      nextCalled = true;
    });
    assert.strictEqual(nextCalled, true, `request ${i + 1} within the limit must be allowed`);
  }

  console.log('  ✓ requests within the limit are allowed through');

  // --- Scenario 2: exceeding the limit -> 429, next() not called -------
  let blockedNextCalled = false;
  const blockedRes = fakeRes();
  limiter(fakeReq('1.2.3.4'), blockedRes, () => {
    blockedNextCalled = true;
  });

  assert.strictEqual(blockedNextCalled, false, 'a request over the limit must not call next()');
  assert.strictEqual(blockedRes.statusCode, 429);
  assert.ok(blockedRes.body.error);
  assert.ok(blockedRes.headers['Retry-After']);

  console.log('  ✓ a request over the limit gets 429 with a Retry-After header, next() not called');

  // --- Scenario 3: different IPs are tracked independently ------------
  let otherIpNextCalled = false;
  limiter(fakeReq('9.9.9.9'), fakeRes(), () => {
    otherIpNextCalled = true;
  });
  assert.strictEqual(otherIpNextCalled, true, 'a different IP must have its own independent counter');

  console.log('  ✓ different IPs are rate-limited independently');

  // --- Scenario 4: window reset ----------------------------------------
  const shortLimiter = createRateLimiter({ windowMs: 10, max: 1 });
  let firstNextCalled = false;
  shortLimiter(fakeReq('5.5.5.5'), fakeRes(), () => {
    firstNextCalled = true;
  });
  assert.strictEqual(firstNextCalled, true);

  return new Promise((resolve) => {
    setTimeout(() => {
      let afterWindowNextCalled = false;
      shortLimiter(fakeReq('5.5.5.5'), fakeRes(), () => {
        afterWindowNextCalled = true;
      });
      assert.strictEqual(afterWindowNextCalled, true, 'a new window must reset the counter for the same IP');

      console.log('  ✓ counter resets once the window elapses');
      console.log('✅ Unit test passed: in-memory rate limiter verified.');
      resolve();
    }, 20);
  });
}

run().catch((err) => {
  console.error('❌ rateLimiter test failed:', err);
  process.exit(1);
});
