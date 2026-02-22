{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@pix3/runtime": ["./pix3-runtime/src"],
      "@pix3/runtime/*": ["./pix3-runtime/src/*"]
    }
  },
  "include": ["src", "pix3-runtime/src"]
}