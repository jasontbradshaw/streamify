// wait for n results to come in, then call a callback with them
var collect = function (n, callback, timeout) {
  // maximum time to wait for results
  timeout = timeout || 10000;

  var results = [];
  var cancelled = false;

  // don't do any work if there's nothing to wait for
  if (n <= 0) {
    callback(results);
    return function () {};
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
    if (results.length >= n && !cancelled) {
      clearTimeout(timeoutId);
      callback(results);
    }
  };

  return respond;
};

module.exports = collect;
