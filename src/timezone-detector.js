var _s = require('underscore.string');
var _ = require('lodash');
var config = require('./config');
var cache = require('pcacher')({redis: config.redis});
var request = require('request');
var promise = require('bluebird');
var dot = require('dot-object');
var timezoner = require('timezoner');

promise.promisifyAll(request);

module.exports = function (query) {
  return promise.try(function () {
    if (_.isObject(query)) {
      return [query.latitude, query.longitude];
    }
    if (!_.isString(query)){
      return query;
    }
    var key = config.googleMapsKey;
    var geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json?language=en&key=' + key + '&address=' + encodeURIComponent(query);
    return cache.memoize(geocodeUrl, '30d', function () {
      return request.getAsync(geocodeUrl).get('body').then(function (body) {
        var location = JSON.parse(body).results[0].geometry.location
        return [location.lat, location.lng]
      });
    })
  }).then(function (ll) {
    return cache.memoize('timezone:' + ll.join(','), '30d', function () {
      return promise.fromNode(function (cb) {
        timezoner.getTimeZone(ll[0], ll[1], cb);
      }).get('timeZoneId');
    });
  });
}