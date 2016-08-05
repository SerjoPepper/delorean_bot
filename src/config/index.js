var _ = require('lodash');
var path = require('path')
module.exports = {

  bot: {
    key: '<API_KEY>',
    botanio: {
      key: '<BOTANIO_KEY>'
    },
    polling: {
      interval: 100,
      timeout: 0
    }
  },
  redis: {
    port: 6379,
    host: '127.0.0.1',
    db: 1
  },
  dir: {
    root: path.resolve(__dirname, '../../../')
  },
  defaults: {
    locale: 'ru',
    timezone: 'Europe/Moscow'
  },
  googleMapsKey: '<GOOGLE_MAPS_KEY>',

};

// try to require local config
try {
  _.merge(module.exports, require('./local'));
} catch (e) {

}
