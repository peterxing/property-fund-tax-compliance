// Lets Node import the app's TypeScript/TSX the way the esbuild bundle sees it. Use it as a preload:
//   node --disable-warning=ExperimentalWarning --import ./scripts/register-esbuild.mjs --test "test/ui/**/*.test.tsx"
// The work is done by scripts/esbuild-hooks.mjs (registered here with module.register()).
import { register } from "node:module";

// React ships a development build (the only one that provides act()) unless NODE_ENV is "production".
if (process.env.NODE_ENV === undefined || process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
process.setSourceMapsEnabled(true);

register("./esbuild-hooks.mjs", import.meta.url);
