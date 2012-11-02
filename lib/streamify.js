var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var _ = require('underscore');
var ffprobe = require('node-ffprobe');
var ts = require('tailing-stream');

var models = require('./models');
var collect = require('./collect');
var RecordState = require('./record-state');

var Streamify = function (config) {
  // copy salient variables from the config
  this.streamDir = config.stream_dir;
  this.ffmpegInput = config.ffmpeg_input;

  this.streamPrefix = 'stream-';
  this.streamNameRegex = new RegExp('^' + this.streamPrefix);

  this.segmentLengthSeconds = config.segment_length_seconds;
  this.segmentExtension = 'webm';
  this.segmentNameRegex = new RegExp('^([0-9]+)\.' + this.segmentExtension + '$');

  // holds object with existing procs that are recording, null if not recording
  this.stateFile = '.record-state.json';
  this.recordState = RecordState.load(this.stateFile);

  // ffmpeg arguments used when creating a dump process
  this.dumpArgs = [
    '-y',
  ];

  // make sure our stream directory exists before we get started
  if (!fs.existsSync(this.streamDir)) {
    fs.mkdirSync(this.streamDir);
  }
}

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

// build a (hopefully) unique stream directory name
Streamify.prototype._generateStreamName = function () {
  return this.streamPrefix + (new Date()).toISOString();
};

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

// get detailed info for a specific segment as the segment reports it. however,
// duration and start time must be calculated in light of preceding segments.
Streamify.prototype._getRawSegment = function (streamName, segmentName, callback) {
  var self = this;

  this._getSegmentStats(streamName, segmentName, function (segmentStats) {
    if (segmentStats) {
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
          callback(rawSegment);
        } else {
          callback(null);
        }
      });
    } else {
      callback(null);
    }
  });
};

// return a list of all streams, sorted in descending order by create date
Streamify.prototype.getStreams = function (callback) {
  var self = this;

  fs.readdir(this.streamDir, function (err, streams) {
    if (!err) {
      // collect all the stream stats
      collect(streams, function (stream, respond) {
        self.getStream(stream, respond);
      }, function (streams) {
        // return them in descending order of create date
        callback(_.sortBy(_.compact(streams), 'createDate').reverse());
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
          collect(segments, function (segmentName, respond) {
            self._getSegmentStats(streamName, segmentName, respond);
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
            callback(stream);
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
Streamify.prototype.getSegments = function (streamName, callback) {
  var self = this;

  var streamPath = path.join(this.streamDir, streamName);
  fs.readdir(streamPath, function (err, files) {
    if (!err && files) {
      // run chunked to avoid exceeding the node process' ulimit value
      collect.chunked(files, function (segmentName, respond) {
        self._getRawSegment(streamName, segmentName, respond);
      }, function (segments) {
        // finish filling out the segments
        segments = _.sortBy(_.compact(segments), 'index');

        var lastDuration = 0;
        _.each(segments, function (segment) {
          // use difference between last duration and this to get true duration
          var start = lastDuration;
          var duration = segment.duration - lastDuration;

          // move marker forward
          lastDuration = segment.duration;

          // calculate end
          var end = start + duration;

          // populate segment with calculated data, truncated to nearest 1000th
          segment.start = Math.round(start * 1000) / 1000;
          segment.duration = Math.round(duration * 1000) / 1000;
          segment.end = Math.round(end * 1000) / 1000;
        });

        // return the list of now fully-populated segments
        callback(segments);
      }, 10000, 50);
    } else {
      callback(null);
    }
  });
};

// get the info for a single segment of a stream
Streamify.prototype.getSegment = function (streamName, segmentIndex, callback) {
  // if the index is 0, we don't need a preceding segment
  if (segmentIndex === 0) {
    // get the info from the first segment and return it
    var segmentName = this._segmentNameFromIndex(segmentIndex);
    this._getRawSegment(streamName, segmentName, function (segment) {
      if (segment) {
        // fill in the missing info (duration is pre-populated)
        segment.start = 0;
        segment.end = Math.round(segment.duration * 1000) / 1000;
        segment.duration = segment.end;

        callback(segment);
      } else {
        callback(null);
      }
    });
  } else {
    // otherwise, get the segment and its preceding segment
    var self = this;
    collect([segmentIndex, segmentIndex - 1], function (i, respond) {
      self._getRawSegment(streamName, self._segmentNameFromIndex(i), respond);
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

        callback(segment);
      } else {
        // if we didn't get two segments, something went wrong
        callback(null);
      }
    });
  }
};

// start recording a new stream and return its stream name, or null if a
// recording was already in-progress.
Streamify.prototype.record = function () {
  // TODO

  // only allow one recording at once
  if (this.recordState) {
    return null;
  }

  // create a state object to flag that we're now recording
  this.recordState = new RecordState();

  // create a new directory for the stream
  var streamName = this._generateStreamName();
  var streamPath = path.join(this.streamDir, streamName);
  try {
    fs.mkdirSync(streamPath);
  } catch (e) {
    return null;
  }

  // ffmpeg arguments used when creating a dump process
  // ffmpeg -y -i 'rtp://127.0.0.1:5004' -c copy -absf aac_adtstoasc
  //     -movflags faststart+frag_keyframe+empty_moov dump.mp4
  this.dumpArgs = [
    '-y',
    '-i', this.ffmpegInput,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', ['faststart', 'frag_keyframe', 'empty_moov'].join('+'),
    '-f', 'mp4',
    'pipe:1'
  ];

  // start dumping from the configured H264 source
  var dumpProc = child_process.spawn('ffmpeg', this.dumpArgs, {
    cwd: streamPath,
    stdio: ['ignore', 'pipe', 'ignore'],
    detached: true
  });

  // ffmpeg arguments used when creating a transcode process
  // ./bintail dump.mp4 | ffmpeg -y -i pipe:0 -c:v libvpx -vb 2000k
  //     -quality realtime -qmin 10 -qmax 42 -c:a libvorbis -b:a 128k
  //     -map 0 -f segment -segment_time 10 dump-%d.webm
  this.transcodeArgs = [
    '-y',
    '-i', 'pipe:0',
    '-c:v', 'libvpx',
    '-vb', '2000k',
    '-quality', 'realtime',
    '-qmin', 10,
    '-qmax', 42,
    '-c:a', 'libvorbis',
    '-b:a', '128k',
    '-map', 0,
    '-f', 'segment',
    '-segment_time', 10,
    '%d.webm'
  ];

  // start dumping from the configured H264 source
  var transcodeProc = child_process.spawn('ffmpeg', this.transcodeArgs, {
    cwd: streamPath,
    stdio: ['pipe', 'ignore', 'ignore'],
    detached: true
  });

  // pipe dump process into transcode process
  dumpProc.stdio[1].pipe(transcodeProc.stdio[0]);

  // return stream info for the stream we just created
  var stream = new models.Stream(streamName);
  stream.size = 0;
  stream.segmentCount = 0;
  stream.createDate = new Date();
  stream.updateDate = new Date();

  return stream;
};

// stop recording any current stream and kill all processes associated with it
Streamify.prototype.stop = function () {
  // TODO
};

module.exports.Streamify = Streamify
