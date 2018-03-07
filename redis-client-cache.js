'use strict';

const copying = require('core-functions/copying');
const copy = copying.copy;
const deep = {deep: true};

const Strings = require('core-functions/strings');
const stringify = Strings.stringify;

const Promises = require('core-functions/promises');

const deepEqual = require('deep-equal');
const strict = {strict: true};

const redis = require('redis');
const RedisClient = redis.RedisClient;
if (!RedisClient.prototype.quitAsync) {
  RedisClient.prototype.quitAsync = Promises.wrap(RedisClient.prototype.quit);
}

// Module-scope cache of RedisClient instances by host-port key
let redisClientsByHostPortKey = new WeakMap();

// Module-scope cache of the RedisClient options used to construct the RedisClient instances by host-port key
let redisClientOptionsByHostPortKey = new WeakMap();

// A map of host-port key objects by host-port, which is only needed, because WeakMaps can ONLY have object keys
const hostPortKeysByHostPort = new Map();

const DEFAULT_REDIS_HOST = "127.0.0.1";
const DEFAULT_REDIS_PORT = 6379;

exports.DEFAULT_REDIS_HOST = DEFAULT_REDIS_HOST;
exports.DEFAULT_REDIS_PORT = DEFAULT_REDIS_PORT;

/**
 * A simple module-scope cache of RedisClient instances by host & port (primarily for AWS Lambda use)
 * @module redis-client-cache/redis-client-cache
 * @author Byron du Preez
 */
exports._$_ = '_$_'; //IDE workaround

exports.setRedisClient = setRedisClient;
exports.getRedisClient = getRedisClient;
exports.getRedisClientOptionsUsed = getRedisClientOptionsUsed;
exports.deleteRedisClient = deleteRedisClient;
exports.configureRedisClient = configureRedisClient;
exports.clearCache = clearCache;

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
 * @param {Object|undefined} [redisClientOptions] - the optional RedisClient constructor options to use
 * @param {string|undefined} [redisClientOptions.host] - an optional host to use (defaults to 127.0.0.1 if unspecified)
 * @param {string|number|undefined} [redisClientOptions.port] - an optional port to use (defaults to 6379 if unspecified)
 * @param {Object|undefined} [context] - the context, which is just used for logging
 * @returns {RedisClient} a cached or new RedisClient instance created and cached for the specified host & port
 */
function setRedisClient(redisClientOptions, context) {
  // If no options were specified, then use an empty object
  const options = redisClientOptions ? copy(redisClientOptions, deep) : {};

  // If no host and/or port were specified in the given redis client constructor options, then set them to the defaults
  let host = options.host;
  let port = options.port;
  if (!host) { // fallback to using default host
    host = DEFAULT_REDIS_HOST;
    options.host = host;
  }
  if (!port) { // fallback to using default port
    port = DEFAULT_REDIS_PORT;
    options.port = port;
  }
  const hostPortKey = getOrSetHostPortKey(host, port);

  // Check if there is already a RedisClient instance cached for this host & port
  let redisClient = redisClientsByHostPortKey.get(hostPortKey);
  if (redisClient) {
    const debug = (context && context.debug) || console.log.bind(console);
    // If caller specified no options, then accept the cached instance for the current region (regardless of its options)
    if (!redisClientOptions || Object.getOwnPropertyNames(redisClientOptions).length === 0) {
      debug(`Reusing cached RedisClient instance for host (${host}) & port (${port}) with ANY options, since no options were specified`);
      return redisClient;
    }
    // If caller ONLY specified a host & port, then accept the cached instance for the host & port (regardless of its options)
    if (Object.getOwnPropertyNames(options).length === 2) {
      debug(`Reusing cached RedisClient instance for host (${host}) & port (${port}) with ANY options, since only host & port were specified`);
      return redisClient;
    }
    // If the given options match the options used to construct the cached instance, then returns the cached instance
    const optionsUsed = redisClientOptionsByHostPortKey.get(hostPortKey);

    if (deepEqual(optionsUsed, options, strict)) {
      // Use the cached instance if its config is identical to the modified options
      debug(`Reusing cached RedisClient instance for host (${host}) & port (${port}) with identical options`);
      return redisClient;
    } else {
      const logger = context && context.warn ? context : console;
      logger.warn(`Replacing cached RedisClient instance (${stringify(optionsUsed)}) for host (${host}) & port (${port}) with new instance (${stringify(options)})`);
    }
  }
  // Create a new RedisClient instance with the modified options
  redisClient = new RedisClient(options);
  // Cache the new instance and the options used to create it
  redisClientsByHostPortKey.set(hostPortKey, redisClient);
  redisClientOptionsByHostPortKey.set(hostPortKey, options);

  return redisClient;
}

function quitRedisClientIfExists(hostPortKey, context) {
  const redisClient = redisClientsByHostPortKey.get(hostPortKey);
  if (redisClient) {
    quitRedisClient(redisClient, context);
  }
  return redisClient;
}

/**
 * Deletes the RedisClient instance cached for the given host & port (if any) and returns true if successfully deleted
 * or false if it did not exist.
 * @param {string} host - the host to use
 * @param {string|number} port - the port to use
 * @param {Object|undefined} [context] - the context, which is just used for logging
 * @returns {boolean} true if existed and deleted; false otherwise
 */
function deleteRedisClient(host, port, context) {
  const hostPortKey = getHostPortKey(host, port);
  if (hostPortKey) {
    quitRedisClientIfExists(hostPortKey, context);
    redisClientOptionsByHostPortKey.delete(hostPortKey);
    return redisClientsByHostPortKey.delete(hostPortKey);
  }
  return false;
}

/**
 * Gets the RedisClient instance cached for the given host & port (if specified and if previously cached); otherwise for
 * the default host and/or port (if previously cached); otherwise returns undefined.
 * @param {string} host - the host to use
 * @param {string|number} port - the port to use
 * @returns {RedisClient|undefined} the RedisClient instance cached for the given or default host & port (if any);
 * otherwise returns undefined
 */
function getRedisClient(host, port) {
  if (!host) host = DEFAULT_REDIS_HOST;
  if (!port) port = DEFAULT_REDIS_PORT;
  const hostPortKey = getHostPortKey(host, port);
  return hostPortKey ? redisClientsByHostPortKey.get(hostPortKey) : undefined;
}

/**
 * Gets the options used to construct the RedisClient instance cached for the given host & port (if specified and if
 * previously cached); otherwise for the default host & port (if previously cached); otherwise returns undefined.
 * @param {string} host - the host to use
 * @param {string|number} port - the port to use
 * @returns {RedisClient|undefined} the options used to construct the RedisClient instance cached for the given or
 * default host & port (if any); otherwise returns undefined
 */
function getRedisClientOptionsUsed(host, port) {
  const hostPortKey = getHostPortKey(host, port);
  return hostPortKey ? redisClientOptionsByHostPortKey.get(hostPortKey) : undefined;
}

/**
 * Creates and caches a new RedisClient instance with the given RedisClient constructor options for either the host &
 * port specified in the given options (if any and host & port specified) or for the default host & port (if not) UNLESS
 * a previously cached RedisClient instance exists and the given options either match the options used to construct it
 * or are undefined, empty or only host & port were specified, in which case no new instance will be created and the
 * cached instance will be returned instead. If the given options do not match existing options and are not empty and
 * not only region, then logs a warning that the previously cached RedisClient instance is being replaced and returns
 * the new RedisClient instance.
 *
 * Logging should be configured before calling this function (see {@linkcode logging-utils/logging#configureLogging})
 *
 * Configures the given context, if it does not already have a context.redisClient, with the cached RedisClient instance
 * for either the host & port specified in the given default constructor options (if any and host & port specified) or
 * for the default host & port (if not); otherwise with a new RedisClient instance created and cached by
 * {@linkcode setRedisClient} for the specified or default host & port using the given default RedisClient constructor
 * options.
 *
 * Note that the given default RedisClient constructor options will ONLY be used if no cached RedisClient instance exists.
 *
 * Logging should be configured before calling this function (see {@linkcode logging-utils/logging#configureLogging})
 *
 * @param {Object|RedisClientAware} context - the context to configure
 * @param {Object|undefined} [redisClientOptions] - the optional RedisClient constructor options to use if no cached
 *        RedisClient instance exists
 * @param {string|undefined} [redisClientOptions.host] - an optional host to use instead of the default host
 * @param {string|number|undefined} [redisClientOptions.port] - an optional port to use instead of the default port
 * @returns {RedisClientAware} the given context configured with a RedisClient instance
 */
function configureRedisClient(context, redisClientOptions) {
  if (!context.redisClient) {
    context.redisClient = setRedisClient(redisClientOptions, context);
  }
  return context;
}

/**
 * Clears the RedisClient instance and options caches according to the currently cached host-port keys.
 */
function clearCache() {
  listHostPortKeys().forEach(hostPortKey => {
    quitRedisClientIfExists(hostPortKey, context);
    redisClientsByHostPortKey.delete(hostPortKey);
    redisClientOptionsByHostPortKey.delete(hostPortKey);
  });
}

/**
 * Returns the existing host-port key object for the given host & port (if any) or undefined (if none).
 * @param {string} host - the host name (or IP address) of a redis server
 * @param {string|number} port - the port of a redis server
 * @returns {{region: string}|undefined} a region key object (if one exists); otherwise undefined
 */
function getHostPortKey(host, port) {
  const hostPort = `${host}:${port}`;
  return hostPortKeysByHostPort.get(hostPort);
}

/**
 * Returns the existing host-port key object or sets & returns a new host-port key object for the given region name.
 * @param {string} host - the host name (or IP address) of a redis server
 * @param {string|number} port - the port of a redis server
 * @returns {{host: string, port: string|number}} a host-port key object
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
 * @return {Array.<{host: string, port: string|number}>} a list of host-port keys
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
 * Attempts to quit the given RedisClient instance.
 * @param {RedisClient} redisClient
 * @param {Object|undefined} [context] - the context, which is just used for logging
 * @return {Promise.<boolean>} a promise of true if quit succeeds on the redis client; false otherwise
 */
function quitRedisClient(redisClient, context) {
  if (redisClient) {
    const startMs = Date.now();
    const connectionOptions = redisClient.connection_options;
    const host = connectionOptions && connectionOptions.host;
    const port = connectionOptions && connectionOptions.port;
    try {
      return redisClient.quitAsync().then(
        r => {
          context.trace(`Quit redis client connected to host (${host}) & port (${port}) - (${r}) - took ${Date.now() - startMs} ms`);
          return true;
        },
        err => {
          context.error(`Failed to quit redis client connected to host (${host}) & port (${port}) (1) - took ${Date.now() - startMs} ms`, err);
          return false;
        }
      );
    } catch (err) {
      context.error(`Failed to quit redis client connected to host (${host}) & port (${port}) (2) - took ${Date.now() - startMs} ms`, err);
      return Promise.reject(false);
    }
  }
}