var child_process = require('child_process');

var io = require('socket.io-client');

var config = require('../config.json');

// an independent client that handles recording one stream at a time
var Recorder = function (port, reconnectDelay) {
  // connect to the parent Streamify server
  this.address = 'ws://127.0.0.1:' + port;

  // attempt to reconnect forever without exponential backoff
  this.socket = io.connect(this.address, {
    'reconnect': true,
    'reconnection delay': reconnectDelay,
    'reconnection limit': 0, // disable exponential backoff for reconnect
    'max reconnection attempts': Infinity
  });

  // set up events for the socket connection
  this.socket.on('record', this.record.bind(this));
  this.socket.on('stop', this.stop.bind(this));

  // TODO: replace with actual recording processes
  this.recording = false;
};

// determine whether we're currently recording, i.e. either process is alive
Recorder.prototype.isRecording = function () {
  return this.recording;
};

// start recording a stream
Recorder.prototype.record = function (stream) {
  // do nothing if already recording
  if (this.isRecording()) {
    return;
  };

  this.recording = true;
  console.log('recording');
};

// stop recording processes
Recorder.prototype.stop = function () {
  // do nothing if not already recording
  if (!this.isRecording()) {
    return;
  }

  this.recording = false;
  console.log('stopped');
};

// start a new Recorder directly, since this module is launched via
// child_process.fork() in a Streamify parent.
var recorder = new Recorder(config.ipc_port, config.ipc_reconnect_delay);
