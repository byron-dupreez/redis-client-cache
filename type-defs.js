'use strict';

/**
 * @typedef {Object} RedisClientOptions - constructor options to use to construct a new RedisClient instance
 * @property {string|undefined} [host] - an optional host to use (defaults to 127.0.0.1 if unspecified)
 * @property {number|string|undefined} [port] - an optional port to use (defaults to 6379 if unspecified)
 */

/**
 * @typedef {Object} RedisAdapter - a Redis adapter instance
 * @property {string} adaptee - the name of the underlying Redis implementation, which is being adapted by this adapter
 * @property {string} defaultHost - the default redis host
 * @property {number} defaultPort - the default redis port
 * @property {function(redisClientOptions: (RedisClientOptions|undefined)): RedisClient} createClient - a factory
 *           function to be used to create a RedisClient instance
 * @property {function(fnName: string): Function} getClientFunction - returns the named client function
 * @property {function(fnName: string, fn: Function)} setClientFunction - installs the named client function and sets it
 *           to the given function
 * @property {function(fnName: string): Function} deleteClientFunction - deletes the named client function
 * @property {function(err: Error): boolean} isMovedError - whether the given error indicates that a previously
 *           requested key has been moved or not
 * @property {function(err: Error): [string, number|string]} resolveHostAndPortFromMovedError - resolves the new host &
 *           port from the given moved error (precondition: isMovedErr(err) is true)
 * @property {Error} ReplyError - a constructor function to use to create ReplyError instances for testing
 */

/**
 * @typedef {Object} RedisClient - a redis client instance
 * @property {function(): RedisAdapter} getAdapter - returns the adapter that created this client
 * @property {function(): boolean} isClosing - whether the client is closing/closed or not
 * @property {function(onConnect: (function()|undefined), onReady: (function()|undefined),
 *           onReconnecting: (function()|undefined), onError: (function(err: Error)|undefined),
 *           onClientError: (function(err: Error)|undefined), onEnd: (function()|undefined),
 *           onClose: (Function|undefined))} addEventListeners - registers the given event listeners on this client
 * @property {function(): RedisClientOptions} getOptions - returns this client's current options
 * @property {function(): [string, number|string]} resolveHostAndPort - returns this client's host and port
 * @property {function(fnName: string): Function} getFunction - returns the named function of this client
 * @property {function(fnName: string, fn: Function)} setFunction - installs the named function onto this client and
 *           sets it to the given function
 * @property {function(fnName: string): Function} deleteFunction - deletes the named function from this client
 * @property {function(key: string, callback: (Function|undefined)): *} get - gets the value for the given key
 * @property {function(key: string): Promise.<*>} [getAsync] - gets the value for the given key
 * @property {function(key: string, value: *, x: ('EX'|'NX'|'XX'|undefined|Function), ttl: (number|undefined|Function),
 *           callback: (Function|undefined)): *} set - sets the value for the given key to the given value
 * @property {function(key: string, value: *, x: ('EX'|'NX'|'XX'|undefined), ttl: (number|undefined)): Promise.<*>}
 *           [setAsync] - sets the value for the given key to the given value
 * @property {function(key: string, callback: (Function|undefined)): *} del - deletes the value for the given key
 * @property {function(key: string): Promise.<*>} [delAsync] - deletes the value for the given key
 * @property {function(pong: string, callback: (Function|undefined)): *} ping - pings the server
 * @property {function(pong: string): Promise.<*>} [pingAsync] - pings the server
 * @property {function(flush: boolean): *} end - disconnects the client (after flushing, if flush is true; otherwise
 *           ends WITHOUT flushing)
 */

/**
 * @typedef {{host: string, port: string|number}} HostPortKey - a host-port key object used as a key for caching
 */

/**
 * @typedef {Logger|Object} RedisClientCacheAware - an object configured with a RedisClientCache instance to use
 * @property {RedisClientCache} redisClientCache - a Redis client cache to use
 */