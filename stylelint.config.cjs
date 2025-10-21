module.exports = {
  extends: ['stylelint-config-standard'],
  ignoreFiles: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.cache/**',
    'AppData/**',
    'OneDrive/**',
    'Documents/**',
    'Downloads/**',
    'tmp/**',
  ],
  rules: {
    'color-hex-length': 'short',
    'color-function-notation': 'legacy',
    'alpha-value-notation': 'number',
    'keyframes-name-pattern': '^[a-z0-9-]+$',
    'rule-empty-line-before': null,
    'property-no-vendor-prefix': [true, { ignoreProperties: ['background-clip', 'appearance'] }],
    'media-feature-range-notation': null,
    'selector-class-pattern': null,
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['tailwind', 'apply', 'variants', 'responsive', 'screen'],
      },
    ],
  },
};
