'use strict';

const copy = require('core-functions/copying').copy;
const deep = {deep: true};

const Promises = require('core-functions/promises');

const FatalError = require('core-functions/errors').FatalError;

const deepEqual = require('deep-equal');
const strict = {strict: true};

// Module-scope cache of RedisClient instances by host-port key
let redisClientsByHostPortKey = new WeakMap();

// Module-scope cache of the RedisClient options used to construct the RedisClient instances by host-port key
let redisClientOptionsByHostPortKey = new WeakMap();

// A map of host-port key objects by host-port, which is only needed, because WeakMaps can ONLY have object keys
const hostPortKeysByHostPort = new Map();

const defaultNamedRedisFunctionsToPromisify = ['del', 'get', 'set', 'getset', 'quit', 'end', 'info', 'ping', 'expire', 'exec'];
//, 'hget', 'hgetall', 'hset', 'hdel', 'hmget', 'hmset'];

// exports._$_ = '_$_'; //IDE workaround

/**
 * A cache of RedisClient instances by host & port (primarily for AWS Lambda use). Note that the cache is constructed
 * with a Redis adapter instance, which allows it to be configured with different underlying Redis implementations
 * (currently `redis`, `ioredis`, `redis-mock` or `ioredis-mock`).
 * @module redis-client-cache/redis-client-cache
 * @author Byron du Preez
 */
class RedisClientCache {

  /**
   * Constructs a new RedisClientCache instance using the given RedisAdapter instance.
   * @param {RedisAdapter} redisAdapter - a Redis adapter to use
   */
  constructor(redisAdapter) {
    if (!redisAdapter || typeof redisAdapter !== 'object') {
      throw new FatalError('Cannot construct a RedisClientCache instance without a valid Redis adapter');
    }
    this.redis = redisAdapter;
  }

  /**
   * Configures the given context with a Redis adapter, if it's not already configured with a `redis` property.
   * @param {RedisClientCacheAware|Logger} context - the context to configure with a Redis adapter
   * @param {RedisAdapter} redisAdapter - a Redis adapter to use to construct a new cache
   * @param {string[]|undefined} [namedRedisFunctionsToPromisify] - a list of names of Redis callback-style functions
   *        for which to create and install promise-returning versions of these functions with "Async" suffixes on their
   *        original names (if not defined, defaults to `defaultNamedRedisFunctionsToPromisify`)
   * @returns {RedisClientCacheAware} the given context configured with either its existing RedisClientCache instance
   *          (if any) or with a new instance constructed with the given RedisAdapter instance
   */
  static configureRedisClientCache(context, redisAdapter, namedRedisFunctionsToPromisify) {
    if (!context.redisClientCache) {
      context.redisClientCache = new RedisClientCache(redisAdapter);
    }
    // For convenience, also install Promise-returning versions of the named (or default) redis client functions
    context.redisClientCache.promisifyClientFunctions(namedRedisFunctionsToPromisify, context);
    return context;
  }

  // /**
  //  * Returns this cache's Redis adapter.
  //  * @return {RedisAdapter} returns this cache's Redis adapter
  //  */
  // getAdapter() {
  //   return this.redis;
  // }

  /**
   * Installs a promise-returning version of the named RedisClient prototype function (if not already installed) that must
   * accept a Node-style callback as its last argument. The name of the installed function will be the given name with a
   * suffix of 'Async'. The installed function will also attempt to handle a redis "Moved" error by caching a new redis
   * client for the new host and port (if necessary) and then re-attempting the same function call.
   * @param {string} fnName - the name of a Redis client function that accepts a Node-style callback as its last argument
   * @param {Logger} context - the context to use
   */
  promisifyClientFunction(fnName, context) {
    const rcc = this;
    const redis = this.redis;
    const asyncFnName = `${fnName}Async`;

    function dummyFn() {
      const n = arguments.length;
      const callback = n > 0 ? arguments[n - 1] : undefined;
      const error = new Error(`Missing '${fnName}' function on the redis client prototype`);
      if (typeof callback === 'function') {
        callback(error);
      } else {
        throw error;
      }
    }

    function createAsyncFunction(fnName) {
      let fn = redis.getClientFunction(fnName);

      if (!fn) {
        context.warn(`Failed to find '${fnName}' function on the redis client prototype`);
        fn = dummyFn;
        redis.setClientFunction(fnName, fn);
      }

      const fnAsync = Promises.wrap(fn);

      /**
       * @this {RedisClient}
       * @return {*}
       */
      function execAsync() {
        const redisClient = this;
        return fnAsync.apply(redisClient, arguments).catch(err => {
          context.trace(`### ${asyncFnName} caught error ${err}`);
          if (redis.isMovedError(err)) {
            context.warn(err);
            const [newHost, newPort] = redis.resolveHostAndPortFromMovedError(err);
            context.trace(`Reacting to "MOVED" reply, by caching a redis client for new host (${newHost}) & port (${newPort}) ...`);

            // Cache a new redis client using the new host & port (and any other old redis client options)
            const [oldHost, oldPort] = redisClient.resolveHostAndPort();
            const oldOptions = rcc.getRedisClientOptionsUsed(oldHost, oldPort) || redisClient.getOptions();
            const newOptions = oldOptions ? copy(oldOptions, deep) : {};
            newOptions.host = newHost;
            newOptions.port = newPort;
            const newRedisClient = rcc.setRedisClient(newOptions, context);

            // Try once more with the new redis client after the move
            return fnAsync.apply(newRedisClient, arguments).catch(err => {
              context.error(err);
              // deleteAndDisconnectClient(newRedisClient, context);
              rcc.disconnectClient(newRedisClient, context).catch(e => context.error(e));
              throw err;
            });
          } else {
            context.error(err);
            // deleteAndDisconnectClient(redisClient, context);
            rcc.disconnectClient(redisClient, context).catch(e => context.error(e));
            throw err;
          }
        });
      }

      return execAsync;
    }

    if (!redis.getClientFunction(asyncFnName)) {
      redis.setClientFunction(asyncFnName, createAsyncFunction(fnName));
    }
  }

  /**
   * Installs promise-returning versions of a handful of common Redis client prototype functions (if not already
   * installed) that must all accept a Node-style callback as their last argument. The name of the installed
   * function will be the targeted name with a suffix of 'Async'. The installed function will also attempt to handle a
   * redis "Moved" error by caching a new redis client for the new server; and then re-attempting the same function call.
   * @param {string[]|undefined} [fnNames] - a list of function names for which to install promise-returning versions of
   *        these callback-style functions (if not defined, then defaults to `defaultNamedRedisFunctionsToPromisify`)
   * @param {RedisClientCacheAware} context - the context to use
   */
  promisifyClientFunctions(fnNames, context) {
    const targetedFnNames = Array.isArray(fnNames) ? fnNames : defaultNamedRedisFunctionsToPromisify;
    targetedFnNames.forEach(fnName => this.promisifyClientFunction(fnName, context));
  }

  // noinspection JSMethodCanBeStatic
  /**
   * Gets the options used to construct the RedisClient instance cached for the given host & port (if specified and if
   * previously cached); otherwise for the default host & port (if previously cached); otherwise returns undefined.
   * @param {string} host - the host to use
   * @param {number|string} port - the port to use
   * @returns {RedisClientOptions|undefined} the options used to construct the RedisClient instance cached for the given
   *          or default host & port (if any); otherwise returns undefined
   */
  getRedisClientOptionsUsed(host, port) {
    const hostPortKey = getHostPortKey(host, port);
    return hostPortKey ? redisClientOptionsByHostPortKey.get(hostPortKey) : undefined;
  }

  // noinspection JSMethodCanBeStatic
  /**
   * Gets the RedisClient instance cached for the given host & port (if specified and if previously cached); otherwise for
   * the default host and/or port (if previously cached); otherwise returns undefined.
   * @param {string} host - the host to use
   * @param {number|string} port - the port to use
   * @returns {RedisClient|undefined} the RedisClient instance cached for the given or default host & port (if any);
   *          otherwise returns undefined
   */
  getRedisClient(host, port) {
    const hostPortKey = getHostPortKey(host, port);
    return hostPortKey ? redisClientsByHostPortKey.get(hostPortKey) : undefined;
  }

  /**
   * Gets the RedisClient instance cached for the given or default host & port (if previously cached) and replaces it if
   * it is already closing before returning the replacement; otherwise returns undefined.
   * @param {string} host - the host to use
   * @param {number|string} port - the port to use
   * @param {RedisClientCacheAware} context - the context to use
   * @returns {RedisClient|undefined} the RedisClient instance cached for the given or default host & port (if any);
   *          otherwise returns undefined
   */
  getRedisClientAndReplaceIfClosing(host, port, context) {
    const hostPortKey = getHostPortKey(host, port);
    const redisClient = redisClientsByHostPortKey.get(hostPortKey);
    if (redisClient && redisClient.isClosing()) {
      return this.replaceRedisClientIfClosing(redisClient, context);
    }
    return redisClient;
  }

  /**
   * Creates and caches a new RedisClient instance with the given RedisClient constructor options for the host & port
   * specified in the given options (if any) or for the default host & port (if not) UNLESS a previously cached
   * RedisClient instance exists and the given options EITHER match the options used to construct it OR are undefined,
   * empty or only host & port, in which case no new instance will be created and the cached instance will be returned
   * instead. If the given options do not match existing options and are not empty and not only host & port, then logs a
   * warning that the previously cached RedisClient instance is being replaced and returns the new RedisClient instance.
   *
   * Logging should be configured before calling this function (see {@linkcode logging-utils/logging#configureLogging})
   *
   * @param {RedisClientOptions|undefined} [redisClientOptions] - the optional RedisClient constructor options to use
   * @param {RedisClientCacheAware} context - the context to use
   * @returns {RedisClient} a previously or newly cached RedisClient instance
   */
  setRedisClient(redisClientOptions, context) {
    const rcc = this;

    // If no options were specified, then use an empty object
    const options = redisClientOptions ? copy(redisClientOptions, deep) : {};

    // If no host and/or port were specified in the given redis client constructor options, then set them to the defaults
    const redis = this.redis;
    const [host, port] = resolveHostAndPortFromOptions(options, redis.defaultHost, redis.defaultPort, context);
    const hostPortKey = getOrSetHostPortKey(host, port);

    // Check if there is already a RedisClient instance cached for this host & port
    const redisClient = redisClientsByHostPortKey.get(hostPortKey);
    if (!redisClient) {
      return rcc.createNewClient(options, context);
    }

    /**
     * @param {RedisClient} redisClient
     * @param {string} withDesc
     * @return {RedisClient}
     */
    function reuseRedisClientIfNotClosing(redisClient, withDesc) {
      if (!redisClient.isClosing()) {
        context.trace(`Reusing cached RedisClient instance for host (${host}) & port (${port}) ${withDesc}`);
        return redisClient;
      }

      context.trace(`Replacing CLOSING RedisClient instance with a new one for host (${host}) & port (${port}) ${withDesc}`);
      deleteClientByHostPortKey(hostPortKey, context);

      return rcc.createNewClient(options, context);
    }

    // If caller specified no options, then accept the cached instance for the default host & port (regardless of its options)
    if (!redisClientOptions || Object.getOwnPropertyNames(redisClientOptions).length === 0) {
      return reuseRedisClientIfNotClosing(redisClient, 'with ANY options, since no options were specified');
    }

    // If caller ONLY specified a host & port, then accept the cached instance for the host & port (regardless of its options)
    if (Object.getOwnPropertyNames(options).length === 2) {
      return reuseRedisClientIfNotClosing(redisClient, 'with ANY options, since only host & port were specified');
    }

    // If the given options match the options used to construct the cached instance, then returns the cached instance
    const optionsUsed = redisClientOptionsByHostPortKey.get(hostPortKey);

    // Use the cached instance if its config is identical to the modified options
    if (deepEqual(optionsUsed, options, strict)) {
      return reuseRedisClientIfNotClosing(redisClient, 'with identical options');
    }

    // Otherwise dump the old incompatible redis client in favour of one with the new options
    context.warn(`Replacing INCOMPATIBLE cached RedisClient instance (${JSON.stringify(optionsUsed)}) for host (${host}) & port (${port}) with new instance (${JSON.stringify(options)})`);
    deleteClientByHostPortKey(hostPortKey, context);
    rcc.disconnectClient(redisClient, context).catch(err => context.error(err));

    return rcc.createNewClient(options, context);
  }

  /**
   * First checks whether the given RedisClient instance is closing or not and then returns it if it's still open;
   * otherwise replaces the closing old client with a new one.
   * @param {RedisClient} redisClient - the RedisClient instance to check
   * @param {RedisClientCacheAware} context - the context to use
   * @return {RedisClient}
   */
  replaceRedisClientIfClosing(redisClient, context) {
    const [host, port] = redisClient.resolveHostAndPort();

    if (redisClient.isClosing()) {
      // Old redis client is closing/closed, so create and cache a new redis client
      context.trace(`Replacing closing RedisClient instance for host (${host}) & port (${port}) with a new one`);
      const hostPortKey = getHostPortKey(host, port);
      const options = (hostPortKey && redisClientOptionsByHostPortKey.get(hostPortKey)) || redisClient.getOptions();
      deleteClientByHostPortKey(hostPortKey, context);
      return this.createNewClient(options, context);
    }

    context.trace(`Reusing open RedisClient instance for host (${host}) & port (${port})`);
    return redisClient;
  }

  /**
   * A convenience method that simply first executes `setRedisClient` and then executes `replaceRedisClientIfUnusable`.
   * Logging should be configured before calling this function (see {@linkcode logging-utils/logging#configureLogging})
   *
   * @param {RedisClientOptions|undefined} [redisClientOptions] - the optional RedisClient constructor options to use
   * @param {RedisClientCacheAware} context - the context to use
   * @returns {Promise.<RedisClient>} a promise of a usable, previously or newly cached RedisClient instance
   */
  setRedisClientAndReplaceIfUnusable(redisClientOptions, context) {
    const redisClient = this.setRedisClient(redisClientOptions, context);
    return this.replaceRedisClientIfUnusable(redisClient, redisClientOptions, context);
  }

  /**
   * First uses the `isRedisClientUsable` function to determine whether the given RedisClient instance is usable or not
   * and then, if the given redis client is still usable, it returns it; otherwise, if not, quits and replaces the
   * unusable old client with a new one.
   * @param {RedisClient} redisClient - the RedisClient instance to check
   * @param {RedisClientOptions} redisClientOptions - RedisClient constructor options
   * @param {Logger} context - the context to use
   * @return {Promise.<RedisClient>}
   */
  replaceRedisClientIfUnusable(redisClient, redisClientOptions, context) {
    return this.isRedisClientUsable(redisClient, context).then(usable => {
      const [host, port] = redisClient.resolveHostAndPort();

      if (usable) {
        context.trace(`Reusing USABLE RedisClient instance for host (${host}) & port (${port})`);
        return redisClient;
      }

      // Old redis client is no longer usable, so create and cache a new redis client
      context.trace(`Replacing UNUSABLE RedisClient instance for host (${host}) & port (${port}) with a new one`);
      const hostPortKey = getHostPortKey(host, port);
      const options = redisClientOptions || (hostPortKey && redisClientOptionsByHostPortKey.get(hostPortKey)) ||
        redisClient.getOptions();

      deleteClientByHostPortKey(hostPortKey, context);
      this.disconnectClient(redisClient, context).catch(e => (context || console).error(e));

      return this.createNewClient(options, context);
    });
  }

  /**
   * Determines whether the given RedisClient instance is usable or not by attempting to invoke `info` with it. If the
   * asynchronous call works, then this function returns true; otherwise it returns false.
   * @param {RedisClient} redisClient - the RedisClient instance to check
   * @param {RedisClientCacheAware} context - the context to use
   * @return {Promise.<boolean>} a promise of true if the asynchronous test succeeds; or a promise of false otherwise
   */
  isRedisClientUsable(redisClient, context) {
    const [host, port] = redisClient.resolveHostAndPort();

    if (!redisClient.isClosing()) {
      if (!redisClient.pingAsync) {
        this.promisifyClientFunction('ping', context);
      }
      // return redisClient.pingAsync('PONG').then(
      return redisClient.pingAsync("PONG").then(
        pong => {
          context.trace(`Ping passed for RedisClient instance for host (${host}) & port (${port}) - ping (${JSON.stringify(pong)})`);
          return true;
        },
        err => {
          context.error(`Ping failed for RedisClient instance for host (${host}) & port (${port})`, err);
          return false;
        }
      );
    }

    context.trace(`Cannot ping CLOSED RedisClient instance for host (${host}) & port (${port})`);
    return Promise.resolve(false);
  }

  /**
   * Creates and caches a new RedisClient instance.
   * @param {RedisClientOptions} redisClientOptions - RedisClient constructor options
   * @param {RedisClientCacheAware} context - the context to use
   * @returns {RedisClient} a new & newly cached RedisClient instance
   */
  createNewClient(redisClientOptions, context) {
    const self = this;
    const redis = this.redis;

    // Resolves the host & port (and adds any missing host and/or port defaults to the options)
    const [host, port] = resolveHostAndPortFromOptions(redisClientOptions, redis.defaultHost, redis.defaultPort, context);

    // Create a new RedisClient instance with the modified options
    const startMs = Date.now();

    // Create a snapshot of the options actually used - in case the redisClientOptions are mutated during the create
    const optionsUsed = copy(redisClientOptions, deep);

    const redisClient = redis.createClient(redisClientOptions);
    context.trace(`Created a new redis client for host (${host}) & port (${port}) - took ${Date.now() - startMs} ms`);

    // Cache the new instance and the options used to create it
    const hostPortKey = getOrSetHostPortKey(host, port);
    redisClientsByHostPortKey.set(hostPortKey, redisClient);
    redisClientOptionsByHostPortKey.set(hostPortKey, optionsUsed);

    const onConnect = () => {
      context.trace(`Redis client connection to host (${host}) & port (${port}) has CONNECTED - took ${Date.now() - startMs} ms`);
    };

    const onReady = () => {
      context.trace(`Redis client connection to host (${host}) & port (${port}) is READY - took ${Date.now() - startMs} ms`);
    };

    const onReconnecting = () => {
      context.trace(`Redis client connection to host (${host}) & port (${port}) is RECONNECTING`);
    };

    const onError = err => {
      context.error(`Redis client connection to host (${host}) & port (${port}) hit error`, err);
      self.disconnectClient(redisClient, context).catch(e => context.error(e));
    };

    const onClientError = err => {
      context.error(`Redis client connection to host (${host}) & port (${port}) hit client error`, err);
    };

    const onEnd = () => {
      context.trace(`Redis client connection to host (${host}) & port (${port}) has CLOSED`);
    };

    redisClient.addEventListeners(onConnect, onReady, onReconnecting, onError, onClientError, onEnd);

    return redisClient;
  }

  /**
   * Clears the RedisClient instance and options caches according to the currently cached host-port keys.
   * @param {RedisClientCacheAware} context - the context to use
   * @returns {Promise.<Array.<{host: string, port: (number|string), deleted: boolean, disconnected: (boolean|undefined)}>>}
   * a promise of an array of results - one for each host & port combination cleared from the cache
   */
  clearCache(context) {
    const hostPortKeys = listHostPortKeys();
    const disconnectPromises = hostPortKeys.map(hostPortKey => {
      const redisClient = redisClientsByHostPortKey.get(hostPortKey);
      const deleted = deleteClientByHostPortKey(hostPortKey, context);
      if (redisClient) {
        return this.disconnectClient(redisClient, context).then(
          disconnected => {
            return {
              host: hostPortKey.host,
              port: hostPortKey.port,
              deleted: deleted,
              disconnected: disconnected
            };
          },
          err => {
            context.error(err);
            return {
              host: hostPortKey.host,
              port: hostPortKey.port,
              deleted: deleted,
              disconnected: false
            };
          }
        );
      } else {
        return {
          host: hostPortKey.host,
          port: hostPortKey.port,
          deleted: deleted
        };
      }
    });

    return Promise.all(disconnectPromises);
  }


  // /**
  //  * Deletes/un-caches and disconnects the given redis client.
  //  * @param {RedisClient} redisClient - the redis client to un-cache and disconnect
  //  * @param {RedisClientCacheAware} context - the context to use
  //  * @returns {[boolean, Promise]} an array containing: true if existed and deleted, otherwise false; followed by a
  //  *          promise that will complete with the result of the asynchronous disconnection attempt
  //  */
  // deleteAndDisconnectClient(redisClient, context) {
  //   if (redisClient) {
  //     const hostPortKey = this.resolveRedisClientHostPortKey(redisClient);
  //     const deleted = !!hostPortKey && deleteClientByHostPortKey(hostPortKey, context);
  //     const disconnectPromise = this.disconnectClient(redisClient, context)
  //       .catch(err => (context || console).error(err));
  //     return [deleted, disconnectPromise];
  //   }
  //   return [false, undefined];
  // }

  /**
   * Deletes/un-caches and disconnects the given redis client.
   * @param {string} host - the host name (or IP address) of a redis server
   * @param {number|string} port - the port of a redis server
   * @param {RedisClientCacheAware} context - the context to use
   * @returns {{host: string, port: (number|string), deleted: boolean, disconnectPromise: (Promise.<boolean>|undefined)}}
   * an array containing: true if existed and deleted, otherwise false; followed by a promise that will complete with the
   * result of the asynchronous disconnection attempt
   */
  deleteAndDisconnectRedisClient(host, port, context) {
    let hostPortKey = getHostPortKey(host, port);
    const redisClient = hostPortKey ? redisClientsByHostPortKey.get(hostPortKey) : undefined;
    const deleted = !!hostPortKey && deleteClientByHostPortKey(hostPortKey, context);
    const disconnectPromise = redisClient ?
      this.disconnectClient(redisClient, context).catch(err => (context || console).error(err)) : undefined;
    return {host, port, deleted, disconnectPromise};
  }

  /**
   * Attempts to disconnect the given RedisClient instance from its server.
   * @param {RedisClient} redisClient
   * @param {RedisClientCacheAware} context - the context to use
   * @return {Promise.<boolean>} a promise of true if quit succeeds on the redis client; false otherwise
   */
  disconnectClient(redisClient, context) {
    if (redisClient) {
      const [host, port] = redisClient.resolveHostAndPort();

      if (!redisClient.isClosing()) {
        const startMs = Date.now();
        try {
          // return redisClient.quitAsync().then( // NB - using end(flush=true), because quit does NOT work properly (intermittently server refuses to stop even after quitting all)!
          if (!redisClient.endAsync) {
            this.promisifyClientFunction('end', context);
          }
          return redisClient.endAsync(true).then(
            result => {
              context.trace(`Disconnected redis client from host (${host}) & port (${port}) - (${result}) - took ${Date.now() - startMs} ms`);
              return true;
            },
            err => {
              context.error(`Failed to disconnect redis client from host (${host}) & port (${port}) (1) - took ${Date.now() - startMs} ms`, err);
              return false;
            }
          );
        } catch (err) {
          context.error(`Failed to disconnect redis client from host (${host}) & port (${port}) (2) - took ${Date.now() - startMs} ms`, err);
          return Promise.resolve(false);
        }
      }
      return Promise.resolve(true); // already closing
    }
    return Promise.resolve(undefined); // no client
  }
}

module.exports = RedisClientCache;

/**
 * Returns the existing host-port key object for the given host & port (if any) or undefined (if none).
 * @param {string} host - the host name (or IP address) of a redis server
 * @param {number|string} port - the port of a redis server
 * @returns {HostPortKey|undefined} a host-port key object (if one exists); otherwise undefined
 */
function getHostPortKey(host, port) {
  return hostPortKeysByHostPort.get(`${host}:${port}`);
}

/**
 * Returns the existing host-port key object or sets & returns a new host-port key object for the given host & port.
 * @param {string} host - the host name (or IP address) of a redis server
 * @param {number|string} port - the port of a redis server
 * @returns {HostPortKey} a host-port key object
 */
function getOrSetHostPortKey(host, port) {
  const hostPort = `${host}:${port}`;
  let hostPortKey = hostPortKeysByHostPort.get(hostPort);
  if (!hostPortKey) {
    hostPortKey = {host: host, port: port};
    hostPortKeysByHostPort.set(hostPort, hostPortKey);
  }
  return hostPortKey;
}

/**
 * Lists the currently cached host-port keys (if any).
 * @return {Array.<HostPortKey>} a list of host-port keys
 */
function listHostPortKeys() {
  const hostPortKeys = new Array(hostPortKeysByHostPort.size);
  const iter = hostPortKeysByHostPort.values();
  let v = iter.next();
  let i = -1;
  while (!v.done) {
    hostPortKeys[++i] = v.value;
    v = iter.next();
  }
  return hostPortKeys;
}

/**
 * Deletes/un-caches the RedisClient instance cached for the given host & port key (if any).
 * @param {HostPortKey} hostPortKey - the host-port key to use
 * @param {RedisClientCacheAware} context - the context to use
 * @returns {boolean} true if existed and deleted, otherwise false
 */
function deleteClientByHostPortKey(hostPortKey, context) {
  if (hostPortKey) {
    // Delete the redis client from the cache
    redisClientOptionsByHostPortKey.delete(hostPortKey);
    const deleted = redisClientsByHostPortKey.delete(hostPortKey);
    hostPortKeysByHostPort.delete(hostPortKey);
    if (deleted) {
      context.trace(`Deleted redis client for host(${hostPortKey.host}) & port (${hostPortKey.port}) from cache`);
    }
    return deleted;
  }
  return false;
}

// /**
//  * Deletes/un-caches the RedisClient instance cached for the given host & port (if any).
//  * @param {string} host - the host to use
//  * @param {number|string} port - the port to use
//  * @param {RedisClientCacheAware} context - the context to use
//  * @returns {boolean} true if existed and deleted, otherwise false
//  */
// function deleteClient(host, port, context) {
//   const hostPortKey = getHostPortKey(host, port);
//   return !!hostPortKey && deleteClientByHostPortKey(hostPortKey, context);
// }

/**
 * Resolves the host & port from the given RedisClient constructor options & if either the host or port is missing from
 * the options then it ALSO updates the given options with the configured Redis adapter's default host and/or port.
 * @param {Object} options - RedisClient constructor options
 * @param {string} defaultHost - the default host to use if no host specified
 * @param {number|string} defaultPort - the default port to use if no port specified
 * @param {RedisClientCacheAware} context - the context to use
 * @return {[string, number|string]} the host and port
 */
function resolveHostAndPortFromOptions(options, defaultHost, defaultPort, context) {
  let host = options.host;
  let port = options.port;

  if (!host) { // fallback to using default host
    host = defaultHost;
    options.host = host;
  }

  if (!port) { // fallback to using default port
    port = defaultPort;
    options.port = port;
  }

  return [host, port];
}