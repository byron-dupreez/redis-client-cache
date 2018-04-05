# redis-client-cache v2.0.2
A simple module-scope cache of RedisClient instances by host and port (primarily for AWS Lambda use).

**NB:** This module depends on the external `redis` module and caches that module's `RedisClient` instances.

Main module:
- redis-client-cache.js

This module is exported as a [Node.js](https://nodejs.org) module.

## Installation

Using npm:
```bash
$ npm i --save redis-client-cache
```

## Usage

* To use the RedisClient cache to set and get a previously or newly cached, "raw" (untested) RedisClient instance per 
  host-port combination
```js
const RedisClientCache = require('redis-client-cache');

// Choose a Redis adapter to use - either 'rcc-redis-adapter' or 'rcc-ioredis-adapter' 
// For unit testing, choose either 'rcc-redis-mock-adapter' or 'rcc-ioredis-mock-adapter'
const redisAdapter = require('rcc-redis-adapter');

// Preamble to create a context and configure logging on the context
let context = {};
const logging = require('logging-utils');
context = logging.configureLogging(context); // or your own custom logging configuration (see logging-utils README.md)

// NB: Configure the redis client cache with an appropriate Redis adapter to use
context = RedisClientCache.configureRedisClientCache(context, redisAdapter);
const redisClientCache = context.redisClientCache;
assert(redisClientCache);

const host = '127.0.0.1'; // ... replace with your redis server's host
const port = 6379; // ... replace with your redis server's port


// Define the redis client constructor options that you want to use, e.g.
const redisClientOptions = {
  host: host,
  port: port,
  string_numbers: true // ... `redis` adapter example ... not valid for `ioredis`
  // See https://www.npmjs.com/package/redis#options-object-properties for full details for `redis` adapter
  // ...
};

// To create and cache a new RedisClient instance with the given RedisClient constructor options for either the default 
// host and port or for the host and port specified in the given options OR to reuse a previously cached RedisClient 
// instance (if any) that is compatible with the given options
const redisClient = redisClientCache.setRedisClient(redisClientOptions, context);
assert(redisClient);

// To get a previously set or configured RedisClient instance for a specified host and port
const redisClient1 = redisClientCache.getRedisClientAndReplaceIfClosing('localhost', 9999, context);
assert(redisClient1);

// ... or, less useful, for the DEFAULT host and port
const redisClient2 = redisClientCache.getRedisClient(redis.defaultHost, redis.defaultPort);
assert(redisClient2);

// To get the original options that were used to construct a cached RedisClient instance for a specified host and port
const optionsUsed1 = redisClientCache.getRedisClientOptionsUsed('localhost', 9999);
assert(optionsUsed1);

// ... or, less useful, for the DEFAULT host and port
const optionsUsed2 = redisClientCache.getRedisClientOptionsUsed(redis.defaultHost, redis.defaultPort);
assert(optionsUsed2);

// To remove (and also end/quit) a cached RedisClient instance from the cache
const {host1, port1, deleted, disconnectPromise} = redisClientCache.deleteAndDisconnectRedisClient('localhost', 9999, context);
assert(host1 && port1 && deleted && disconnectPromise);

// To asynchronously test connectivity of a RedisClient instance
redisClientCache.isRedisClientUsable(redisClient, context).then(usable => {
  // usable will be true if the async connectivity test worked; otherwise false
  assert(usable === true);
  // ...
});

// To simultaneously test connectivity of a RedisClient instance and then EITHER return it (if the test passed)
// OR return a brand new instance (if the test failed)
redisClientCache.replaceRedisClientIfUnusable(redisClient, redisClientOptions, context).then(client => {
  assert(client);
  // ...
});
```

* To use the RedisClient cache to set and get a previously or newly cached, tested and USABLE RedisClient 
  instance (if the connectivity test passed) or a brand new instance (if the connectivity test failed) per host-port 
  combination. Note that this function returns a promise, since it performs an asynchronous connectivity test against
  the Redis server (and also suffers the overhead of doing so).
```js
const RedisClientCache = require('redis-client-cache');

// Choose a Redis adapter to use - either 'rcc-redis-adapter' or 'rcc-ioredis-adapter' 
// For unit testing, choose either 'rcc-redis-mock-adapter' or 'rcc-ioredis-mock-adapter'
const redisAdapter = require('rcc-ioredis-adapter');

// Preamble to create a context and configure logging on the context
let context = {};
const logging = require('logging-utils');
context = logging.configureLogging(context); // or your own custom logging configuration (see logging-utils README.md)

// NB: Configure the redis client cache with an appropriate Redis adapter to use
context = RedisClientCache.configureRedisClientCache(context, redisAdapter);
const redisClientCache = context.redisClientCache;
assert(redisClientCache);

const host = '127.0.0.1'; // ... your redis server's host
const port = 6379; // ... your redis server's port

// Define the RedisClient constructor options that you want to use, e.g.
const redisClientOptions = {
  host: host,
  port: port,
  string_numbers: true
  // See https://www.npmjs.com/package/redis#options-object-properties for full details (if using `rcc-redis-adapter`) 
  // ...
};

// To set a new "tested" and USABLE RedisClient instance with the given RedisClient constructor options for either the 
// default host and port or for the host and port specified in the given options OR to reuse a previously cached, 
// tested and USABLE RedisClient instance (if any) that is compatible with the given options
const redisClientPromise = redisClientCache.setRedisClientAndReplaceIfUnusable(redisClientOptions, context);
// ...
redisClientPromise.then(client => {
  assert(client);
  // ...  
});

// To later retrieve the cached RedisClient instance
const client = redisClientCache.getRedisClient(host, port);
assert(client);
```

## Unit tests
This module's unit tests were developed with and must be run with [tape](https://www.npmjs.com/package/tape). The unit tests have been tested on [Node.js v6.10.3](https://nodejs.org/en/blog/release/v6.10.3).  

To run the unit tests - against `redis-mock` and `ioredis-mock`:
```
npm test
```

To run the integration tests - against `redis` and `ioredis`:
```
npm run itest
```

See the [package source](https://github.com/byron-dupreez/redis-client-cache) for more details.

## Changes
See [CHANGES.md](CHANGES.md)
