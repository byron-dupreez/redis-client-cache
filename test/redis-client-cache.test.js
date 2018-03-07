'use strict';

/**
 * Unit tests for redis-client-cache/redis-client-cache.js
 * @author Byron du Preez
 */

const test = require('tape');

// The test subject
const redisClientCache = require('../redis-client-cache');
const setRedisClient = redisClientCache.setRedisClient;
const getRedisClient = redisClientCache.getRedisClient;
const deleteRedisClient = redisClientCache.deleteRedisClient;
const configureRedisClient = redisClientCache.configureRedisClient;

const logging = require('logging-utils');
const LogLevel = logging.LogLevel;

const Strings = require('core-functions/strings');
const stringify = Strings.stringify;

// =====================================================================================================================
// Tests for setRedisClient and getRedisClient
// =====================================================================================================================

test('setRedisClient and getRedisClient', t => {
  const context = {};
  logging.configureLogging(context, {logLevel: LogLevel.TRACE});

  // Set default host & port
  const host1 = redisClientCache.DEFAULT_REDIS_HOST;
  const port1 = redisClientCache.DEFAULT_REDIS_PORT;
  deleteRedisClient(host1, port1); // make sure none before we start

  t.notOk(getRedisClient(), `getRedisClient() RedisClient instance must not be cached yet`);
  t.notOk(getRedisClient(host1, port1), `getRedisClient(${host1}, ${port1}) RedisClient instance must not be cached yet`);

  // Cache new RedisClient for default host & port
  const options0 = {};
  const redisClient0 = setRedisClient(options0, context);
  redisClient0.on('error', () => {}); // ignore any errors
  redisClient0.quit(); // allows test to end!

  t.ok(redisClient0, `setRedisClient(${stringify(options0)}) must return an instance`);
  t.equal(redisClient0.connection_options.host, host1, `redisClient 0 host must be ${host1}`);
  t.equal(redisClient0.connection_options.port, port1, `redisClient 0 port must be ${port1}`);
  t.equal(redisClient0.options.string_numbers, undefined, `redisClient 0 string_numbers (${redisClient0.options.string_numbers}) must be undefined`);

  t.equal(getRedisClient(), redisClient0, `getRedisClient() gets cached instance for default host (${host1}) & port (${port1})`);
  t.equal(getRedisClient(host1, port1), redisClient0, `getRedisClient(${host1}, ${port1}) gets cached instance`);


  // Re-use cached RedisClient for options with explicit host & port same as defaults
  const options1 = { host: host1, port: port1 }; //, string_numbers: true };
  const redisClient1 = setRedisClient(options1, context);
  redisClient1.on('error', () => {}); // ignore any errors
  redisClient1.quit(); // allows test to end!

  t.ok(redisClient1, `setRedisClient(${stringify(options1)}) must return an instance`);
  t.equal(redisClient1.connection_options.host, host1, `redisClient 1 host must be ${host1}`);
  t.equal(redisClient1.connection_options.port, port1, `redisClient 1 port must be ${port1}`);
  t.equal(redisClient1.options.string_numbers, undefined, `redisClient 1 string_numbers (${redisClient1.options.string_numbers}) must be undefined`);
  // t.equal(redisClient1.options.string_numbers, true, `redisClient 1 string_numbers (${redisClient1.options.string_numbers}) must be true`);
  t.equal(redisClient1, redisClient0, `setRedisClient(${stringify(options1)}) must re-use cached instance 0 with same options`);

  t.equal(getRedisClient(), redisClient0, `getRedisClient() gets cached instance 0 for default host (${host1}) & port (${port1})`);
  t.equal(getRedisClient(host1, port1), redisClient0, `getRedisClient(${host1}, ${port1}) gets cached instance 0`);

  // Force replacement of cached instance when options differ
  const options2 = { host: host1, port: port1, string_numbers: true };
  const redisClient2 = setRedisClient(options2, context);
  redisClient2.on('error', () => {}); // ignore any errors
  redisClient2.quit(); // allows test to end!

  console.log(`### redisClient2 = ${Strings.stringify(redisClient2)}`);

  t.ok(redisClient2, `setRedisClient(${stringify(options2)}) must return an instance`);
  t.equal(redisClient2.connection_options.host, host1, `redisClient 2 host must be ${host1}`);
  t.equal(redisClient2.connection_options.port, port1, `redisClient 2 port must be ${port1}`);
  // t.equal(redisClient2.options.string_numbers, undefined, `redisClient 2 string_numbers (${redisClient2.options.string_numbers}) must be undefined`);
  t.equal(redisClient2.options.string_numbers, true, `redisClient 2 string_numbers (${redisClient2.options.string_numbers}) must be true`);
  t.notEqual(redisClient2, redisClient0, `setRedisClient(${stringify(options2)}) must replace incompatible cached instance 0`);

  t.equal(getRedisClient(), redisClient2, `getRedisClient() gets cached instance 2 for default host (${host1}) & port (${port1})`);
  t.equal(getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) gets cached instance 2`);

  // Re-use newly cached instance when options same, but diff sequence
  const options3 = { string_numbers: true, port: port1, host: host1 };
  const redisClient3 = setRedisClient(options3, context);
  redisClient3.on('error', () => {}); // ignore any errors
  redisClient3.quit(); // allows test to end!

  t.ok(redisClient3, `setRedisClient(${stringify(options3)}) must return an instance`);
  t.equal(redisClient3.connection_options.host, host1, `redisClient 3 host must be ${host1}`);
  t.equal(redisClient3.connection_options.port, port1, `redisClient 3 port must be ${port1}`);
  // t.equal(redisClient3.options.string_numbers, undefined, `redisClient 3 string_numbers (${redisClient3.options.string_numbers}) must be undefined`);
  t.equal(redisClient3.options.string_numbers, true, `redisClient 3 string_numbers (${redisClient3.options.string_numbers}) must be true`);
  t.equal(redisClient3, redisClient2, `setRedisClient(${stringify(options3)}) must re-use cached instance 2 with re-ordered options`);

  t.equal(getRedisClient(), redisClient2, `getRedisClient() gets cached instance 2 for default host (${host1}) & port (${port1})`);
  t.equal(getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}) gets cached instance 2`);


  // Change to using a different host & port, which will cache a new RedisClient instance under new host & port
  const host2 = 'localhost';
  const port2 = 9999;
  deleteRedisClient(host2, port2); // make sure none before we start
  t.notOk(getRedisClient(host2, port2), `getRedisClient(${host2}, ${port2}) RedisClient instance must not be cached yet`);
  t.equal(getRedisClient(), redisClient2, `getRedisClient() still gets cached instance 2 for default host (${host1}) & port (${port1})`);

  // Cache a new RedisClient instance for the different host & port
  const options4 = { host: host2, port: port2, string_numbers: false };
  const redisClient4 = setRedisClient(options4, context);
  redisClient4.on('error', () => {}); // ignore any errors
  redisClient4.quit(); // allows test to end!

  t.ok(redisClient4, `setRedisClient(${stringify(options4)}) must return an instance`);

  t.equal(redisClient4.connection_options.host, host2, `redisClient 4 host must be ${host2}`);
  t.equal(redisClient4.connection_options.port, port2, `redisClient 4 port must be ${port2}`);
  // t.equal(redisClient4.options.string_numbers, undefined, `redisClient 4 string_numbers (${redisClient4.options.string_numbers}) must be undefined`);
  t.equal(redisClient4.options.string_numbers, false, `redisClient 4 string_numbers (${redisClient4.options.string_numbers}) must be false`);
  t.notEqual(redisClient4, redisClient2, `setRedisClient(${stringify(options4)}) must NOT be cached instance 2 for host (${host1}) & port (${port1})`);

  t.equal(getRedisClient(host2, port2), redisClient4, `getRedisClient(${host2}, ${port2}) gets cached instance 4`);

  // Check cache for default host & port is still intact
  t.equal(getRedisClient(), redisClient2, `getRedisClient() still gets cached instance 2 for default host (${host1}) & port (${port1})`);
  t.equal(getRedisClient(host1, port1), redisClient2, `getRedisClient(${host1}, ${port1}) gets cached instance 2`);


  // Do NOT re-use new RedisClient instance for the different host if string_numbers is undefined instead of false
  const stringNumbers = undefined;
  const options5 = { host: host2, port: port2, string_numbers: stringNumbers };
  const redisClient5 = setRedisClient(options5, context);
  redisClient5.on('error', () => {}); // ignore any errors
  redisClient5.quit(); // allows test to end!

  t.ok(redisClient5, `setRedisClient(${stringify(options5)}) must return an instance`);
  t.equal(redisClient5.connection_options.host, host2, `redisClient 5 host must be ${host2}`);
  t.equal(redisClient5.connection_options.port, port2, `redisClient 5 port must be ${port2}`);
  // t.equal(redisClient5.options.string_numbers, undefined, `redisClient 5 string_numbers (${redisClient5.options.string_numbers}) must be undefined`);
  t.equal(redisClient5.options.string_numbers, undefined, `redisClient 5 string_numbers (${redisClient5.options.string_numbers}) must be undefined`);
  t.notEqual(redisClient5, redisClient4, `setRedisClient(${stringify(options5)}) must NOT be cached instance 4 for region (${host2})`);

  // Delete cache for host 1 & port 1
  t.ok(deleteRedisClient(host1, port1, context), `must delete cached instance for region (${host1}, ${port1})`); // clean up
  t.equal(getRedisClient(host1, port1), undefined, `getRedisClient(${host1}, ${port1}) gets undefined after delete`);

  // Delete cache for host 2 & port 2
  t.ok(deleteRedisClient(host2, port2, context), `must delete cached instance for region (${host2}, ${port2})`); // clean up
  t.equal(getRedisClient(host2, port2), undefined, `getRedisClient(${host2}, ${port2}) gets undefined after delete`);

  t.end();
});

// =====================================================================================================================
// Tests for configureRedisClient
// =====================================================================================================================

test('configureRedisClient', t => {
  const context = {};
  logging.configureLogging(context, {logLevel: LogLevel.DEBUG});

  // Set default host & port
  const host1 = redisClientCache.DEFAULT_REDIS_HOST;
  const port1 = redisClientCache.DEFAULT_REDIS_PORT;

  // Ensure not cached before we configure
  deleteRedisClient(host1, port1); // make sure none before we start

  t.notOk(context.redisClient, 'context.redisClient must not be configured yet');

  // Configure it for the first time
  configureRedisClient(context, {string_numbers: true});

  const redisClient1 = context.redisClient;
  redisClient1.on('error', () => {}); // ignore any errors
  redisClient1.quit(); // allows test to end!

  t.ok(redisClient1, 'context.redisClient 1 must be configured now');
  t.equal(redisClient1.connection_options.host, host1, `context.redisClient 1 host must be ${host1}`);
  t.equal(redisClient1.connection_options.port, port1, `context.redisClient 1 port must be ${port1}`);
  t.equal(redisClient1.options.string_numbers, true, `redisClient 1 string_numbers (${redisClient1.options.string_numbers}) must be true`);

  // "Configure" it for the second time with same host & port & string_numbers (should give same RedisClient instance back again)
  context.redisClient = undefined; // clear context.redisClient otherwise will always get it back

  configureRedisClient(context, {host: host1, port: port1, string_numbers: true});
  const redisClient1a = context.redisClient;
  redisClient1a.on('error', () => {}); // ignore any errors
  redisClient1a.quit(); // allows test to end!

  t.ok(redisClient1a, 'context.redisClient 1a must be configured');
  t.equal(redisClient1a, redisClient1, 'context.redisClient 1a must be cached instance 1');
  t.equal(redisClient1a.connection_options.host, host1, `context.redisClient 1a host must be ${host1}`);
  t.equal(redisClient1a.connection_options.port, port1, `context.redisClient 1a port must be ${port1}`);
  t.equal(redisClient1a.options.string_numbers, true, `redisClient 1a string_numbers (${redisClient1a.options.string_numbers}) must be true`);

  // Configure a new RedisClient with a different string_numbers
  context.redisClient = undefined; // clear context.redisClient otherwise will always get it back

  configureRedisClient(context, {string_numbers: false});
  const redisClient2 = context.redisClient;
  redisClient2.on('error', () => {}); // ignore any errors
  redisClient2.quit(); // allows test to end!

  t.ok(redisClient2, 'context.redisClient 2 must be configured');
  t.equal(redisClient2.connection_options.host, host1, `context.redisClient 2 host must be ${host1}`);
  t.equal(redisClient2.connection_options.port, port1, `context.redisClient 2 port must be ${port1}`);
  t.equal(redisClient2.options.string_numbers, false, `redisClient 2 string_numbers (${redisClient2.options.string_numbers}) must be false`);
  t.notEqual(redisClient2, redisClient1, 'context.redisClient 2 must not be cached instance 1');

  // Configure same again, should hit context "cache"
  configureRedisClient(context, {string_numbers: false, port: port1, host: host1});
  const redisClient2a = context.redisClient;
  redisClient2a.on('error', () => {}); // ignore any errors
  redisClient2a.quit(); // allows test to end!

  t.ok(redisClient2a, 'context.redisClient 2a must be configured');
  t.equal(redisClient2a.connection_options.host, host1, `context.redisClient 2a host must be ${host1}`);
  t.equal(redisClient2a.connection_options.port, port1, `context.redisClient 2a port must be ${port1}`);
  t.equal(redisClient2a.options.string_numbers, false, `redisClient 2a string_numbers (${redisClient2a.options.string_numbers}) must be false`);
  t.equal(redisClient2a, redisClient2, 'context.redisClient 2a must be cached instance 2');
  t.notEqual(redisClient2a, redisClient1, 'context.redisClient 2a must not be cached instance 1');


  // Reconfigure "original" again
  context.redisClient = undefined; // clear context.redisClient otherwise will always get it back
  //deleteRedisClient(region1); // make sure its gone before we start

  configureRedisClient(context, {string_numbers: true});
  const redisClient3 = context.redisClient;
  redisClient3.on('error', () => {}); // ignore any errors
  redisClient3.quit(); // allows test to end!

  t.ok(redisClient3, 'context.redisClient 3 must be configured');
  t.equal(redisClient3.connection_options.host, host1, `context.redisClient 3 host must be ${host1}`);
  t.equal(redisClient3.connection_options.port, port1, `context.redisClient 3 port must be ${port1}`);
  t.equal(redisClient3.options.string_numbers, true, `redisClient 3 string_numbers (${redisClient3.options.string_numbers}) must be true`);

  t.notEqual(redisClient3, redisClient2, 'context.redisClient 3 must not be cached instance 2');
  t.notEqual(redisClient3, redisClient1, 'context.redisClient 3 must not be cached instance 1');

  // Configure for new host & port
  const host2 = 'localhost';
  const port2 = 9999;
  context.redisClient = undefined; // clear context.redisClient otherwise will always get it back
  deleteRedisClient(host2, port2); // make sure none before we start

  configureRedisClient(context, {host: host2, port: port2, string_numbers: true});
  const redisClient4 = context.redisClient;
  redisClient4.on('error', () => {}); // ignore any errors
  redisClient4.quit(); // allows test to end!

  t.ok(redisClient4, 'context.redisClient 4 must be configured');
  t.equal(redisClient4.connection_options.host, host2, `context.redisClient 4 host must be ${host2}`);
  t.equal(redisClient4.connection_options.port, port2, `context.redisClient 4 port must be ${port2}`);
  t.equal(redisClient4.options.string_numbers, true, `redisClient 4 string_numbers (${redisClient3.options.string_numbers}) must be true`);

  t.notEqual(redisClient4, redisClient3, 'context.redisClient 4 must NOT be cached instance 3');
  t.notEqual(redisClient4, redisClient2, 'context.redisClient 4 must NOT be cached instance 2');
  t.notEqual(redisClient4, redisClient1, 'context.redisClient 4 must NOT be cached instance 1');

  // "Reconfigure" original again
  context.redisClient = undefined; // clear context.redisClient otherwise will always get it back
  configureRedisClient(context, {string_numbers: true});
  const redisClient5 = context.redisClient;
  redisClient5.on('error', () => {}); // ignore any errors
  redisClient5.quit(); // allows test to end!

  t.ok(redisClient5, 'context.redisClient must be configured');
  t.equal(redisClient5.connection_options.host, host1, `context.redisClient 5 host must be ${host1}`);
  t.equal(redisClient5.connection_options.port, port1, `context.redisClient 5 port must be ${port1}`);
  t.equal(redisClient5.options.string_numbers, true, `redisClient 5 string_numbers (${redisClient3.options.string_numbers}) must be true`);

  t.equal(redisClient5, redisClient3, 'context.redisClient 5 must be cached instance 3');

  t.end();
});
