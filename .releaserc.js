const { join } = require('path');

module.exports = {
  branches: ['main'],
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'angular',
        releaseRules: [
          {
            type: 'feature',
            release: 'minor',
          },
        ],
      },
    ],
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    [
      '@google/semantic-release-replace-plugin',
      {
        replacements: [
          {
            files: ['package.json'],
            from: /(?<="version":\s*").*(?=")/,
            to: '${nextRelease.version}',
            countMatches: true,
            results: [
              {
                file: 'package.json',
                hasChanged: true,
                numMatches: 1,
                numReplacements: 1,
              },
            ],
          },
        ],
      },
    ],
    [
      '@semantic-release/exec',
      {
        publishCmd: 'yarn build',
      },
    ],
    [
      '@semantic-release/exec',
      {
        verifyConditionsCmd: './bin/presign',
        publishCmd: 'yarn codesign',
      },
    ],
    '@semantic-release/git',
    [
      '@semantic-release/github',
      {
        assets: 'release/*',
      },
    ],
    [
      '@semantic-release/exec',
      {
        verifyConditionsCmd: 'test -n "$YARN_NPM_AUTH_TOKEN"',
        publishCmd: 'yarn npm publish',
      },
    ],
  ],
  extends: 'semantic-release-monorepo',
};
