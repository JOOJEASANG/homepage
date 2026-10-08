// Dedicated deployment entrypoint for customer lookup endpoints.
// Loading AI exports here would make deployment require unrelated API-key secrets.
const { getApps, initializeApp } = require('firebase-admin/app');

if (!getApps().length) initializeApp();

exports.guestQuoteAccess = require('./guest-access.js').guestQuoteAccess;
exports.qnaSecure = require('./qna-api.js').qnaSecure;
