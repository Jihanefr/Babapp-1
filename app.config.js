const base = require('./app.json');

module.exports = {
  ...base.expo,
  android: {
    ...base.expo.android,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
      },
    },
  },
};
