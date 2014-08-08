require([
  'components/jquery/jquery',
  'components/underscore-amd/underscore',
  'components/backbone-amd/backbone',
  'models/stream',
  'models/stream-collection',
  'models/segment',
  'models/segment-collection'
],
function ($, _, Backbone,
    Stream, StreamCollection, Segment, SegmentCollection) {

  window.MediaSource = window.MediaSource || window.WebKitMediaSource;

  var GET = function (url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.send();

    xhr.onload = function(e) {
      if (xhr.status != 200) {
        alert("Unexpected status code " + xhr.status + " for " + url);
        return false;
      }
      callback(new Uint8Array(xhr.response));
    };
  };

  var getSegment = function (segmentId, sourceBuffer, callback) {
    var segmentURL = '/streams/stream-2/segments/' + segmentId + '.webm';
    //var segmentURL = '/test.webm';
    GET(segmentURL, function (uInt8Array) {
      callback(uInt8Array);
    });
  };

  $(function () {
    var video = $('video').get(0);
    var mediaSource = new window.MediaSource();
    video.src = window.URL.createObjectURL(mediaSource);

    mediaSource.addEventListener('webkitsourceopen', function (e) {
      var sourceBuffer = mediaSource.addSourceBuffer(
          'video/webm; codecs="vorbis,vp8"');

      // add segments to the video element
      getSegment(0, sourceBuffer, function (segmentData) {
        console.log(mediaSource);
        sourceBuffer.append(segmentData);
      });
    });
  });
});
