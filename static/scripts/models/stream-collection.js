define([
  'components/jquery/jquery',
  'components/underscore-amd/underscore',
  'components/backbone-amd/backbone',
  'models/stream'
], function ($, _, Backbone, Stream) {
  var StreamCollection = Backbone.Collection.extend({
    model: Stream,
    url: '/streams'
  });

  return StreamCollection;
});
