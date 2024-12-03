const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Handle workspace package resolution
      webpackConfig.resolve.plugins = webpackConfig.resolve.plugins || [];

      // Modify module resolution to look up in the workspace
      webpackConfig.resolve.modules = [
        path.resolve(__dirname, '../../node_modules'),
        path.resolve(__dirname, 'node_modules'),
        'node_modules'
      ];

      return webpackConfig;
    }
  },
};
