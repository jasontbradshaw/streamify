var path = require('path');

var _ = require('underscore');
var cons = require('consolidate');
var express = require('express');
var stylus = require('stylus');

var streamify = require('./lib/streamify');

// load the config file
var config = require('./config.json');

// create our app
var app = express();

// build the streamer
var streamer = new streamify.Streamify(config);

// return a JSON error object
var error = function (msg, props) {
  // convert Error objects to their messages
  if (msg instanceof Error) {
    msg = msg.message;
  }

  var err = {
    error: msg
  };

  // add custom properties if necessary
  if (props) {
    _.extend(err, props);
  }

  return err;
};

// configure our app
app.configure(function () {
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.logger('dev'));
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));

  // where mustache and stylus files live
  app.set('views', path.join(__dirname, 'static'));

  // mustache for templating
  app.engine('html.mustache', cons.mustache);
  app.set('view engine', 'html.mustache');

  // stylus for styling
  app.use(stylus.middleware({
    src: path.join(__dirname, 'static'),
    dest: path.join(__dirname, 'static'),

    // custom compilation
    compile: function (str, path) {
      return (stylus(str)
        .set('filename', path)
        .set('compress', false)
        .set('linenos', true)
      );
    }
  }));

  // the static directory holds compiled views and the like
  app.use(express.static(path.join(__dirname, 'static')));
});

app.get('/', function (req, res) {
  res.render('index', {title: 'Streamify'});
});

// get a list of all streams sorted by create_date
app.get('/streams', function (req, res) {
  streamer.getStreams(function (err, streams) {
    if (!err) {
      res.send(_.map(streams, function (s) { return s.toJSON(); }));
    } else {
      res.statusCode = 500;
      res.send(error(err));
    }
  });
});

// get information about a specific stream
app.get('/streams/:stream', function (req, res) {
  streamer.getStream(req.params.stream, function (err, stream) {
    if (!err) {
      res.send(stream.toJSON());
    } else {
      res.statusCode = 500;
      res.send(error(err));
    }
  });
});

// get information about the existing segments for a stream
app.get('/streams/:stream/segments', function (req, res) {
  streamer.getSegments(req.params.stream, function (err, segments) {
    if (!err) {
      res.send(_.map(segments, function (s) { return s.toJSON(); }));
    } else {
      res.statusCode = 500;
      res.send(error(err));
    }
  });
});

// get information about a specific segment in a stream
app.get('/streams/:stream/segments/:index', function (req, res) {
  // get useful params
  var stream = req.params.stream;
  var index = req.params.index;

  // determine if the given index is a pure integer or something else
  var indexIsInteger = !!(/^\d+$/.exec(index));
  if (indexIsInteger) {
    var indexNum = parseInt(index, 10);
    streamer.getSegment(stream, indexNum, function (err, segment) {
      if (!err) {
        res.send(segment.toJSON());
      } else {
        res.statusCode = 500;
        res.send(error(err));
      }
    });
  } else {
    // otherwise, a segment file was intended, so we try to get one
    streamer.getSegmentStream(stream, index, function (err, segmentStream) {
      if (!err) {
        // pipe the segment stream to the response as a WebM video
        res.contentType('video/webm');
        segmentStream.pipe(res);
      } else {
        res.statusCode = 500;
        res.send(error(err));
      }
    });
  }
});

// start recording a new stream
app.post('/record', function (req, res) {
  streamer.record(function (err, stream) {
    if (!err) {
      // stream can sometimes be null if timing works out badly
      res.send(stream ? stream.toJSON() : null);
    } else {
      res.statusCode = 500;
      res.send(error(err));
    }
  });
});

// stop recording any currently recording stream
app.delete('/record', function (req, res) {
  streamer.stop(function (err) {
    if (!err) {
      res.send();
    } else {
      res.statusCode = 500;
      res.send(error(err));
    }
  });
});

// cleanly close the server, cleaning up running recorders first
app.post('/shutdown', function (req, res) {
  // stop the recording first
  streamer.stop(function (err, stream) {
    // send a successful response, then close the entire app
    res.send();
    streamer.close();
    process.exit(0);
  });
});

app.listen(config.port);
console.log('streamer listening on port ' + config.port);
