// `rollup.config.js` — see README.md "Bundling notes" for why any of this is here.
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

// zarrita dynamically imports numcodecs/{blosc,lz4,zstd}; a bundler emits all three wasm builds
// whatever the data uses. The v3 stores only use blosc, so lz4/zstd are stubbed with a throwing
// codec (783 KB saved) and blosc is left external so the consumer resolves one shared copy.
const NUMCODECS_STUB = "\0jsrfs:numcodecs-stub:";
const EXTERNAL_NUMCODECS = /^numcodecs\/blosc$/;

const excludeNumcodecs = () => ({
  name: "exclude-numcodecs",
  resolveId(source) {
    if (!/^numcodecs(\/|$)/.test(source)) return null;
    if (EXTERNAL_NUMCODECS.test(source)) return {id: source, external: true};
    return {id: NUMCODECS_STUB + source, moduleSideEffects: false};
  },
  load(id) {
    if (!id.startsWith(NUMCODECS_STUB)) return null;
    const source = id.slice(NUMCODECS_STUB.length);
    return `
      // Stubbed at build time — see README.md "Codecs".
      export default {
        fromConfig() {
          throw new Error(
            "riverforecastsystem excludes ${source}: the v3 stores are written with blosc(zstd, shuffle) and " +
            "blosc is the only numcodecs wasm build bundled. A store compressed with this codec " +
            "cannot be read by this build."
          );
        }
      };
    `;
  }
});

export default {
  // zarrita is deliberately NOT external — bundling it is what makes the stubbing above
  // enforceable. numcodecs is deliberately absent from this list: excludeNumcodecs decides per
  // specifier. chart.js is a peer because Chart.register() mutates module-global state, so a
  // second copy breaks registration rather than just wasting bytes.
  external: [/^chart\.js/, /^chartjs-/, /^date-fns/],
  // Entries are namespaced by model version so an import says which model it reads. Keep readers
  // out of v3/index — it must stay free of zarrita and chart.js.
  input: {
    index: 'src/index.js',
    'v2/index': 'src/v2/index.js',
    'v3/index': 'src/v3/index.js',
    'v3/discharge': 'src/v3/discharge/index.js',
    'v3/floodmaps': 'src/v3/floodmaps/index.js',
    'v3/hydrography': 'src/v3/hydrography/index.js',
    'v3/plots': 'src/v3/plots/index.js'
  },
  output: {
    dir: './dist',
    format: 'es',
    entryFileNames: '[name].esm.js',
    chunkFileNames: 'chunks/[hash].esm.js',
    sourcemap: false
  },
  plugins: [
    // ahead of nodeResolve, so numcodecs is intercepted before it is ever located on disk
    excludeNumcodecs(),
    nodeResolve({browser: true, preferBuiltins: false}),
    commonjs(),
    terser()
  ],
  treeshake: {
    // Keep side effects for chartjs-* — a blanket false drops the date adapter import in
    // plots/shared.js and every time-axis chart dies.
    moduleSideEffects: (id) => /^chartjs-/.test(id)
  }
};