var _ = require('underscore');
var express = require('express');

var streamify = require('./lib/streamify');

// load the config file
var config = require('./config.json');

// create our app
var app = express();

// build the streamer
var streamer = new streamify.Streamify(config);

// return a JSON error object
var error = function (msg, props) {
  var err = {
    error: msg
  };

  // add custom properties if necessary
  if (props) {
    _.extend(err, props);
  }

  return err;
};

// get a list of all streams sorted by create_date
app.get('/streams', function (req, res) {
  streamer.getStreams(function (streams) {
    if (streams) {
      res.send({
        streams: _.map(streams, function (s) { return s.toJSON(); })
      });
    } else {
      res.statusCode = 404;
      res.send(error('stream not found: ' + req.params.stream));
    }
  });
});

// get information about a specific stream
app.get('/streams/:stream', function (req, res) {
  streamer.getStream(req.params.stream, function (stream) {
    if (stream) {
      res.send(stream.toJSON());
    } else {
      res.statusCode = 404;
      res.send(error('stream not found: ' + req.params.stream));
    }
  });
});

// get information about the existing segments for a stream
app.get('/streams/:stream/segments', function (req, res) {
  streamer.getSegments(req.params.stream, function (segments) {
    if (segments) {
      res.send({
        segments: _.map(segments, function (s) { return s.toJSON(); })
      });
    } else {
      res.statusCode = 404;
      res.send(error('stream not found: ' + req.params.stream));
    }
  });
});

// start recording a new stream
app.post('/streams', function (req, res) {
  var stream = streamer.record();

  if (stream) {
    res.send(stream.toJSON());
  } else {
    res.statusCode = 500;
    res.send(error('unable to create stream'));
  }
});

app.listen(config.port);
console.log('listening on port ' + config.port);
