define([
  'components/jquery/jquery',
  'components/underscore-amd/underscore',
  'components/backbone-amd/backbone'
], function ($, _, Backbone) {
  var Stream = Backbone.Model.extend({
    urlRoot: '/streams',

    defaults: {
      id: '',
      size: 0,
      segment_count: 0,
      create_date: null,
      update_date: null
    },

    initialize: function () {

    }
  });

  return Stream;
});
