const { getApps, initializeApp } = require('firebase-admin/app');
const { rebuildPublicFeed } = require('./public-feed-data.js');

if (!getApps().length) initializeApp();

rebuildPublicFeed()
  .then(counts => {
    console.log(`Public feed backfill complete: quotes=${counts.quotes}, qna=${counts.qna}`);
  })
  .catch(error => {
    console.error('Public feed backfill failed:', error);
    process.exitCode = 1;
  });
