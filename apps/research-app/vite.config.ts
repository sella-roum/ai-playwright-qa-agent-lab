import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const repoName =
  process.env.GITHUB_REPOSITORY?.split('/')[1] || process.env.GITHUB_PAGES_REPO_NAME || 'ai-playwright-qa-agent-lab';
const base = process.env.GITHUB_PAGES === '1' ? `/${repoName}/` : '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
