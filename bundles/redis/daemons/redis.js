
// Require dependencies
const Daemon = require('daemon');

// require pubsub
const pubsub = require('redis/pubsub/redis');

/**
 * Build riot dameon class
 *
 * @priority 10000
 */
class RiotDaemon extends Daemon {
  /**
   * Construct riot daemon class
   *
   * @param {eden} eden
   */
  constructor() {
    // Run super
    super();

    // Set eden view
    this.eden.register('pubsub', pubsub);
  }
}

/**
 * Export riot daemon class
 *
 * @type {RiotDaemon}
 */
module.exports = RiotDaemon;
