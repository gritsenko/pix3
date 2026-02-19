{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@pix3/runtime": ["./runtime/src"],
      "@pix3/runtime/*": ["./runtime/src/*"],
      "@pix3/engine": ["./src/engine-api.ts"]
    }
  },
  "include": ["src", "runtime/src"]
}
