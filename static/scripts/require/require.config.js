require.config({
  baseUrl: 'scripts',
  shim: {
    'vendor/jquery': { exports: '$' },
    'vendor/underscore': { exports: '_' },
    'vendor/backbone': {
      deps: ['vendor/jquery', 'vendor/underscore'],
      exports: 'Backbone'
    }
  }
});
