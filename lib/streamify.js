var fs = require('fs');
var path = require('path');
var child_process = require('child_process');

var _ = require('underscore');
var ffmpeg = require('fluent-ffmpeg');
var ts = require('tailing-stream');

var models = require('./models');

var Streamify = function (config) {
  // copy salient variables from the config
  this.streamDir = config.stream_dir;
  this.rtpStream = config.rtp_stream;

  this.streamPrefix = 'stream_';
  this.streamNameRegex = new RegExp('^' + this.streamPrefix);

  this.segmentLengthSeconds = config.segment_length_seconds;
  this.segmentExtension = 'webm';
  this.segmentNameRegex = new RegExp('^([0-9]+)\.' + this.segmentExtension + '$');

  // make sure our stream directory exists
  if (!fs.existsSync(this.streamDir)) {
    fs.mkdirSync(this.streamDir);
  }
}

// returns the fs.stat of a stream if it exists, null otherwise
Streamify.prototype._getStreamStat = function (streamName) {
  if (this.streamNameRegex.exec(streamName)) {
    try {
      var streamStat = fs.statSync(path.join(this.streamDir, streamName));
      if (streamStat.isDirectory()) {
        return streamStat;
      }
    } catch (e) { }
  }

  // wasn't a stream
  return null;
};

// returns the fs.stat of a segment if it exists, null otherwise
Streamify.prototype._getSegmentStat = function (streamName, segmentName) {
  if (this.segmentNameRegex.exec(segmentName)) {
    try {
      var segmentStat = fs.statSync(
          path.join(this.streamDir, streamName, segmentName));
      if (segmentStat.isFile()) {
        return segmentStat;
      }
    } catch (e) { }
  }

  // wasn't a segment/stream
  return null;
};

// return a list of all streams, sorted in descending order by create date
Streamify.prototype.getStreams = function () {
  var files = fs.readdirSync(this.streamDir);

  // compile a list of stream objects that contain a create time and name
  var streams = _.compact(_.map(files, function (file) {
    // add info if the file is a stream
    var streamInfo = this.getStream(file);
    if (streamInfo) {
      return streamInfo;
    }
    // otherwise, ignore it
    return null;
  }, this));

  console.log(streams);

  // sort by create date, then put in descending order
  return _.sortBy(streams, 'createDate').reverse();
};

// get detailed information about a specific stream
Streamify.prototype.getStream = function (streamName) {
  // if the file is a stream directory, create an object for it
  var streamStat = this._getStreamStat(streamName);
  if (streamStat) {
    var stream = new models.Stream(streamName);

    // iterate over all possible segments
    var streamPath = path.join(this.streamDir, streamName);
    _.each(fs.readdirSync(streamPath), function (segment) {
      if (this.segmentNameRegex.exec(segment)) {
        var segmentStat = this._getSegmentStat(streamName, segment);
        if (segmentStat) {
          // update the stream with the new information
          stream.segmentCount++;

          // track total stream size
          stream.size += segmentStat.size;

          // use the latest update date as the stream's modification time
          stream.updateDate = new Date(
            Math.max(stream.updateDate, segmentStat.mtime));

          // set the initial update date if unset
          if (!stream.createDate) {
            stream.createDate = segmentStat.ctime;
          } else {
            // use the earliest create date as the official create time
            stream.createDate = new Date(
              Math.min(stream.createDate, segmentStat.ctime));
          }
        }
      }
    }, this);

    // fill in the create/update dates if there are no segments
    if (!stream.createDate) {
      stream.createDate = streamStat.ctime;
      stream.updateDate = stream.createDate;
    }

    // return the stream, populated with data
    return stream;
  }

  // no such stream exists
  return null;
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
  // TODO: start recording a stream and return its stream object
};

module.exports.Streamify = Streamify
