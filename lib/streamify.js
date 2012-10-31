var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var _ = require('underscore');
var ffmpeg = require('fluent-ffmpeg');
var ts = require('tailing-stream');

var models = require('./models');
var collect = require('./collect');

var Streamify = function (config) {
  // copy salient variables from the config
  this.streamDir = config.stream_dir;
  this.rtpStream = config.rtp_stream;

  this.streamPrefix = 'stream_';
  this.streamNameRegex = new RegExp('^' + this.streamPrefix);

  this.segmentLengthSeconds = config.segment_length_seconds;
  this.segmentExtension = 'webm';
  this.segmentNameRegex = new RegExp('^([0-9]+)\.' + this.segmentExtension + '$');

  // make sure our stream directory exists before we get started
  if (!fs.existsSync(this.streamDir)) {
    fs.mkdirSync(this.streamDir);
  }
}

// gets the fs.stat of a stream if it exists, null otherwise
Streamify.prototype._getStreamStats = function (streamName, callback) {
  if (this.streamNameRegex.exec(streamName)) {
    var streamPath = path.join(this.streamDir, streamName);
    fs.stat(streamPath, function (err, streamStats) {
      // call the callback with the stat if it was a stream
      if (!err && streamStats.isDirectory()) {
        callback(streamStats);
      } else {
        // otherwise, call it with null
        callback(null);
      }
    });
  } else {
    // wasn't a stream
    callback(null);
  }
};

// returns the fs.stat of a segment if it exists, null otherwise
Streamify.prototype._getSegmentStats = function (streamName, segmentName, callback) {
  if (this.segmentNameRegex.exec(segmentName)) {
    var segmentPath = path.join(this.streamDir, streamName, segmentName);
    fs.stat(segmentPath, function (err, segmentStats) {
      if (!err && segmentStats.isFile()) {
        callback(segmentStats);
      } else {
        callback(null);
      }
    });
  } else {
    callback(null);
  }
};

// return a list of all streams, sorted in descending order by create date
Streamify.prototype.getStreams = function (callback) {
  var self = this;

  fs.readdir(this.streamDir, function (err, streams) {
    if (!err) {
      // collect all the stream stats
      var respond = collect(streams.length, function (streams) {
        // return them in descending order of create date
        callback(_.sortBy(_.compact(streams), 'createDate').reverse());
      });

      // respond with stats (or null) for each stream
      _.each(streams, function (stream) {
        self.getStream(stream, respond);
      });
    } else {
      callback(null);
    }
  });
};

// get detailed information about a specific stream
Streamify.prototype.getStream = function (streamName, callback) {
  var self = this;

  this._getStreamStats(streamName, function (streamStats) {
    if (streamStats) {
      // build the stream object so we can fill it out
      var stream = new models.Stream(streamName);

      var streamPath = path.join(self.streamDir, streamName);
      fs.readdir(streamPath, function (err, segments) {
        if (!err) {
          // the number of callbacks that we must wait for before 'returning'
          var respond = collect(segments.length, function (segments) {
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
            callback(stream);
          });

          // get stats (or null) for each segment
          _.each(segments, function (segmentName) {
            self._getSegmentStats(streamName, segmentName, respond);
          });
        } else {
          callback(null);
        }
      });
    } else {
      callback(null);
    }
  });
};

// get detailed segment info for all segments in a stream
Streamify.prototype.getSegments = function (streamName) {
  // TODO
};

// get detailed info for the latest segment of a stream
Streamify.prototype.getLatestSegment = function (streamName) {
  // TODO
};

// get detailed info for a specific segment
Streamify.prototype.getSegment = function (streamName, segmentIndex) {
  // TODO
};

// start recording a new stream and return its stream name
Streamify.prototype.record = function () {
  // TODO
};

module.exports.Streamify = Streamify
