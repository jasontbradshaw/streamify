var _ = require('underscore');

// all models must implement toJSON()
var BaseModel = function () { };
BaseModel.prototype.toJSON = function () {
    throw 'toJSON() left undefined'
};

// a basic stream
var Stream = function (name) {
    BaseModel.call(this);

    this.name = name;

    // the size of the stream in bytes
    this.size = 0;

    // number of currently existing segments
    this.segmentCount = 0;

    // Date objects for the create and update dates of the stream
    this.createDate = null;
    this.updateDate = null;
};

Stream.prototype.toJSON = function () {
    return {
        name: this.name,
        segment_count: this.segmentCount,
        size: this.size,

        create_date: this.createDate.getTime(),
        update_date: this.updateDate.getTime()
    };
};

var Segment = function (index) {
    BaseModel.call(this);

    this.index = index;

    // the size of the segment in bytes
    this.size = 0;

    // the timestamps in seconds of the segment
    this.start = 0;
    this.end = 0;

    // the duration of the segment in seconds
    this.duration = 0;

    this.createDate = null;
    this.updateDate = null;
};

Segment.prototype.toJSON = function () {
    return {
        index: this.index,

        size: this.size,
        start: this.start,
        end: this.end,
        duration: this.duration,

        create_date: this.createDate.getTime(),
        update_date: this.updateDate.getTime()
    };
};

module.exports.Stream = Stream;
module.exports.Segment = Segment;
