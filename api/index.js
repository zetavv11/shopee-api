'use strict';

// Entry point Vercel: seluruh aplikasi Express berjalan sebagai satu serverless function.
// (Worker setInterval tidak dipakai di sini; lihat /cron/tick dan README.)
module.exports = require('../src/app');
