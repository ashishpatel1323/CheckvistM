const { getSentryExpoConfig } = require('@sentry/react-native/metro')
const { withNativeWind } = require('nativewind/metro')

const config = getSentryExpoConfig(__dirname)

config.resolver.extraNodeModules = {
  '@': `${__dirname}/src`,
}

module.exports = withNativeWind(config, { input: './src/global.css' })
