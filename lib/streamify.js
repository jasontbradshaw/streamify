var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var _ = require('underscore');
var ffprobe = require('node-ffprobe');
var ts = require('tailing-stream');
var io = require('socket.io');

var models = require('./models');
var collect = require('./collect');

var Streamify = function (config) {

  this.streamPrefix = config.stream_prefix;
  this.streamNameRegex = new RegExp('^' + this.streamPrefix);

  this.segmentLengthSeconds = config.segment_length_seconds;
  this.segmentExtension = 'webm';
  this.segmentNameRegex = new RegExp('^([0-9]+)\.' + this.segmentExtension + '$');

  // make sure the stream directory exists
  this.streamDir = config.stream_dir;
  this._ensureStreamDir();

  // build the socket server and recorder process, if necessary
  this.io = null;
  this.socket = null;
  this._setupRecorderAndSocket(config);
};

Streamify.prototype._segmentNameFromIndex = function (index) {
  return index + '.' + this.segmentExtension;
};

Streamify.prototype._indexFromSegmentName = function (name) {
  var match = this.segmentNameRegex.exec(name);
  if (match) {
    return parseInt(match[1], 10);
  } else {
    return null;
  }
};

// gets the fs.stat of a stream if it exists, null otherwise
Streamify.prototype._getStreamStats = function (streamName, callback) {
  if (this.streamNameRegex.exec(streamName)) {
    var streamPath = path.join(this.streamDir, streamName);
    fs.stat(streamPath, function (err, streamStats) {
      // call the callback with the stat if it was a stream
      if (!err) {
        if (streamStats.isDirectory()) {
          callback(null, streamStats);
        } else {
          callback(new Error('invalid stream: ' + streamName));
        }
      } else {
        // otherwise, return an error
        callback(new Error('could not find stream: ' + streamName));
      }
    });
  } else {
    // wasn't a stream
    callback(new Error('invalid stream name: ' + streamName));
  }
};

// returns the fs.stat of a segment if it exists, null otherwise
Streamify.prototype._getSegmentStats = function (streamName, segmentName, callback) {
  var self = this;

  if (this.segmentNameRegex.exec(segmentName)) {
    var segmentPath = path.join(this.streamDir, streamName, segmentName);
    fs.stat(segmentPath, function (err, segmentStats) {
      if (!err) {
        if (segmentStats.isFile()) {
          callback(null, segmentStats);
        } else {
          callback(new Error('invalid segment: ' + streamName + '[' +
              self._indexFromSegmentName(segmentName) + ']'));
        }
      } else {
        callback(new Error('could not find segment: ' + streamName + '[' +
            self._indexFromSegmentName(segmentName) + ']'));
      }
    });
  } else {
    callback(new Error('invalid segment name: ' + segmentName));
  }
};

// get detailed info for a specific segment as the segment reports it. however,
// duration and start time must be calculated in light of preceding segments.
Streamify.prototype._getRawSegment = function (streamName, segmentName, callback) {
  var self = this;

  this._getSegmentStats(streamName, segmentName, function (err, segmentStats) {
    if (!err) {
      // fill in simple segment information
      var rawSegment = new models.Segment(self._indexFromSegmentName(segmentName));
      rawSegment.size = segmentStats.size;
      rawSegment.createDate = segmentStats.ctime;
      rawSegment.updateDate = segmentStats.mtime;

      // get detailed info about the segment
      var segmentPath = path.join(self.streamDir, streamName, segmentName);
      ffprobe(segmentPath, function (err, metadata) {
        if (!err) {
          // this duration is off since each segment assumes itself to be a
          // complete file, even though it's missing all preceding segments.
          // we fill in the reported duration here, and calculate the actual
          // duration given some other segments.
          rawSegment.duration = metadata.format ? metadata.format.duration : 0;

          // pass back the incomplete segment
          callback(null, rawSegment);
        } else {
          callback(new Error('could not get info for segment: ' + streamName +
              '[' + self._indexFromSegmentName(segmentName) + ']'));
        }
      });
    } else {
      callback(err);
    }
  });
};

// make sure the stream directory exists
Streamify.prototype._ensureStreamDir = function () {
  // make sure our stream directory exists before we get started
  if (!fs.existsSync(this.streamDir)) {
    fs.mkdirSync(this.streamDir);
  }
};

// fork off a new recorder if one isn't already running
Streamify.prototype._forkRecorder = function () {
  // if a socket hasn't been connected to yet...
  if (this.socket === null) {
    // fork a detached recorder process that we communicate with using
    // socket.io. for some reason, the module to fork is relative to the cwd of
    // the forked process, hence the '../lib/' part.
    child_process.fork('../lib/recorder', [], {
      cwd: this.streamDir,
      stdio: 'ignore',
      detached: true
    });
  }
};

// set up the socket server and recorder process
Streamify.prototype._setupRecorderAndSocket = function (config) {
  // start a new recorder if one doesn't connect itself in short order
  var forkTimeout = setTimeout(this._forkRecorder.bind(this),
      config.ipc_reconnect_delay * 1.5);

  // set up the IPC server we'll use to control recorders
  this.io = io.listen(config.ipc_port);
  this.socket = null;
  this.io.on('connection', this._handleSocketConnect.bind(this, forkTimeout));
};

// store the connected socket when a child connects
Streamify.prototype._handleSocketConnect = function (forkTimeout, socket) {
  // don't create a new recorder if one connected to us already
  clearTimeout(forkTimeout);

  // save the socket we're currently connected to
  this.socket = socket;
};

// return a list of all streams, sorted in descending order by create date
Streamify.prototype.getStreams = function (callback) {
  var self = this;

  fs.readdir(this.streamDir, function (err, streams) {
    if (!err) {
      // collect all the stream stats
      collect(streams, function (stream, respond) {
        self.getStream(stream, function (e, s) { respond(s); });
      }, function (streams) {
        // return them in descending order of create date
        callback(null, _.sortBy(_.compact(streams), 'createDate').reverse());
      });
    } else {
      callback(new Error('invalid stream directory: ' + self.streamDir));
    }
  });
};

// get detailed information about a specific stream
Streamify.prototype.getStream = function (streamName, callback) {
  var self = this;

  this._getStreamStats(streamName, function (err, streamStats) {
    if (!err) {
      // build the stream object so we can fill it out
      var stream = new models.Stream(streamName);

      var streamPath = path.join(self.streamDir, streamName);
      fs.readdir(streamPath, function (err, segments) {
        if (!err) {
          // the number of callbacks that we must wait for before 'returning'
          collect(segments, function (segmentName, respond) {
            self._getSegmentStats(streamName, segmentName,
              function (e, s) { respond(s); });
          }, function (segments) {
            _.each(_.compact(segments), function (segmentStat) {
              // increment size and segment count
              stream.size += segmentStat.size;
              stream.segmentCount += 1;

              // use the earliest create date for any segment
              if (!stream.createDate) {
                stream.createDate = segmentStat.ctime;
              } else {
                stream.createDate = new Date(
                  Math.min(stream.createDate, segmentStat.ctime));
              }

              // use the latest modification date for any segment
              stream.updateDate = new Date(
                Math.max(stream.updateDate, segmentStat.ctime));
            });

            // update stream times if it had no segments
            if (!stream.createDate) {
              stream.createDate = streamStats.ctime;
              stream.updateDate = stream.createDate;
            }

            // respond with the newly-populated stream
            callback(null, stream);
          });
        } else {
          callback(new Error('invalid stream: ' + streamName));
        }
      });
    } else {
      callback(err);
    }
  });
};

// get detailed segment info for all segments in a stream
Streamify.prototype.getSegments = function (streamName, callback) {
  var self = this;

  this._getStreamStats(streamName, function (err, streamStats) {
    if (!err) {
      var streamPath = path.join(self.streamDir, streamName);
      fs.readdir(streamPath, function (err, files) {
        if (!err) {
          // run chunked to avoid exceeding the node process' ulimit value
          collect.chunked(files || [], function (segmentName, respond) {
            self._getRawSegment(streamName, segmentName,
              function (e, s) { respond(s); });
          }, function (segments) {
            // finish filling out the segments
            segments = _.sortBy(_.compact(segments), 'index');

            var lastDuration = 0;
            _.each(segments, function (segment) {
              // difference between last duration and this gets true duration
              var start = lastDuration;
              var duration = segment.duration - lastDuration;

              // move marker forward
              lastDuration = segment.duration;

              // calculate end
              var end = start + duration;

              // populate with calculated data truncated to nearest 1000th
              segment.start = Math.round(start * 1000) / 1000;
              segment.duration = Math.round(duration * 1000) / 1000;
              segment.end = Math.round(end * 1000) / 1000;
            });

            // return the list of now fully-populated segments
            callback(null, segments);
          }, 10000, 50);
      } else {
        callback(new Error('invalid stream: ' + streamName));
      }
    });
    } else {
      callback(err);
    }
  });
};

// get the info for a single segment of a stream
Streamify.prototype.getSegment = function (streamName, segmentIndex, callback) {
  // if the index is 0, we don't need a preceding segment
  if (segmentIndex === 0) {
    // get the info from the first segment and return it
    var segmentName = this._segmentNameFromIndex(segmentIndex);
    this._getRawSegment(streamName, segmentName, function (err, segment) {
      if (!err) {
        // fill in the missing info (duration is pre-populated)
        segment.start = 0;
        segment.end = Math.round(segment.duration * 1000) / 1000;
        segment.duration = segment.end;

        callback(null, segment);
      } else {
        callback(err);
      }
    });
  } else {
    // otherwise, get the segment and its preceding segment
    var self = this;
    collect([segmentIndex, segmentIndex - 1], function (i, respond) {
      self._getRawSegment(streamName, self._segmentNameFromIndex(i),
        function (e, s) { respond(s); });
    }, function (rawSegments) {
      rawSegments = _.sortBy(_.compact(rawSegments), 'index');
      if (rawSegments.length === 2) {
        var prevSegment = rawSegments[0];
        var segment = rawSegments[1];

        // fill in the values based on the previous segment's reported duration
        segment.start = Math.round(prevSegment.duration * 1000) / 1000;
        segment.end = Math.round(segment.duration * 1000) / 1000;
        segment.duration = Math.round(
          (segment.duration - prevSegment.duration) * 1000) / 1000;

        callback(null, segment);
      } else {
        // if we didn't get two segments, something went wrong
        callback(new Error('could not find segment: ' + streamName + '[' +
            segmentIndex + ']'));
      }
    });
  }
};

// start recording a new stream and return its stream object, or null if a
// recording was already in-progress.
Streamify.prototype.record = function () {
  if (this.socket === null) {
    // do nothing until we're connected
    return new Error('recorder process not connected, try again');
  }

  // send the signal to start recording the given stream
  this.socket.emit('record');
};

// stop recording any current stream and kill all processes associated with it
Streamify.prototype.stop = function () {
  if (this.socket === null) {
    return new Error('recorder process not connected, try again');
  }

  // tell the recorder to stop recording
  this.socket.emit('stop');
};

module.exports.Streamify = Streamify
