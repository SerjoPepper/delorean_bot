var bb = require('bot-brother');
var config = require('./config');
var chrono = require('chrono-node');
var timezoneDetector = require('./timezone-detector');
var redisNotifier = require('./redis-notifier');
var texts = require('./texts');
var moment = require('moment');
var mtz = require('moment-timezone');
var _s = require('underscore.string');
var _ = require('lodash');

var bot = module.exports = bb({
  key: config.bot.key,
  sessionManager: bb.sessionManager.redis(config.redis)
  webHook: config.bot.webHook,
  polling: config.bot.polling
})
.texts(texts.ru, {locale: 'ru'})
.texts(texts.en, {locale: 'en'})
.texts(texts.default)
.keyboard([
  [{'button.like': {
    go: 'rate',
    isShown: function (ctx) {
      return !ctx.session.rate && ctx.session.notificationsCounter > 1 && ctx.session.createDate + 120e3 < Date.now();
    }
  }}],
  [{'button.add': {go: 'add'}}],
  [{'button.list': {
    go: 'list',
    isShown: function (ctx) {
      return ctx.notifications.length;
    }
  }}],
  [{'button.settings': {go: 'settings'}}]
])
.keyboard('backButton', [
  [{
    'button.back': {
      go: '$back',
      isShown: function (ctx) {
        return !ctx.hideBackButton;
      }
    }
  }]
])
.keyboard('cancelButton', [
  [{
    'button.cancel': {go: 'start'}
  }]
])
.use('before', bb.middlewares.typing())
.use('before', bb.middlewares.botanio(config.bot.botanio.key))
.use('before', function (ctx) {
  var now = Date.now();
  ctx.session.notifications = ctx.session.notifications || [];
  ctx.session.notifications = ctx.session.notifications.filter(function (n) {
    return n.ts * 1e3 >= now - 30e3;
  });

  ctx.notifications = ctx.session.notifications;
  ctx.session.notificationsCounter = ctx.session.notificationsCounter || 0;

  ctx.data.user = ctx.meta.user;
  ctx.data.totalCount =  ctx.notifications.length;
  ctx.session.createDate = ctx.session.createDate || Date.now();

  ctx.settings = ctx.settings || {};
  ctx.setLocale(ctx.session.locale || config.defaults.locale);
  ctx.timezone = ctx.session.timezone || config.defaults.timezone;

  if (!/^settings_/.test(ctx.command.name)) {
    if (!ctx.session.locale) {
      return ctx.go('settings_locale');
    }
    if (!ctx.session.timezone) {
      return ctx.go('settings_timezone');
    }
  }
});


bot.command('start')
.invoke(function (ctx) {
  return ctx.sendMessage('main.start');
});


bot.command('settings')
.invoke(function (ctx) {
  ctx.data.settings = {
    locale: ctx.getLocale(),
    timezone: ctx.timezone
  };
  return ctx.sendMessage('settings.main');
})
.keyboard([
  [{'button.locale': {go: 'settings_locale'}}],
  [{'button.timezone': {go: 'settings_timezone'}}],
  'backButton'
]);


// Setting timezone
// compliantKeyboard to get cityname and latlon answer
bot.command('settings_timezone', {compliantKeyboard: true})
.invoke(function (ctx) {
  if (!ctx.session.timezone) {
    ctx.hideBackButton = true;
  }
  return ctx.sendMessage('settings.timezone');
})
.answer(function (ctx) {
  return timezoneDetector(ctx.message.location || ctx.answer).then(function (timezone) {
    if (!timezone) {
      throw new Error('no timezone');
    }
    ctx.session.timezone = timezone;
    return ctx.sendMessage('answer.success').then(function () {
      return ctx.goBack();
    });
  }).catch(function (err) {
    console.error(err, err.stack);
    return ctx.repeat();
  });
})
.keyboard(['backButton']);


// Setting locale
bot.command('settings_locale')
.invoke(function (ctx) {
  if (!ctx.session.locale) {
    ctx.hideBackButton = true;
  }
  return ctx.sendMessage('settings.locale');
})
.answer(function (ctx) {
  ctx.session.locale = ctx.answer;
  ctx.setLocale(ctx.answer);
  return ctx.sendMessage('answer.success').then(function () {
    return ctx.goBack();
  });
})
.keyboard([[
    {'buttons.ru': 'ru'},
    {'buttons.en': 'en'},
  ],
  'backButton'
]);


bot.command('add', {compliantKeyboard: true})
.use('before', function (ctx) {
  ctx.hideKeyboard();
})
.invoke(function (ctx) {
  return ctx.sendMessage('main.add');
})
.answer(function (ctx) {
  if (!ctx.answer) {
    return;
  }
  var notifyOptions = getNotifyOptions(ctx.answer, ctx.timezone);
  if (notifyOptions) {
    var notification = addNotification(ctx.meta.chat.id, ctx.session, notifyOptions.text, notifyOptions.unixTimestamp, notifyOptions.expireOffset);
    ctx.data.addedTime = format(notification, ctx.timezone);
    return ctx.sendMessage('answer.added').then(function () {
      return ctx.go('start');
    });
  } else {
    return ctx.go('time', {args: [ctx.answer]});
  }
});


bot.command('time', {compliantKeyboard: true})
.use('before', function (ctx) {
  ctx.hideKeyboard();
})
.invoke(function (ctx) {
  var text = ctx.command.args[0];
  if (!text) {
    return;
  }
  return ctx.sendMessage('main.time');
})
.answer(function (ctx) {
  var text = ctx.command.args[0];
  var notifyOptions = getNotifyOptions(ctx.answer, ctx.timezone);
  if (!notifyOptions) {
    ctx.sendMessage('answer.incorrecttime');
    return ctx.sendMessage('main.formats')
    .then(function () {
      return ctx.repeat();
    });
  }
  var notification = addNotification(ctx.meta.chat.id, ctx.session, text, notifyOptions.unixTimestamp, notifyOptions.expireOffset);
  ctx.data.addedTime = format(notification, ctx.timezone);
  return ctx.sendMessage('answer.added').then(function () {
    return ctx.go('start');
  });
});


bot.command('list', {compliantKeyboard: true})
.invoke(function (ctx) {
  if (!ctx.notifications.length) {
    return ctx.sendMessage('main.nolist');
  }
  var message = '';
  ctx.notifications.forEach(function (notification, i) {
    message += (i + 1) + '. ' +
      _s.truncate(notification.text, 18) +
      ' (' + format(notification, ctx.timezone) +')' +
      '\n';
  });
  ctx.sendMessage(message).then(function () {
    ctx.sendMessage('main.remove');
  });
})
.answer(function (ctx) {
  if (isNaN(ctx.answer)) {
    return;
  }
  ctx.session.notifications.splice(Number(ctx.answer) - 1, 1);
  return ctx.sendMessage('answer.success').then(function () {
    ctx.repeat();
  });
})
.keyboard([
  'cancelButton'
]);


bot.command('help').invoke(function (ctx) {
  return ctx.sendMessage('main.help');
});


bot.command('formats').invoke(function (ctx) {
  return ctx.sendMessage('main.formats');
});

bot.command('rate')
.invoke(function (ctx) {
  return ctx.sendMessage('main.rate');
})
.answer(function (ctx) {
  if (ctx.answer != 'later') {
    ctx.session.rate = ctx.answer;
  }
  return ctx.go('start');
})
.keyboard([
  [{'button.rate.like': 'like'}],
  [{'button.rate.later': 'later'}],
  [{'button.rate.dislike': 'dislike'}]
]);


redisNotifier.on('expired', function (chatId, taskId) {
  bot.withContext(chatId, function (ctx) {
    taskId = Number(taskId);
    var notification = getNotification(ctx.session, taskId);
    if (notification) {
      removeNotification(ctx.session, taskId);
      ctx.data.totalCount =  ctx.notifications.length;
      return ctx.sendMessage(':bell: ' + notification.text);
    }
  });
})

function format (notification, timezone) {
  return mtz(notification.ts * 1e3).tz(timezone).format('DD.MM.YYYY HH:mm:ss');
}

function addNotification (chatId, session, text, unixTimestamp, expireOffset) {
  var id = ++session.notificationsCounter;
  var notification = {
    id: id,
    text: text,
    ts: unixTimestamp
  };
  session.notifications.push(notification);
  session.notifications.sort(function (a, b) {
    a.ts - b.ts;
  });
  redisNotifier.push(chatId, id, expireOffset);
  return notification;
}

function getNotification (session, id) {
  return _.find(session.notifications, {id: id});
}

function removeNotification (session, id) {
  _.remove(session.notifications, {id: id});
}

function getNotifyOptions (text, timezone) {
  var res;
  var resMoment;
  var options = {
    expireOffset: null, // expire offset in seconds
    unixTimestamp: null,
    text: text
  };
  try {
    res = chrono.parse(text);
  } catch (e) {
    console.error(e, e.stack);
    return null;
  }

  if (!res || !res.length) {
    return null;
  }

  res = res[res.length - 1];
  resDate = chrono.parseDate(res.text);

  if (res.tags.RUDeadlineFormatParser || res.tags.ENDeadlineFormatParser) {
    resMoment = moment(resDate);
    options.unixTimestamp = resMoment.unix();
    options.expireOffset = resMoment.diff(new Date, 'seconds');
  } else {
    var offset = resDate.getTimezoneOffset();
    var realOffset = mtz(resDate).tz(timezone).utcOffset();
    resMoment = moment(Number(resDate) - realOffset * 60e3 - offset * 60e3);
    options.unixTimestamp = resMoment.unix();
    options.expireOffset = resMoment.diff(new Date, 'seconds');
  }

  if (text.length - (res.index + res.text.length) <= 1) {
    options.text = _s(options.text).trim().splice(res.index, res.text.length).value();
  }

  if (options.expireOffset < 0) {
    options.expireOffset += 24 * 3600;
    options.unixTimestamp += 24 * 3600;
    if (options.expireOffset <= 0) {
      return null;
    }
  }

  return options;
}
