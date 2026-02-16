# VoteLab

A monorepo of voting applications built with Turborepo. Explore and run elections using a variety of voting methods.

**Live site:** [votelab.web.app](https://votelab.web.app)

## Apps

- **election-site** — Create and run elections with any voting method. Vite + React, hosted on Firebase.
- **visualizations** — Interactive visualizations of how voting methods behave. Next.js.

## Packages

- **@votelab/shared-utils** — Shared voting logic, tally functions, and types
- **@repo/ui** — Shared React component library

## Supported Voting Methods

- Plurality
- Approval
- Instant Runoff (IRV)
- Borda Count
- Condorcet
- Smith + Approval
- Reweighted Range Voting (RRV)
- STAR
- Score
- Single Transferable Vote (STV)
- Ranked Pairs (Tideman)
- Majority Judgment
- Cumulative

## Development

```sh
npm install
npm run dev
```

## Testing

```sh
npm test
```

## Build

```sh
npm run build
```
