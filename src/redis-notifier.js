var util = require('util');
var EventEmitter = require('events');
var config = require('./config');
var promise = require('bluebird');
var db = config.redis.db || 0;
var prefix = 'exp_notification';
var redis = require('redis');

promise.promisifyAll(redis);

function Notifier () {
  EventEmitter.call(this);
  this.client = redis.createClient(config.redis);
  this.subClient = redis.createClient(config.redis);

  if (config.redis.db) {
    this.client.select(config.redis.db);
    this.subClient.select(config.redis.db);
  }

  this.subClient.subscribe('__keyevent@' + db + '__:expired');
  this.client.config('SET', 'notify-keyspace-events', 'Ex');

  this.subClient.on('message', this.onMessage.bind(this));
}

util.inherits(Notifier, EventEmitter);

Notifier.prototype.onMessage = function (channel, message) {
  var arr = message.split(':');
  if (arr[0] === prefix) {
    this.emit('expired', arr[1], arr[2]);
  }
};

Notifier.prototype.push = function (chatId, taskId, duration) {
  this.client.setAsync(this.getKey(chatId, taskId), 1, 'EX', duration);
};

Notifier.prototype.getKey = function (chatId, taskId) {
  return prefix + ':' + chatId + ':' + taskId;
}

module.exports = new Notifier();