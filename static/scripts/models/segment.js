define([
  'components/jquery/jquery',
  'components/underscore-amd/underscore',
  'components/backbone-amd/backbone'
], function ($, _, Backbone) {
  var Segment = Backbone.Model.extend({
    defaults: {
      id: '',
      size: 0,
      start: 0,
      end: 0,
      duration: 0,
      create_date: null,
      update_date: null
    },

    initialize: function () {

    }
  });

  return Segment;
});
