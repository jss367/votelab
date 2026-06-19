This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Firebase config (required for the `/elections` route)

The Run Elections app (`/elections`) reads its Firebase config from
`NEXT_PUBLIC_FIREBASE_*` environment variables (see `election/firebaseConfig.ts`
and `.env.example`). These are **public** client values, but they must be present
at **build time** — `next build` inlines them into the client bundle, and the app
throws `Missing required environment variable: …` at runtime if they are missing.

For local builds/deploys, copy `.env.example` to `.env` (gitignored) and fill in
the values. In CI, provide them as environment variables. `turbo.json` tracks both
`.env` and the `NEXT_PUBLIC_FIREBASE_*` vars so the build cache invalidates when
they change (otherwise a cached env-less build can be deployed by mistake).

## Deploy

```bash
npm run deploy   # builds the hub and runs `firebase deploy --only hosting`
```

The Firebase Hosting target is set in `firebase.json` (`site`). It currently
points at the `votelab-hub` staging site; the production cutover flips it to
`votelab` (votelab.web.app).
