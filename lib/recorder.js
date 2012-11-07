var child_process = require('child_process');
var fs = require('fs');

var io = require('socket.io-client');

var config = require('../config.json');

// an independent client that handles recording one stream at a time
var Recorder = function (config) {
  // connect to the parent Streamify server
  this.address = 'ws://127.0.0.1:' + config.ipc_port;

  // attempt to reconnect forever without exponential backoff
  this.socket = io.connect(this.address, {
    'reconnect': true,
    'reconnection delay': config.ipc_reconnect_delay_milliseconds,
    'reconnection limit': 0, // disable exponential backoff for reconnect
    'max reconnection attempts': Infinity
  });

  // the input file used for getting raw H264 data
  this.ffmpegInput = config.ffmpeg_input;

  // set up events for the socket connection
  this.socket.on('record', this.record.bind(this));
  this.socket.on('stop', this.stop.bind(this));

  // wait at most this amount of time before murdering FFmpeg processes
  this.processExitTimeout = 5000;

  // serves as a lock when recording
  this.recording = false;

  // the processes that are dumping and transcoding a stream
  this.dumpProc = null;
  this.transcodeProc = null;

  // timeouts that ensure the processes exit after a certain time
  this.dumpKillTimeout = null;
  this.transcodeKillTimeout = null;
};

// null out process vars once they have formally exited for good
Recorder.prototype._handleDumpExit = function (code, signal) {
  clearTimeout(this.dumpKillTimeout); // don't kill if already exited
  this.dumpKillTimeout = null;
  this.dumpProc = null;

  // if we're the last process to exit, flip recording flag
  if (this.transcodeProc === null) {
    this.recording = false;
  }

  console.log('dump exit, recording: ' + this.isRecording());
};
Recorder.prototype._handleTranscodeExit = function (code, signal) {
  clearTimeout(this.transcodeKillTimeout);
  this.transcodeKillTimeout = null;
  this.transcodeProc = null;

  if (this.dumpProc === null) {
    this.recording = false;
  }

  console.log('transcode exit, recording: ' + this.isRecording());
};

// forcefully kill recorder processes (cleanup is handled by exit handlers)
Recorder.prototype._killDump = function () {
  if (this.dumpProc !== null) {
    this.dumpProc.kill('SIGKILL');
  }
};
Recorder.prototype._killTranscode = function () {
  if (this.transcodeProc !== null) {
    this.transcodeProc.kill('SIGKILL');
  }
};

// determine whether we're currently recording, i.e. either process is alive
Recorder.prototype.isRecording = function () {
  // must have been unflagged and have no processes running anymore
  return this.recording || this.dumpProc !== null || this.transcodeProc !== null;
};

// start recording a stream
Recorder.prototype.record = function (stream) {
  // do nothing if already recording
  if (this.isRecording()) {
    return;
  }

  // mark that we're recording
  this.recording = true;

  // create the specified stream folder
  fs.mkdirSync(stream.name);

  // build the dump process
  // ffmpeg -y -i 'rtp://127.0.0.1:5004' -c copy -absf aac_adtstoasc
  //     -movflags faststart+frag_keyframe+empty_moov dump.mp4
  var dumpArgs = [
    '-y',
    '-i', this.ffmpegInput,
    '-c', 'copy',
    '-bsf:a', 'aac_adtstoasc',
    '-movflags', ['faststart', 'frag_keyframe', 'empty_moov'].join('+'),
    '-f', 'mp4',
    'pipe:1'
  ];

  // start dumping from the configured H264 source
  this.dumpProc = child_process.spawn('ffmpeg', dumpArgs, {
    cwd: './' + stream.name,
    stdio: ['ignore', 'pipe', process.stderr]
  });

  // ./bintail dump.mp4 | ffmpeg -y -i pipe:0 -c:v libvpx -vb 2000k
  //     -quality realtime -qmin 10 -qmax 42 -c:a libvorbis -b:a 128k
  //     -map 0 -f segment -segment_time 10 dump-%d.webm
  var transcodeArgs = [
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
  this.transcodeProc = child_process.spawn('ffmpeg', transcodeArgs, {
    cwd: './' + stream.name,
    stdio: ['pipe', process.stdout, process.stderr]
  });

  // pipe dump output to transcode input
  this.dumpProc.stdout.pipe(this.transcodeProc.stdin);

  // make the processes clean themselves up on exit
  this.dumpProc.on('exit', this._handleDumpExit.bind(this));
  this.transcodeProc.on('exit', this._handleTranscodeExit.bind(this));
};

// stop recording processes
Recorder.prototype.stop = function () {
  // do nothing if not already recording
  if (!this.isRecording()) {
    return;
  }

  // try to SIGTERM the current recording processes nicely
  this.dumpProc.kill();
  this.transcodeProc.kill();

  // set fallbacks to SIGKILL the processes if they don't respond
  this.dumpKillTimeout = setTimeout(this._killDump.bind(this),
      this.processExitTimeout);
  this.transcodeKillTimeout = setTimeout(this._killTranscode.bind(this),
      this.processExitTimeout);

  // mark that we're no longer recording (processes will be cleaned up soon)
  this.recording = false;
};

// start a new Recorder directly, since this module is always launched via
// child_process.fork() in a Streamify parent.
var recorder = new Recorder(config);
