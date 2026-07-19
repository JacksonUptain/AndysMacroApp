# Andy's Macro Counter

A responsive macro counter for calories, carbohydrates, fats, and protein. Users must sign in with Google, and each user's saved foods and logs live under their own Firebase account.

## What It Does

- Sign in with Google through Firebase Authentication.
- Save each user's data at `users/{uid}/macroState` in `https://andrews-macro-counter-default-rtdb.firebaseio.com/`.
- Initialize Firebase Analytics in supported browsers.
- Save foods with exact macro values.
- Add saved foods to any day.
- Review daily, weekly, and monthly macro totals.

## Run Locally

```bash
npm install
npm run dev
```

## Firebase Setup

The web Firebase config is already in [app/firebase.ts](./app/firebase.ts). Firebase web API keys are public identifiers; protect the data with Authentication and Realtime Database rules.

1. In the Firebase console for `andrews-macro-counter`, enable Google in Authentication > Sign-in method.
2. In Authentication > Settings > Authorized domains, add `localhost`, your GitHub Pages domain such as `your-user-name.github.io`, and any custom domain you attach later.
3. In Realtime Database > Rules, publish the rules from [firebase.database.rules.json](./firebase.database.rules.json).

You can also deploy the rules from this repo:

```bash
npm install --global firebase-tools
firebase login
firebase use andrews-macro-counter --add
firebase deploy --only database
```

## GitHub Pages

This repo includes a GitHub Actions workflow at [.github/workflows/deploy-pages.yml](./.github/workflows/deploy-pages.yml). It builds a static Next export into `out/` and deploys that folder to Pages.

1. Push the repo to GitHub.
2. In the GitHub repo, go to Settings > Pages.
3. Set Build and deployment > Source to GitHub Actions.
4. Push to `main`, or run the workflow manually from the Actions tab.

To preview the static Pages build on your machine:

```bash
npm run build:pages
```

The workflow automatically handles repository Pages paths like `/repo-name`. For a custom domain, set `NEXT_PUBLIC_BASE_PATH` to an empty value and `NEXT_PUBLIC_SITE_URL` to the final domain in the workflow or repository variables.

## Phone App Options on Mac

### Fastest: Install as a Home Screen App

After GitHub Pages is live, open the Pages URL on your iPhone in Safari, tap Share, then Add to Home Screen. The app uses [public/manifest.webmanifest](./public/manifest.webmanifest), so it opens in standalone app mode.

### Native iOS Wrapper with Capacitor

The Capacitor code is already included in [capacitor.config.ts](./capacitor.config.ts). On your Mac:

1. Install Xcode from the Mac App Store and open it once so it finishes setup.
2. Plug in your iPhone.
3. Run the first-time iOS project creation:

```bash
npm run ios:add
```

4. Open the app in Xcode:

```bash
npm run ios:open
```

5. In Xcode, select your signing team and a unique bundle identifier. The starter bundle ID is `com.andysmacro.counter`.
6. Choose your iPhone as the run target and press Run.

After future web changes, use:

```bash
npm run ios:sync
```

For TestFlight or App Store distribution, you will need an Apple Developer Program account.

## Verify

```bash
npm run build
npm test
npm run test:pages
npm run lint
```
