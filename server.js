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
  streamer.getStreams(function (err, streams) {
    if (!err) {
      res.send({
        streams: _.map(streams, function (s) { return s.toJSON(); })
      });
    } else {
      res.statusCode = 404;
      res.send(error(err.message));
    }
  });
});

// get information about a specific stream
app.get('/streams/:stream', function (req, res) {
  streamer.getStream(req.params.stream, function (err, stream) {
    if (!err) {
      res.send(stream.toJSON());
    } else {
      res.statusCode = 404;
      res.send(error(err.message));
    }
  });
});

// get information about the existing segments for a stream
app.get('/streams/:stream/segments', function (req, res) {
  streamer.getSegments(req.params.stream, function (err, segments) {
    if (!err) {
      res.send({
        segments: _.map(segments, function (s) { return s.toJSON(); })
      });
    } else {
      res.statusCode = 404;
      res.send(error(err.message));
    }
  });
});

// get information about a specific segment in a stream
app.get('/streams/:stream/segments/:index', function (req, res) {
  var index = parseInt(req.params.index, 10);
  streamer.getSegment(req.params.stream, index, function (err, segment) {
    if (!err) {
      res.send(segment.toJSON());
    } else {
      res.statusCode = 404;
      res.send(error(err.message));
    }
  });
});

// start recording a new stream
app.post('/record', function (req, res) {
  streamer.record();
  res.send();
});

// stop recording any currently recording stream
app.delete('/record', function (req, res) {
  streamer.stop();
  res.send();
});

// cleanly close the server, cleaning up running recorders first
app.post('/shutdown', function (req, res) {
  streamer.stop();
  streamer.close();

  // send a successful response, then close the entire app
  res.send();
  process.exit(0);
});

app.listen(config.port);
console.log('streamer listening on port ' + config.port);
