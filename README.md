# Living 3D Portrait

## Local development

Install Node.js 22, then run:

```sh
npm ci
npm run dev
```

Open the address printed by the server. Character Studio's AI generation uses
the Express API in `server.ts` and requires a Gemini or OpenAI API key entered
in the settings.

## GitHub Pages

The Pages workflow builds and deploys pushes to `main` at
https://shahnab.github.io/Living3DPortrait/. In the repository's **Settings >
Pages**, set **Build and deployment > Source** to **GitHub Actions**.

GitHub Pages hosts only static files: the default interactive portrait works,
but AI character generation is unavailable there because it requires the
Express API. Run the app locally to use that feature. The default portrait
also loads its expression images from an external image service.
