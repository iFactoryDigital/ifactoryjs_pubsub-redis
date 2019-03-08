
// require dependencies
const redis  = require('redis');
const Events = require('events');
const config = require('config');

/**
 * create pubsub class
 */
class RedisPubsub {
  /**
   * construct redis pubsub
   */
  constructor() {
    // bind on/off methods
    this.on = this.on.bind(this);
    this.off = this.off.bind(this);
    this.once = this.once.bind(this);
    this.emit = this.emit.bind(this);

    // bind get/set methods
    this.get = this.get.bind(this);
    this.set = this.set.bind(this);
    this.del = this.del.bind(this);

    // bind lock methods
    this.lock = this.lock.bind(this);
    this.unlock = this.unlock.bind(this);

    // create clients
    this.__clients = {
      pub   : redis.createClient(),
      sub   : redis.createClient(),
      lock  : redis.createClient(),
      cache : redis.createClient(),
    };
    this.__listeners = new Map();

    // get prefix
    this.__prefix = config.get('redis.prefix') || config.get('domain');

    // set events
    this.__events = new Events();

    // add listener
    this.__clients.sub.on('message', (channel, data) => {
      // get key
      const key = channel.split(`${this.__prefix}.`);

      // remove first
      key.shift();

      // emit event
      this.__events.emit(key.join(`${this.__prefix}.`), ...(JSON.parse(data)));
    });
  }


  // ////////////////////////////////////////////////////////////////////////////
  //
  // ON/OFF METHODS
  //
  // ////////////////////////////////////////////////////////////////////////////

  /**
   * gets from redis cache
   *
   * @param  {String} key
   *
   * @return {*}
   */
  on(key, fn) {
    // on event
    this.__events.on(key, fn);

    // subscribe to event
    if (this.__events.listenerCount(key) === 1) {
      // subscribe to client
      this.__clients.sub.subscribe(`${this.__prefix}.${key}`);
    }
  }

  /**
   * gets from redis cache
   *
   * @param  {String} key
   *
   * @return {*}
   */
  off(key, fn) {
    // on event
    this.__events.removeListener(key, fn);

    // unsubscribe on no listeners left
    if (!this.__events.listenerCount(key)) {
      // subscribe to event
      this.__clients.sub.unsubscribe(`${this.__prefix}.${key}`);
    }
  }

  /**
   * once value
   *
   * @param  {String}   key
   * @param  {Function} fn
   *
   * @return {*}
   */
  once(key, fn) {
    // once
    const once = (...args) => {
      // remove listener
      this.off(key, once);

      // do function once
      fn(...args);
    };

    // on event
    this.on(key, once);
  }

  /**
   * emits to redis
   *
   * @param  {String} key
   *
   * @return {*}
   */
  emit(key, ...args) {
    // publish value
    this.__clients.pub.publish(`${this.__prefix}.${key}`, JSON.stringify(args));
  }


  // ////////////////////////////////////////////////////////////////////////////
  //
  // GET/SET METHODS
  //
  // ////////////////////////////////////////////////////////////////////////////

  /**
   * gets from redis cache
   *
   * @param  {String} key
   *
   * @return {*}
   */
  get(key) {
    // get from cache
    return new Promise(resolve => this.__clients.cache.get(`${this.__prefix}.${key}`, (err, data) => {
      // return resolved
      resolve(JSON.parse(data));
    }));
  }

  /**
   * gets from redis cache
   *
   * @param  {String} key
   *
   * @return {*}
   */
  set(key, value) {
    // get from cache
    return new Promise(resolve => this.__clients.cache.set(`${this.__prefix}.${key}`, JSON.stringify(value), resolve));
  }

  /**
   * deletes by key
   *
   * @param  {String} key
   *
   * @return {Promise}
   */
  async del(key) {
    // Set promise
    const keys = await new Promise((resolve, reject) => {
      // Return locks
      this.__clients.cache.keys(`${this.__prefix}.${key}`, (err, lockKeys) => {
        // Check error
        if (err !== null) {
          // Reject
          return reject(err);
        }

        // Resolve
        return resolve(lockKeys);
      });
    });

    // loop keys
    await Promise.all(keys.map((item) => {
      // resolve reject
      return new Promise((resolve, reject) => {
        // delete keys
        this.__clients.cache.del(item, (err, res) => {
          // reject
          if (err) return reject(err);

          // resolve
          resolve(res);
        });
      });
    }));

    // resolve reject
    return new Promise((resolve, reject) => {
      // delete keys
      this.__clients.cache.del(key, (err, res) => {
        // reject
        if (err) return reject(err);

        // resolve
        resolve(res);
      });
    });
  }


  // ////////////////////////////////////////////////////////////////////////////
  //
  // LOCK METHODS
  //
  // ////////////////////////////////////////////////////////////////////////////

  /**
   * create lock with timeout
   *
   * @param  {String}  key
   * @param  {Integer} timeout
   *
   * @return {Promise}
   */
  lock(key, timeout = 5000) {
    // get lock timeout
    const lockTimeout = (Date.now() + timeout + 1);

    // return lock promise
    return new Promise((resolve) => {
      // locking
      this.__clients.lock.set(`${this.__prefix}.lock.${key}`, lockTimeout, 'PX', timeout, 'NX', (err, result) => {
        // check error
        if (err || result === null) {
          return setTimeout(() => {
          // retry
            this.lock(key, timeout).then(resolve);
          }, 50);
        }

        // resolve
        resolve(() => {
          // return promise
          return new Promise((res) => {
            // delete
            this.__clients.lock.del(`${this.__prefix}.lock.${key}`, () => res());
          });
        });
      });
    });
  }

  /**
   * unlocks specific key
   *
   * @param  {String} key
   *
   * @return {*}
   */
  unlock(key) {
    // return promise
    return new Promise((res) => {
      // delete
      this.__clients.lock.del(`${this.__prefix}.lock.${key}`, () => res());
    });
  }
}

/**
 * create pubsub
 *
 * @type {RedisPubsub}
 */
exports = module.exports = new RedisPubsub();
