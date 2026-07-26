const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Drizzle migrations are shipped as .sql and inlined by babel-plugin-inline-import.
config.resolver.sourceExts.push('sql');

module.exports = config;
