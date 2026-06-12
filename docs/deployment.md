# Deployment

companyPlan is a static Vite app. The current deployment target is GitHub Pages.

## Deployment Branch

```text
gh-pages
```

The `gh-pages` branch contains the latest built static files.

## GitHub Pages Status

GitHub Pages is live:

```text
https://soyooaitools.github.io/companyPlan/
```

The repository is public and Pages is configured to publish from the `gh-pages` branch root.

## Deployment Method

Deployment currently publishes the built `dist/` directory to the `gh-pages` branch.

This repo is not using a GitHub Actions workflow because the available GitHub token does not have the `workflow` scope required to create or update files under `.github/workflows`.

## Manual Deployment

From the repository root:

```bash
npm run build
```

Then publish `dist/` to `gh-pages`.

The deployed branch should contain the built static files at the branch root:

```text
index.html
assets/
```

GitHub Pages is configured with:

```text
source branch: gh-pages
path: /
```

## Vite Base Path

`vite.config.ts` sets:

```ts
base: command === "build" ? "/companyPlan/" : "/"
```

This keeps local dev at `/` and production assets under the GitHub Pages repository path.

## Manual Verification

Before pushing deployment changes:

```bash
npm run build
```

After deployment finishes, verify:

- `需求提单` opens in the right workspace with the left navigation visible.
- The demand toolbar only contains `添加记录` and `查找`.
- Non-programmer non-admin accounts see only `需求提单` and `延期任务预警` bottom tabs.
- Programmer accounts also see `任务甘特图`, but gantt bars are read-only.
- Admin accounts can drag gantt bars without changing row order or `开始日期`.
