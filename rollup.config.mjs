import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

export default [
  // ESM bundle
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'es',
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        sourceMap: true,
      }),
    ],
  },
  // CJS bundle
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true,
    },
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        sourceMap: true,
      }),
    ],
  },
  // Type declarations
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
];
