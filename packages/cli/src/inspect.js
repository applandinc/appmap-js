const filter = require('./inspect/filter');
const print = require('./inspect/print');
const reset = require('./inspect/reset');
const undoFilter = require('./inspect/undoFilter');
const navigate = require('./inspect/navigate');
const compare = require('./inspect/compare');
const home = require('./inspect/home');

module.exports = { filter, home, print, reset, undoFilter, compare, navigate };
