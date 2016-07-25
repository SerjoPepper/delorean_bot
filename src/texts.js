var fs = require('fs');
var yaml = require('js-yaml');
var config = require('./config');
var localeDir = __dirname + '/locale/';

fs.readdirSync(localeDir).forEach(function (file) {
  var arr = file.split('.')
  if (arr[1] === 'yaml') {
    module.exports[arr[0]] = yaml.load(fs.readFileSync(localeDir + file).toString())
  }
});