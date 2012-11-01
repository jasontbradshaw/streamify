var _ = require('underscore');

// wait for n results to come in, then call a callback with them
var collect = function (list, worker, callback, timeout) {
  // maximum time to wait for results
  timeout = timeout || 10000;

  var results = [];
  var cancelled = false;

  // don't do any work if there's nothing to work on
  if (!list || !list.length) {
    callback(results);
    return;
  }

  // stop collecting if we time out
  var timeoutId = setTimeout(function () {
    cancelled = true;
    callback(null);
  }, timeout);

  // add a result and check if it's the last one
  var respond = function (result) {
    results.push(result);

    // run callback if it's the final result and we haven't timed-out
    if (results.length >= list.length && !cancelled) {
      clearTimeout(timeoutId);
      callback(results);
    }
  };

  // spawn a worker for every item in the list
  _.each(list, function (item) {
    setTimeout(function () {
      worker(item, respond);
    }, 0);
  });
};

module.exports = collect;
