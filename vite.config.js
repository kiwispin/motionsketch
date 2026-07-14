import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const portable = mode === 'portable';

  return {
    base: portable ? './' : '/motionsketch/',
    plugins: portable ? [viteSingleFile()] : [],
    build: {
      outDir: portable ? 'dist-portable' : 'dist',
      emptyOutDir: true,
      target: 'es2022'
    },
    test: {
      environment: 'node',
      include: ['tests/unit/**/*.test.js']
    }
  };
});
