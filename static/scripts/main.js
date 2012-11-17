require([
  'vendor/jquery',
  'vendor/underscore',
  'vendor/backbone'
],
function ($, _, Backbone) {
  var Video = function (containerSelector, streamName) {
    this.$video = $('<video preload="auto" controls></video>');
    this.$preload = $('<video preload="auto" controls></video>');

    this.$container = $(containerSelector);

    // create the video elements
    this.$container.append(this.$video);
    this.$container.append(this.$preload.hide());

    this.index = 0;
    this.streamName = streamName;

    //this.$video.on('ended', this._swap.bind(this));
    //this.$preload.on('ended', this._swap.bind(this));

    // play the first segment
    this.$preload.attr('src', '/streams/' + streamName + '/segments/0.webm');
    $.getJSON('/streams/' + streamName + '/segments/0', (function (data) {
      setTimeout(this._swap.bind(this), data.duration * 1000 - 300);
      this._swap()
    }).bind(this));
  };

  Video.prototype._swap = function () {
    // play the preloaded video
    this.$preload.show()[0].play();

    // hide the old one
    this.$video.hide();

    // swap playing and preload video vars
    var tmp = this.$video;
    this.$video = this.$preload;
    this.$preload = tmp;

    // preload the next video
    this.$preload.attr('src', '/streams/' + this.streamName + '/segments/' +
      ++this.index + '.webm');

    // put the preload video atop the playing one
    this.$container.append(this.$preload);
  };

  $(function () {
    var v = new Video('body', 'stream-2');
  });
});
