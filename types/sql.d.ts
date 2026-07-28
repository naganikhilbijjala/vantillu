/**
 * `drizzle/migrations.js` imports the generated `.sql` files directly; Metro resolves
 * them via `config.resolver.sourceExts` and `babel-plugin-inline-import` turns each into
 * a string at build time. This tells TypeScript the same thing.
 */
declare module '*.sql' {
  const content: string;
  export default content;
}
