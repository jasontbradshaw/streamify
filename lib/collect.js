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

// wait for n results to come in, then call a callback with them
var collectChunked = function (list, worker, callback, timeout, chunkSize) {
  // constrain chunk size to non-zero, positive integers
  chunkSize = Math.max(chunkSize, 0) || 50;

  var results = [];

  // don't do any work if there's nothing to do work on
  if (!list || list.length === 0) {
    callback(results);
    return;
  }

  // divide input list evenly into chunks of some maximum size
  var numChunks = Math.ceil(list.length / chunkSize);

  // create a list of empty chunks and round-robin work items into them
  var chunks = _.map(_.range(numChunks), function () { return []; });
  for (var i = 0; i < list.length; i++) {
    chunks[i % chunks.length].push(list[i]);
  }

  // first function calls the callback
  var prevFun = function (finalChunkResults) {
    _.each(finalChunkResults, function (result) {
      results.push(result);
    });

    // call the original callback with the aggregate results
    setTimeout(function () {
      callback(results);
    }, 0);
  };

  // chain all other functions together back to the first one
  _.each(_.first(chunks, chunks.length - 1), function (chunk) {
    var fun = prevFun;
    prevFun = function (chunkResults) {
      // add each result from the chunk to the overall results
      _.each(chunkResults, function (result) {
        results.push(result);
      });

      // collect and pass results to the next function in the line
      collect(chunk, worker, fun, timeout);
    };
  });

  // start the first collect cycle on the final chunk
  collect(_.last(chunks), worker, prevFun, timeout);
};

module.exports = collect;
module.exports.chunked = collectChunked;
