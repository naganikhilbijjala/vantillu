module.exports = (api) => {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Lets `src/db/migrations.ts` import generated .sql files as strings.
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
