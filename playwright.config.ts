import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env.PLAYWRIGHT_CHANNEL,
    baseURL: 'http://127.0.0.1:4173/halland/',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/run.mjs preview --instance halland --host 127.0.0.1 --port 4173 --strictPort --base /halland/',
      url: 'http://127.0.0.1:4173/halland/',
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/run.mjs preview --instance depot --host 127.0.0.1 --port 4174 --strictPort --base /depot/',
      url: 'http://127.0.0.1:4174/depot/',
      reuseExistingServer: false,
    },
  ],
});
