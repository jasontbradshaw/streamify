var fs = require('fs');

// stores information about processes that are recording a stream
var RecordState = function (path, stream) {
  // the file where dumped data lives
  this.path = path;

  // the name of the current stream being recorded
  this.stream = stream || null;

  // the PIDs of recovered or current processes
  this.dumpPid = null;
  this.transcodePid = null;

  // either child_process objects or null if recovered from a crash
  this.dumpProc = null;
  this.transcodeProc = null;
};

RecordState.prototype.setDumpProc = function (proc) {
  this.dumpProc = proc;
  this.dumpPid = proc.pid;
  return this;
};

RecordState.prototype.setTranscodeProc = function (proc) {
  this.transcodeProc = proc;
  this.transcodePid = proc.pid;
  return this;
};

// determine whether this object was generated from dumped data after a crash
RecordState.prototype.recoveredFromCrash = function () {
  // we don't have child_process objects if recovered from a crash
  return !this.dumpProc || !this.transcodeProc;
};

// synchronously loads existing process data from a file, returning a new object
// if the file existed and had valid data, otherwise null.
RecordState.load = function (path) {
  try {
    // attempt to recover stored data
    var recoveredData = JSON.parse(fs.readFileSync(path).toString());

    // set the available data, but leave *proc variables empty
    var rs = new RecordState(path);
    rs.stream = recoveredData.stream;
    rs.dumpPid = recoveredData.dumpPid;
    rs.transcodePid = recoveredData.transcodePid;

    return rs;
  } catch (e) {
    return null;
  }
};

// dumps current information to a JSON file for recovery information
RecordState.prototype.store = function () {
  // write the data to a file, returning whether the write was successful
  try {
    // write a simple data structure to disk
    fs.writeFileSync(this.path, JSON.stringify({
      stream: this.stream,
      dumpPid: this.dumpPid,
      transcodePid: this.transcodePid
    }));
    return true;
  } catch (e) {
    return false;
  }
};

// clear any current state and return whether we removed a state file
RecordState.prototype.clear = function () {
  // remove the file if it exists, and return whether we removed anything
  var cleared = false;
  if (fs.existsSync(this.path)) {
    fs.unlinkSync(this.path);
    cleared = true;
  }

  return cleared;
};

module.exports = RecordState;
