require.config({
  shim: {
    'components/jquery/jquery': { exports: '$' },
    'components/backbone-amd/backbone': {
      deps: [
        'components/jquery/jquery',
        'components/underscore-amd/underscore',
      ]
    }
  }
});
