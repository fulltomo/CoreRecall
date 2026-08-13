import globals from "globals";

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        FSRS: "writable",
        App: "writable",
        Card: "writable",
        DAY: "readonly",
        W: "readonly",
        clamp: "readonly",
        fsrs: "readonly",
        schedule: "readonly",
        fmtInterval: "readonly",
        parseCSV: "readonly",
        intervalDays: "readonly",
        retrievability: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
    }
  }
];
