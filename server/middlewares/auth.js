const { Router } = require('express');
const router = Router();

const passport = require('passport');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
const { db, googleAuthStrategy } = require('../util/config');

require('dotenv').config();

passport.use(
  new GoogleStrategy(googleAuthStrategy, async function (req, accessToken, refreshToken, profile, done) {
    let user = await db.getUserByGoogleId(profile.id);
    if (user) return done(null, user);
    const failedUser = {
      id: profile.id,
      displayName: profile.displayName,
      email: profile.emails[0].value,
    };
    await db.addFailedLogin(failedUser);
    return done(null, false);
  }),
);

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (_id, done) => {
  db.getUserById(_id).then(({id}) => {
    done(null, id);
  });
});

router.get(
  '/google/callback',
  passport.authenticate('google', {
    successRedirect: '/auth/newSlug',
    failureRedirect: '/oauth/google',
  }),
);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email', 'openid'] }));

router.get('/logout', (req, res) => {
  req.logout();
  res.redirect(`/`);
});

module.exports = router;
