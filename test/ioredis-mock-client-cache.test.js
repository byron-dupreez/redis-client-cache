'use strict';

// =====================================================================================================================
// SETTINGS to tweak for different integration testing scenarios
// =====================================================================================================================
const alwaysFailing = false;
const noLocalRedis = false;
// =====================================================================================================================

/**
 * Unit tests for redis-client-cache/redis-client-cache.js with an `ioredis-mock` adapter
 * @author Byron du Preez
 */
const test = require('tape');

// The test subject
const RedisClientCache = require('../redis-client-cache');

// The redis adapter to use with the redis client cache
const redisAdapter = require('rcc-ioredis-mock-adapter');
const ReplyError = redisAdapter.ReplyError;

const logging = require('logging-utils');
const LogLevel = logging.LogLevel;

const defaultHost = redisAdapter.defaultHost;
const defaultPort = redisAdapter.defaultPort;

// Set default host & port
const host0 = defaultHost;
const port0 = defaultPort;

// // Set first host & port
// const host1 = "your.host"; // can be default host (i.e. "127.0.0.1")
// const port1 = redisClientCache.DEFAULT_REDIS_PORT;
//
// // Set second host & port
// const host2 = "your.other.host"; // must be DIFFERENT host name to host1 (but can be "localhost")
// const port2 = redisClientCache.DEFAULT_REDIS_PORT;

// Set first host & port
const host1 = defaultHost;
const port1 = defaultPort;

// Set second, different host & port
const host2 = host1 !== 'localhost' ? 'localhost' : '127.0.0.1';
const port2 = 9999;

// Add an arbitrary Node-style test function to the redis adapter's clients for testing
function addTestFn() {
  redisAdapter.setClientFunction('testFn', function (err, reply, callback) {
    const [host, port] = this.resolveHostAndPort();
    reply = reply || 456;
    if (err && !redisAdapter.isMovedError(err)) {
      console.error(`Intentionally failing testFn for host (${host}) & port (${port}) with error (${err})`);
      if (callback) callback(err);
    } else {
      console.log(`Intentionally succeeding testFn for host (${host}) & port (${port}) with reply (${JSON.stringify(reply)})`);
      if (callback) callback(null, reply);
    }
  });
}

// Remove the arbitrary Node-style test function (and its installed asynchronous version) from the redis adapter's clients
function removeTestFn() {
  // Delete both
  redisAdapter.deleteClientFunction('testFnAsync');
  redisAdapter.deleteClientFunction('testFn');
}

function configureContext() {
  let context = logging.configureLogging({}, {logLevel: LogLevel.TRACE});
  context = RedisClientCache.configureRedisClientCache(context, redisAdapter);
  return context;
}

function cleanup(context) {
  // Clear out any cached clients
  clearCache(context.redisClientCache, context);

  // rcc.deleteAndDisconnectRedisClient(host0, port0, context);
  // rcc.deleteAndDisconnectRedisClient(host1, port1, context);
  // rcc.deleteAndDisconnectRedisClient(host2, port2, context);

  removeTestFn();
}

function clearCache(rcc, context) {
  rcc.clearCache(context)
    .then(r => console.log(`### clearCache results = ${JSON.stringify(r)}`))
    .catch(e => console.error(e));
}

// =====================================================================================================================
// Tests for promisifyClientFunction
// =====================================================================================================================

test('promisifyClientFunction - simulate success on installed testFnAsync', t => {
  const context = configureContext();
  const rcc = context.redisClientCache;

  cleanup(context);

  t.equal(rcc.redis, redisAdapter, `rcc.redis must be redis`);

  addTestFn();

  t.notOk(redisAdapter.getClientFunction('testFnAsync'), `redis.getClientFunction('testFnAsync') must not exist yet`);

  rcc.promisifyClientFunction('testFn', context);

  t.ok(typeof redisAdapter.getClientFunction('testFnAsync') === 'function', `redis.getClientFunction('testFnAsync') must be installed as a function`);

  const redisClient = rcc.setRedisClient({}, context);

  t.ok(typeof redisClient.getFunction('testFnAsync') === 'function', `redisClient.getFunction('testFnAsync') must be installed as a function`);
  t.ok(typeof redisClient.testFnAsync === 'function', `redisClient.testFnAsync must be installed as a function`);

  // Simulate success
  const expected = 123;
  redisClient.testFnAsync(null, expected)
    .then(reply => {
      t.equal(reply, expected, `reply must be ${expected}`);
      removeTestFn();
      t.end();
    })
    .catch(err => {
      removeTestFn();
      t.end(err);
    });
});

test('promisifyClientFunction - simulate an error on installed testFnAsync', t => {
  const context = configureContext();
  const rcc = context.redisClientCache;

  cleanup(context);

  t.equal(rcc.redis, redisAdapter, `rcc.redis must be redis`);

  addTestFn();

  t.notOk(redisAdapter.getClientFunction('testFnAsync'), `redis.getClientFunction('testFnAsync') must not exist yet`);

  rcc.promisifyClientFunction('testFn', context);

  t.ok(typeof redisAdapter.getClientFunction('testFnAsync') === 'function', `redis.getClientFunction('testFnAsync') must be installed as a function`);

  const redisClient = rcc.setRedisClient({}, context);

  t.ok(typeof redisClient.getFunction('testFnAsync') === 'function', `redisClient.getFunction('testFnAsync') must be installed as a function`);
  t.ok(typeof redisClient.testFnAsync === 'function', `redisClient.testFnAsync must be installed as a function`);

  // Simulate failure
  const error = new Error('Boom! ... Boom! ... Fizzle');
  redisClient.testFnAsync(error, null)
    .then(reply => {
      removeTestFn();
      t.end(`testFnAsync must NOT resolve with a reply (${JSON.stringify(reply)})`);
    })
    .catch(err => {
      t.equal(err, error, `error must be ${error}`);

      removeTestFn();
      t.end();
    });
});

test('promisifyClientFunction - simulate MOVED error on installed testFnAsync', t => {
  const context = configureContext();
  const rcc = context.redisClientCache;

  cleanup(context);

  t.equal(rcc.redis, redisAdapter, `rcc.redis must be redis`);

  addTestFn();

  t.notOk(redisAdapter.getClientFunction('testFnAsync'), `redis.getClientFunction('testFnAsync') must not exist yet`);

  rcc.promisifyClientFunction('testFn', context);

  t.ok(typeof redisAdapter.getClientFunction('testFnAsync') === 'function', `redis.getClientFunction('testFnAsync') must be installed as a function`);

  const redisClient = rcc.setRedisClient({}, context);

  // Simulate "Moved" error
  const movedError = new ReplyError("MOVED 14190 localhost:6379");
  movedError.code = 'MOVED';
  redisClient.testFnAsync(movedError, null)
    .then(reply2 => {
      t.equal(reply2, 456, `reply 2 must be ${456}`);
      removeTestFn();
      t.end();
    })
    .catch(err => {
      t.fail(`MOVED error must NOT reject with err (${err})`);
      removeTestFn();
      t.end(err);
    });
});

// =====================================================================================================================
// Tests for setRedisClient and getRedisClient
// =====================================================================================================================

test('setRedisClient and getRedisClient', t => {
  const context = configureContext();
  const rcc = context.redisClientCache;

  cleanup(context);

  t.notOk(rcc.getRedisClient(host0, port0), `getRedisClient(${host0}, ${port0}) RedisClient instance must not be cached yet`);
  t.notOk(rcc.getRedisClient(host1, port1), `getRedisClient(${host1}, ${port1}) RedisClient instance must not be cached yet`);

  // Cache new RedisClient for default host & port
  const options0 = {};
  const redisClient0 = rcc.setRedisClient(options0, context);

  t.ok(redisClient0, `setRedisClient(${JSON.stringify(options0)}) must return an instance`);
  let [h, p] = redisClient0.resolveHostAndPort();
  t.equal(h, host0, `redisClient 0 host must be ${host0}`);
  t.equal(p, port0, `redisClient 0 port must be ${port0}`);
  t.equal(redisClient0.getOptions().string_numbers, undefined, `redisClient 0 string_numbers (${redisClient0.getOptions().string_numbers}) must be undefined`);

  t.equal(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(${host0}, ${port0}) gets cached instance`);

  // Cache RedisClient for options with explicit host & port
  const options1 = {host: host1, port: port1}; //, string_numbers: true };
  const redisClient1 = rcc.setRedisClient(options1, context);

  t.ok(redisClient1, `setRedisClient(${JSON.stringify(options1)}) must return an instance`);
  [h, p] = redisClient1.resolveHostAndPort();
  t.equal(h, host1, `redisClient 1 host must be ${host1}`);
  t.equal(p, port1, `redisClient 1 port must be ${port1}`);
  t.equal(redisClient1.getOptions().string_numbers, undefined, `redisClient 1 string_numbers (${redisClient1.getOptions().string_numbers}) must be undefined`);
  if (host1 === host0 && port1 === port0) {
    t.equal(redisClient1, redisClient0, `setRedisClient(${JSON.stringify(options1)}) must re-use cached instance 0 with same options`);
  } else {
    t.notEqual(redisClient1, redisClient0, `setRedisClient(${JSON.stringify(options1)}) must NOT re-use cached instance 0 with default options`);
  }

  t.equal(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(${host0}, ${port0}) still gets cached instance 0`);
  t.equal(rcc.getRedisClient(host1, port1), redisClient1, `getRedisClient(${host1}, ${port1}) gets cached instance 1`);

  // Force replacement of cached instance when options differ
  const options2 = {host: host1, port: port1, string_numbers: true};
  const redisClient2 = rcc.setRedisClient(options2, context);

  // console.log(`### redisClient2 = ${Strings.stringify(redisClient2)}`);

  t.ok(redisClient2, `setRedisClient(${JSON.stringify(options2)}) must return an instance`);
  [h, p] = redisClient2.resolveHostAndPort();
  t.equal(h, host1, `redisClient 2 host must be ${host1}`);
  t.equal(p, port1, `redisClient 2 port must be ${port1}`);
  t.equal(redisClient2.getOptions().string_numbers, true, `redisClient 2 string_numbers (${redisClient2.getOptions().string_numbers}) must be true`);
  t.notEqual(redisClient2, redisClient0, `setRedisClient(${JSON.stringify(options2)}) must replace incompatible cached instance 0`);

  if (host1 === host0 && port1 === port0) {
    t.equal(redisClient1, redisClient0, `setRedisClient(${JSON.stringify(options1)}) must re-use cached instance 0 with same options`);
    t.notEqual(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(${host0}, ${port0}) must NOT get cached instance 0`);
    t.equal(rcc.getRedisClient(host0, port0), redisClient2, `getRedisClient(${host0}, ${port0}) must get cached instance 2`);
  } else {
    t.notEqual(redisClient1, redisClient0, `setRedisClient(${JSON.stringify(options1)}) must NOT get cached instance 0`);
    t.equal(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(${host0}, ${port0}) must still get cached instance 0`);
  }
  t.notEqual(rcc.getRedisClient(host1, port1), redisClient1, `getRedisClient(${host1}, ${port1}) must NOT get cached instance 1`);
  t.equal(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) gets cached instance 2`);

  // Re-use newly cached instance when options same, but diff sequence
  const options3 = {string_numbers: true, port: port1, host: host1};
  const redisClient3 = rcc.setRedisClient(options3, context);

  t.ok(redisClient3, `setRedisClient(${JSON.stringify(options3)}) must return an instance`);
  [h, p] = redisClient3.resolveHostAndPort();
  t.equal(h, host1, `redisClient 3 host must be ${host1}`);
  t.equal(p, port1, `redisClient 3 port must be ${port1}`);
  t.equal(redisClient3.getOptions().string_numbers, true, `redisClient 3 string_numbers (${redisClient3.getOptions().string_numbers}) must be true`);
  t.equal(redisClient3, redisClient2, `setRedisClient(${JSON.stringify(options3)}) must re-use cached instance 2 with re-ordered options`);

  if (host1 === host0 && port1 === port0) {
    t.equal(rcc.getRedisClient(host0, port0), redisClient2, `getRedisClient(${host0}, ${port0}) gets cached instance 0`);
  } else {
    t.equal(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(${host0}, ${port0}) gets cached instance 0`);
  }
  t.equal(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) gets cached instance 2`);


  // Change to using a different host & port, which will cache a new RedisClient instance under new host & port
  rcc.deleteAndDisconnectRedisClient(host2, port2, context); // make sure none before we start
  t.notOk(rcc.getRedisClient(host2, port2), `getRedisClient(${host2}, ${port2}) RedisClient instance must not be cached yet`);
  t.equal(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) still gets cached instance 2`);

  // Cache a new RedisClient instance for the different host & port
  const options4 = {host: host2, port: port2, string_numbers: false};
  const redisClient4 = rcc.setRedisClient(options4, context);

  t.ok(redisClient4, `setRedisClient(${JSON.stringify(options4)}) must return an instance`);
  [h, p] = redisClient4.resolveHostAndPort();
  t.equal(h, host2, `redisClient 4 host must be ${host2}`);
  t.equal(p, port2, `redisClient 4 port must be ${port2}`);
  t.equal(redisClient4.getOptions().string_numbers, false, `redisClient 4 string_numbers (${redisClient4.getOptions().string_numbers}) must be false`);
  t.notEqual(redisClient4, redisClient2, `setRedisClient(${JSON.stringify(options4)}) must NOT be cached instance 2 for host (${host1}) & port (${port1})`);

  t.equal(rcc.getRedisClient(host2, port2), redisClient4, `getRedisClient(${host2}, ${port2}) gets cached instance 4`);

  // Check cache for default host & port is still intact
  if (host1 === host0 && port1 === port0) {
    t.equal(rcc.getRedisClient(host0, port0), redisClient2, `getRedisClient(${host0}, ${port0}) must still get cached instance 2`);
  } else {
    t.equal(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(${host0}, ${port0}) must still get cached instance 0`);
  }
  t.equal(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) gets cached instance 2`);


  // Do NOT re-use new RedisClient instance for the different host if string_numbers is undefined instead of false
  const stringNumbers = undefined;
  const options5 = {host: host2, port: port2, string_numbers: stringNumbers};
  const redisClient5 = rcc.setRedisClient(options5, context);

  t.ok(redisClient5, `setRedisClient(${JSON.stringify(options5)}) must return an instance`);
  [h, p] = redisClient5.resolveHostAndPort();
  t.equal(h, host2, `redisClient 5 host must be ${host2}`);
  t.equal(p, port2, `redisClient 5 port must be ${port2}`);
  // t.equal(redisClient5.getOptions().string_numbers, undefined, `redisClient 5 string_numbers (${redisClient5.getOptions().string_numbers}) must be undefined`);
  t.equal(redisClient5.getOptions().string_numbers, undefined, `redisClient 5 string_numbers (${redisClient5.getOptions().string_numbers}) must be undefined`);
  t.notEqual(redisClient5, redisClient4, `setRedisClient(${JSON.stringify(options5)}) must NOT be cached instance 4 for host (${host2}) & port (${port2})`);

  // Check that getRedisClientAndReplaceIfClosing replaces client after disconnecting
  rcc.disconnectClient(redisClient5, context).catch(e => t.fail(`disconnectClient must NOT fail with error (${e})`));
  t.ok(redisClient5.isClosing(), `redisClient5 must be closing after disconnectClient`);
  const redisClient6 = rcc.getRedisClientAndReplaceIfClosing(host2, port2, context);
  t.ok(redisClient6, `redisClient6 must exist after getRedisClientAndReplaceIfClosing(${host2}, ${port2}, context)`);
  [h, p] = redisClient5.resolveHostAndPort();
  t.equal(h, host2, `redisClient 6 host must be ${host2}`);
  t.equal(p, port2, `redisClient 6 port must be ${port2}`);
  t.notEqual(redisClient6, redisClient5, `redisClient6 must NOT be redisClient5 after getRedisClientAndReplaceIfClosing(${host2}, ${port2}, context)`);

  // Delete cache for host 1 & port 1
  t.ok(rcc.deleteAndDisconnectRedisClient(host1, port1, context).deleted, `must delete cached instance for host (${host1}) & port (${port1})`); // clean up
  t.equal(rcc.getRedisClient(host1, port1), undefined, `getRedisClient(${host1}, ${port1}) gets undefined after delete`);

  // Delete cache for host 2 & port 2
  t.ok(rcc.deleteAndDisconnectRedisClient(host2, port2, context).deleted, `must delete cached instance for host (${host2} & port (${port2})`); // clean up
  t.equal(rcc.getRedisClient(host2, port2), undefined, `getRedisClient(${host2}, ${port2}) gets undefined after delete`);

  // Allow test to end by disconnecting each of the redis clients!
  clearCache(rcc, context);

  t.end();
});

// =====================================================================================================================
// Tests for setRedisClientAndReplaceIfUnusable and getRedisClient
// =====================================================================================================================

test('setRedisClientAndReplaceIfUnusable and getRedisClient', t => {
  const context = configureContext();
  const rcc = context.redisClientCache;

  cleanup(context);

  t.notOk(rcc.getRedisClient(host0, port0), `getRedisClient(${host0}, ${port0}) RedisClient instance must not be cached yet`);
  t.notOk(rcc.getRedisClient(host1, port1), `getRedisClient(${host1}, ${port1}) RedisClient instance must not be cached yet`);

  // Cache new RedisClient for default host & port
  const options0 = {};
  rcc.setRedisClientAndReplaceIfUnusable(options0, context)
    .then(redisClient0 => {

      t.ok(redisClient0, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options0)}) must return an instance`);
      let [h, p] = redisClient0.resolveHostAndPort();
      t.equal(h, host0, `redisClient 0 host must be ${host0}`);
      t.equal(p, port0, `redisClient 0 port must be ${port0}`);
      t.equal(redisClient0.getOptions().string_numbers, undefined, `redisClient 0 string_numbers (${redisClient0.getOptions().string_numbers}) must be undefined`);

      t.equal(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(${host0}, ${port0}) gets cached instance 0`);

      // Re-use cached RedisClient for options with explicit host & port same as defaults
      const options1 = {host: host1, port: port1}; //, string_numbers: true };
      rcc.setRedisClientAndReplaceIfUnusable(options1, context)
        .then(redisClient1 => {

          t.ok(redisClient1, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options1)}) must return an instance`);
          let [h, p] = redisClient1.resolveHostAndPort();
          t.equal(h, host1, `redisClient 1 host must be ${host1}`);
          t.equal(p, port1, `redisClient 1 port must be ${port1}`);
          t.equal(redisClient1.getOptions().string_numbers, undefined, `redisClient 1 string_numbers (${redisClient1.getOptions().string_numbers}) must be undefined`);
          // t.equal(redisClient1.getOptions().string_numbers, true, `redisClient 1 string_numbers (${redisClient1.getOptions().string_numbers}) must be true`);

          if (host1 === host0 && port1 === port0) {
            if (noLocalRedis) {
              t.notEqual(redisClient1, redisClient0, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options1)}) must NOT re-use cached instance 0 with same options due to failure replacement`);
            } else {
              t.equal(redisClient1, redisClient0, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options1)}) must re-use cached instance 0 with same options`);
            }
          } else {
            t.notEqual(redisClient1, redisClient0, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options1)}) must NOT re-use cached instance 0 with different options`);
          }

          t.equal(rcc.getRedisClient(host1, port1), redisClient1, `getRedisClient(${host1}, ${port1}) gets cached instance 1`);

          if (host1 === host0 && port1 === port0) {
            if (!noLocalRedis) {
              t.ok(rcc.getRedisClient(host0, port0) === redisClient0 || rcc.getRedisClient(host0, port0) === undefined, `getRedisClient(${host0}, ${port0}) must get EITHER undefined OR cached instance 0`);
              t.equal(rcc.getRedisClient(host1, port1), redisClient0, `getRedisClient(${host1}, ${port1}) must get cached instance 0`);
            } else {
              t.notEqual(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(${host0}, ${port0}) must NOT get cached instance 0 due to failure replacement`);
              t.notEqual(rcc.getRedisClient(host1, port1), redisClient0, `getRedisClient(${host1}, ${port1}) must NOT get cached instance 0 due to failure replacement`);
            }
          } else {
            if (!alwaysFailing) {
              t.ok(rcc.getRedisClient(host0, port0) === redisClient0 || rcc.getRedisClient(host0, port0) === undefined, `getRedisClient(${host0}, ${port0}) must get EITHER undefined OR cached instance 0`);
              // t.equal(rcc.getRedisClient(), redisClient0, `getRedisClient() must get cached instance 0 for default host (${host0}) & port (${port0})`);
            } else {
              t.ok(rcc.getRedisClient(host0, port0) === redisClient0 || rcc.getRedisClient(host0, port0) === undefined, `getRedisClient(${host0}, ${port0}) must get EITHER undefined OR cached instance 0`);
              // t.notEqual(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(host0, port0) must NOT get cached instance 0`);
            }
            t.notEqual(rcc.getRedisClient(host1, port1), redisClient0, `getRedisClient(${host1}, ${port1}) must NOT get cached instance 0 due to failure replacement`);
          }

          // Force replacement of cached instance when options differ
          const options2 = {host: host1, port: port1, string_numbers: true};
          rcc.setRedisClientAndReplaceIfUnusable(options2, context)
            .then(redisClient2 => {
              // console.log(`### redisClient2 = ${Strings.stringify(redisClient2)}`);

              t.ok(redisClient2, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options2)}) must return an instance`);
              let [h, p] = redisClient2.resolveHostAndPort();
              t.equal(h, host1, `redisClient 2 host must be ${host1}`);
              t.equal(p, port1, `redisClient 2 port must be ${port1}`);
              // t.equal(redisClient2.getOptions().string_numbers, undefined, `redisClient 2 string_numbers (${redisClient2.getOptions().string_numbers}) must be undefined`);
              t.equal(redisClient2.getOptions().string_numbers, true, `redisClient 2 string_numbers (${redisClient2.getOptions().string_numbers}) must be true`);
              t.notEqual(redisClient2, redisClient0, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options2)}) must replace incompatible cached instance 0`);

              if (host1 === host0 && port1 === port0) {
                if (!alwaysFailing) {
                  t.equal(rcc.getRedisClient(host0, port0), redisClient2, `getRedisClient(${host0}, ${port0}) must get cached instance 2`);
                } else {
                  t.ok(rcc.getRedisClient(host0, port0) === redisClient0 || rcc.getRedisClient(host0, port0) === redisClient2, `getRedisClient(${host0}, ${port0}) must get cached instance 0 OR 2`);
                }
                // } else {
                //   t.equal(rcc.getRedisClient(host0, port0), redisClient0, `getRedisClient(host0, port0) must get cached instance 0`);
              }

              t.equal(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) gets cached instance 2`);

              // Re-use newly cached instance when options same, but diff sequence
              const options3 = {string_numbers: true, port: port1, host: host1};
              rcc.setRedisClientAndReplaceIfUnusable(options3, context)
                .then(redisClient3 => {
                  t.ok(redisClient3, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options3)}) must return an instance`);
                  let [h, p] = redisClient3.resolveHostAndPort();
                  t.equal(h, host1, `redisClient 3 host must be ${host1}`);
                  t.equal(p, port1, `redisClient 3 port must be ${port1}`);
                  // t.equal(redisClient3.getOptions().string_numbers, undefined, `redisClient 3 string_numbers (${redisClient3.getOptions().string_numbers}) must be undefined`);
                  t.equal(redisClient3.getOptions().string_numbers, true, `redisClient 3 string_numbers (${redisClient3.getOptions().string_numbers}) must be true`);

                  if (!alwaysFailing) {
                    t.equal(redisClient3, redisClient2, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options3)}) must re-use cached instance 2 with re-ordered options`);
                    t.equal(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) must get cached instance 2`);
                  } else {
                    t.notEqual(redisClient3, redisClient2, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options3)}) must NOT re-use cached instance 2 with re-ordered options`);
                    t.notEqual(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) must NOT get cached instance 2`);
                  }
                  if (host1 === host0 && port1 === port0) {
                    if (!alwaysFailing) {
                      t.equal(rcc.getRedisClient(host0, port0), redisClient2, `getRedisClient(${host0}, ${port0}) must get cached instance 2`);
                    } else {
                      t.notEqual(rcc.getRedisClient(host0, port0), redisClient2, `getRedisClient(${host0}, ${port0}) must NOT get cached instance 2`);
                    }
                  }

                  // Change to using a different host & port, which will cache a new RedisClient instance under new host & port
                  // make sure none before we start
                  rcc.deleteAndDisconnectRedisClient(host2, port2, context);
                  t.notOk(rcc.getRedisClient(host2, port2), `getRedisClient(${host2}, ${port2}) RedisClient instance must not be cached yet`);

                  // Cache a new RedisClient instance for the different host & port
                  const options4 = {host: host2, port: port2, string_numbers: false};
                  rcc.setRedisClientAndReplaceIfUnusable(options4, context)
                    .then(redisClient4 => {
                      t.ok(redisClient4, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options4)}) must return an instance`);
                      let [h, p] = redisClient4.resolveHostAndPort();
                      t.equal(h, host2, `redisClient 4 host must be ${host2}`);
                      t.equal(p, port2, `redisClient 4 port must be ${port2}`);
                      // t.equal(redisClient4.getOptions().string_numbers, undefined, `redisClient 4 string_numbers (${redisClient4.getOptions().string_numbers}) must be undefined`);
                      t.equal(redisClient4.getOptions().string_numbers, false, `redisClient 4 string_numbers (${redisClient4.getOptions().string_numbers}) must be false`);
                      t.notEqual(redisClient4, redisClient2, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options4)}) must NOT be cached instance 2 for host (${host1}) & port (${port1})`);

                      t.equal(rcc.getRedisClient(host2, port2), redisClient4, `getRedisClient(${host2}, ${port2}) gets cached instance 4`);

                      // Check cache for default host & port is still intact
                      if (!alwaysFailing) {
                        t.equal(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) must get cached instance 2`);
                      } else {
                        t.notEqual(rcc.getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) must NOT get cached instance 2`);
                      }

                      if (host1 === host0 && port1 === port0) {
                        if (!alwaysFailing) {
                          t.equal(rcc.getRedisClient(host0, port0), redisClient2, `getRedisClient(${host0}, ${port0}) must get cached instance 2`);
                        } else {
                          t.notEqual(rcc.getRedisClient(host0, port0), redisClient2, `getRedisClient(${host0}, ${port0}) must NOT get cached instance 2`);
                        }
                      }

                      // Do NOT re-use new RedisClient instance for the different host if string_numbers is undefined instead of false
                      const stringNumbers = undefined;
                      const options5 = {host: host2, port: port2, string_numbers: stringNumbers};
                      rcc.setRedisClientAndReplaceIfUnusable(options5, context)
                        .then(redisClient5 => {
                          t.ok(redisClient5, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options5)}) must return an instance`);
                          let [h, p] = redisClient5.resolveHostAndPort();
                          t.equal(h, host2, `redisClient 5 host must be ${host2}`);
                          t.equal(p, port2, `redisClient 5 port must be ${port2}`);
                          // t.equal(redisClient5.getOptions().string_numbers, undefined, `redisClient 5 string_numbers (${redisClient5.getOptions().string_numbers}) must be undefined`);
                          t.equal(redisClient5.getOptions().string_numbers, undefined, `redisClient 5 string_numbers (${redisClient5.getOptions().string_numbers}) must be undefined`);
                          t.notEqual(redisClient5, redisClient4, `setRedisClientAndReplaceIfUnusable(${JSON.stringify(options5)}) must NOT be cached instance 4 for host (${host2}) & port (${port2})`);

                          // Check that getRedisClientAndReplaceIfClosing replaces client after disconnecting
                          rcc.disconnectClient(redisClient5, context).catch(e => t.fail(`disconnectClient must NOT fail with error (${e})`));
                          t.ok(redisClient5.isClosing(), `redisClient5 must be closing after disconnectClient`);
                          const redisClient6 = rcc.getRedisClientAndReplaceIfClosing(host2, port2, context);
                          t.ok(redisClient6, `redisClient6 must exist after getRedisClientAndReplaceIfClosing(${host2}, ${port2}, context)`);
                          [h, p] = redisClient5.resolveHostAndPort();
                          t.equal(h, host2, `redisClient 6 host must be ${host2}`);
                          t.equal(p, port2, `redisClient 6 port must be ${port2}`);
                          t.notEqual(redisClient6, redisClient5, `redisClient6 must NOT be redisClient5 after getRedisClientAndReplaceIfClosing(${host2}, ${port2}, context)`);

                          // Delete cache for host 1 & port 1
                          let res = rcc.deleteAndDisconnectRedisClient(host1, port1, context);
                          t.ok(res.deleted, `must delete cached instance for host (${host1}) & port (${port1})`); // clean up
                          if (res.disconnectPromise) {
                            res.disconnectPromise.then(disconnected => {
                              // if (!alwaysFailing) {
                              t.ok(disconnected, `must disconnect cached instance for host (${host1}) & port (${port1})`); // clean up
                              // } else {
                              //   t.notOk(disconnected, `must not disconnect cached instance for host (${host1}) & port (${port1})`); // clean up
                              // }
                            });
                          }
                          t.equal(rcc.getRedisClient(host1, port1), undefined, `getRedisClient(${host1}, ${port1}) gets undefined after delete`);

                          // Delete cache for host 2 & port 2
                          res = rcc.deleteAndDisconnectRedisClient(host2, port2, context);
                          t.ok(res.deleted, `must delete cached instance for host (${host2} & port (${port2})`); // clean up
                          t.equal(rcc.getRedisClient(host2, port2), undefined, `getRedisClient(${host2}, ${port2}) gets undefined after delete`);

                          // Allow test to end by quitting each of the redis clients!
                          clearCache(rcc, context);

                          t.end();
                        })
                        .catch(err => {
                          // Allow test to end by quitting each of the redis clients!
                          clearCache(rcc, context);
                          t.end(err);
                        });
                    })
                    .catch(err => {
                      // Allow test to end by quitting each of the redis clients!
                      clearCache(rcc, context);
                      t.end(err);
                    });
                })
                .catch(err => {
                  // Allow test to end by quitting each of the redis clients!
                  clearCache(rcc, context);
                  t.end(err);
                });
            })
            .catch(err => {
              // Allow test to end by quitting each of the redis clients!
              clearCache(rcc, context);
              t.end(err);
            });
        })
        .catch(err => {
          // Allow test to end by quitting each of the redis clients!
          clearCache(rcc, context);
          t.end(err);
        });
    })
    .catch(err => {
      // Allow test to end by quitting each of the redis clients!
      clearCache(rcc, context);
      t.end(err);
    });
});