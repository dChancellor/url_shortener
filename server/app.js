const path = require('path');
const rfs = require('rotating-file-stream');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const passport = require('passport');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

const errors = require('./middlewares/error');
const { db, cookieKey, environment, client } = require('./util/config');

const app = express();
const router = require('./router/router');

app.use(express.json());
app.use(helmet());
var accessLogStream = rfs.createStream('access.log', {
  interval: '1d', // rotate daily
  path: path.join(__dirname, 'log'),
});
app.use(morgan('combined', { stream: accessLogStream }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Origin', client);
  // res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
  next();
});

app.set('trust proxy');
app.use(
  session({
    name: 'sessionAuth',
    secret: cookieKey,
    resave: true,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }, // 1 Day
  }),
);
app.use(passport.initialize());
app.use(passport.session());

const auth = environment === 'test' ? require('./tests/mockAuth') : require('./middlewares/auth');
// const auth = require('./tests/mockAuth');
app.use(async (req, res, next) => {
  await db.connect();
  next();
});
app.use('/oauth', auth);
app.use(
  '/auth',
  slowDown({ windowMs: 30 * 1000, delayAfter: 20, delayMs: 500 }),
  rateLimit({ windowMs: 30 * 1000, max: 20 }),
  function (req, res, next) {
    if (req.user) {
      next();
    } else {
      res.redirect('/oauth/google');
    }
  },
);
app.get('/user', (req, res) => {
  res.locals = { name: req.user };
  res.status(200).send(res.locals);
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect(client);
});

app.use('/failedLogin', (req, res) => {
  res.status(401).json({ message: 'Authentication failed.' });
});

app.use('/', router);

app.use(errors.notFound);
app.use(errors.errorHandler);

module.exports = app;
