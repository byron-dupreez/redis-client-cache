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

## Unit tests
This module's unit tests were developed with and must be run with [tape](https://www.npmjs.com/package/tape). The unit tests have been tested on [Node.js v6.10.3](https://nodejs.org/en/blog/release/v6.10.3).  

See the [package source](https://github.com/byron-dupreez/redis-client-cache) for more details.

## Changes
See [release_notes.md](./release_notes.md)
