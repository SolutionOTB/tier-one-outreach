# Tier One Outreach, native shell

Capacitor wrapper around the same web app that runs at https://outreach.benefitsotb.com.

* App id: `com.solutionotb.tieroneoutreach`
* App name: Tier One Outreach
* Capacitor 8, iOS and Android targets
* Web assets are bundled in the app, not loaded from the website

## Where the code lives

The web app is one HTML file. It is built outside this repo:

1. Edit the kit files in OneDrive: `Brand Assets/agent/kit/` (kit.json, email-template.html, kit-overrides.js, cloud.js).
2. Run `python inject.py` in that folder. It rewrites `Brand Assets/index.html`.
3. Copy that `index.html` to the root of this repo and commit it. GitHub Pages serves the root, so the website updates.
4. Run `npm run build:www` here. It copies the root `index.html` and the `kit/` post images into `app/www`, and adds the manifest and icon tags to the copy only.

The root `index.html` and `CNAME` stay at the repo root. Nothing in `app/` is served by Pages.

## Commands

```
npm install          # once
npm run build:www    # repo root index.html plus kit images -> app/www
npm run sync         # build:www, then cap sync (both platforms)
npm run sync:android # Android only
npx cap open android # needs Android Studio
```

On Windows, `cap sync` finishes for both platforms. Xcode work happens on the Mac that Codemagic runs.

## Native bits

* `capacitor.config.ts`: `androidScheme` is `https` so localStorage and the Supabase session behave like the website. iOS stays on the default `capacitor` scheme because WKWebView does not let an app handle `https` itself.
* iOS permission strings live in `ios/App/App/Info.plist`: `NSContactsUsageDescription`, `NSCameraUsageDescription`.
* Android permissions live in `android/app/src/main/AndroidManifest.xml`: `READ_CONTACTS`, `CAMERA`, plus a `queries` block so the app can resolve the mail, messaging and browser apps the send buttons open.
* Icons come from `resources/icon-192.png` and `resources/icon-512.png`, built from the Aflac wordmark inside index.html. The native icon sets are already generated: `ios/App/App/Assets.xcassets/AppIcon.appiconset` and the Android mipmap folders.
* iOS uses Swift Package Manager, not CocoaPods. Capacitor 8 generates `ios/App/CapApp-SPM/Package.swift` and no Podfile.

## Not in git

`node_modules`, `app/www`, the iOS and Android build folders. `app/www` is generated, so any build has to run `npm run build:www` first.
