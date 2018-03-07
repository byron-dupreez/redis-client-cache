# redis-client-cache
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

* To use the RedisClient cache to configure and cache a RedisClient instance per host-port combination
```js
const redisClientCache = require('redis-client-cache');

// Preamble to create a context and configure logging on the context
const context = {};
const logging = require('logging-utils');
logging.configureLogging(context); // or your own custom logging configuration (see logging-utils README.md)

// Define the RedisClient constructor options that you want to use, e.g.
const redisClientOptions = {
  // See https://www.npmjs.com/package/redis#options-object-properties for full details
  string_numbers: true
  // ...
};

// To create and cache a new RedisClient instance with the given RedisClient constructor options for either the default 
// host and port or for the host and port specified in the given options OR reuse a previously cached RedisClient instance 
// (if any) that is compatible with the given options
const redisClient = redisClientCache.setRedisClient(redisClientOptions, context);
assert(redisClient);

// To configure a new RedisClient instance (or re-use a cached instance) on a context 
redisClientCache.configureRedisClient(context, redisClientOptions);
console.log(context.redisClient);

// To get a previously set or configured RedisClient instance for the default host and port
const redisClient1 = redisClientCache.getRedisClient();
assert(redisClient1);

// ... or for a specified host and port
const redisClient2 = redisClientCache.getRedisClient('localhost', 9999);
assert(redisClient2);

// To get the original options that were used to construct a cached RedisClient instance for the default or specified host and port
const optionsUsed1 = redisClientCache.getRedisClientOptionsUsed();
assert(optionsUsed1);

const optionsUsed2 = redisClientCache.getRedisClientOptionsUsed('localhost', 9999);
assert(optionsUsed2);

// To delete and remove a cached RedisClient instance from the cache
const deleted = redisClientCache.deleteRedisClient('localhost', 9999);
assert(deleted);
```

## Unit tests
This module's unit tests were developed with and must be run with [tape](https://www.npmjs.com/package/tape). The unit tests have been tested on [Node.js v6.10.3](https://nodejs.org/en/blog/release/v6.10.3).  

See the [package source](https://github.com/byron-dupreez/redis-client-cache) for more details.

## Changes
See [release_notes.md](./release_notes.md)
