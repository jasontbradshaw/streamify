define([
  'components/jquery/jquery',
  'components/underscore-amd/underscore',
  'components/backbone-amd/backbone'
], function ($, _, Backbone) {
  var Stream = Backbone.Model.extend({
    defaults: {
      id: '',
      size: 0,
      segmentCount: 0,
      createDate: null,
      updateDate: null
    },

    initialize: function () {

    }
  });

  return Stream;
});
