# Delorean telegram bot

[@delorean_bot](https://telegram.me/delorean_bot) sends you notifications in the future. 
Requirements: Node.js 0.12+, Redis 2.8+

Install dependencies:
```sh
npm install
```

Install [pm2](https://www.npmjs.com/package/pm2):
```sh
npm install -g pm2
```

Edit config:
```sh
vim src/node_modules/config.index.js
```

Run bot:
```
pm2 start process.json
```
