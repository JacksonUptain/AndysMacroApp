# Andy's Macro Counter

A simple web-first macro counter for calories, carbohydrates, fats, and protein.

## What It Does

- Save foods with exact macro values.
- Add saved foods to any day.
- Automatically total calories, carbs, fat, and protein.
- Adjust servings in quarter-serving steps.
- Set optional daily targets.
- Review the last seven days of totals.
- Persist data locally in the browser with `localStorage`.

## Web-First, Native-Ready

This first version is built as a responsive installable web app. The current
state model is intentionally local-first, which keeps the product simple and
makes it a good candidate for a later native wrapper such as Capacitor.

When the app needs synced accounts, shared data across devices, or server-side
food libraries, add a small persistence layer behind the existing food and log
operations.

## Run Locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm run build
npm test
```
