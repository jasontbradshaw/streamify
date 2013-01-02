define([
  'components/jquery/jquery',
  'components/underscore-amd/underscore',
  'components/backbone-amd/backbone',
  'models/segment'
], function ($, _, Backbone, Segment) {
  var SegmentCollection = Backbone.Collection.extend({
    model: Segment
  });

  return SegmentCollection;
});
