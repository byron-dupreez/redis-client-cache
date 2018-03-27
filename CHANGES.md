## Changes

### 2.0.1
- Updated `README.md` to reflect the code changes

### 2.0.0
- Major additions, changes & fixes to `redis-client-cache` module:
  - Replaced the exported object with a new `RedisClient` class, which must be constructed with a configurable Redis 
    adapter (i.e. one of `redis-adapter`, `ioredis-adapter`, `redis-mock-adapter` or `ioredis-mock-adapter`)
  - Changed most of the existing functions into methods of this new `RedisClient` class
    - Added a new static `configureRedisClientCache` method and removed the existing `configureRedisClient` function  
    - Added new `promisifyClientFunction`, `promisifyClientFunctions`, `getRedisClientAndReplaceIfClosing`, 
      `replaceRedisClientIfClosing`, `setRedisClientAndReplaceIfUnusable`, `replaceRedisClientIfUnusable`, 
      `isRedisClientUsable` and `clearCache` methods
    - Added new internal `createNewClient` and `resolveHostAndPortFromOptions` supporting methods and functions  
    - Changed the `setRedisClient` (and `setRedisClientAndReplaceIfUnusable`) methods to also register default `ready`, 
      `error` and `end` event handlers on new Redis client instances created via the new `createNewClient` function
    - Replaced the existing `quitRedisClient`, `quitRedisClientIfExists` and `deleteRedisClient` functions with new 
      `deleteAndDisconnectRedisClient`, `disconnectClient` and `deleteClientByHostPortKey` methods
    - Changed the `disconnectClient` method to use a Redis client's `end` function (if available) with its flush 
      argument set to `true` instead of using its intermittently failing `quit` function
  - Added unit tests for each of the four Redis adapter implementations
- Added `.npmignore`
- Renamed `release_notes.md` to `CHANGES.md`
- Updated dependencies

### 1.0.0
- Initial version