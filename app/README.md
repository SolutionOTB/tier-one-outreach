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
* iOS permission strings live in `ios/App/App/Info.plist`: `NSContactsUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`.
* `NSPhotoLibraryAddUsageDescription` is the add only string. `@capacitor-community/media` saves a post image to the camera roll without naming an album, which on iOS 14 and later asks for add only access. The app never reads the photo library.
* Android permissions live in `android/app/src/main/AndroidManifest.xml`: `READ_CONTACTS`, `CAMERA`, plus a `queries` block so the app can resolve the mail, messaging and browser apps the send buttons open.
* `WRITE_CONTACTS` is declared only because the contacts plugin's permission alias covers read and write together. The app never writes a contact.
* Icons come from `resources/icon-192.png` and `resources/icon-512.png`, built from the Aflac wordmark inside index.html. The native icon sets are already generated: `ios/App/App/Assets.xcassets/AppIcon.appiconset` and the Android mipmap folders.
* iOS uses Swift Package Manager, not CocoaPods. Capacitor 8 generates `ios/App/CapApp-SPM/Package.swift` and no Podfile.

## Posting to Instagram and Facebook

Instagram will not take a feed post from another app. Anything handed to its share extension opens
the Stories composer, which is 9:16, so a 1080 square post is scaled up to fill the frame and the
sides are cropped. There is no URL scheme or API that prefills a feed post with a caption.

So the Post to Instagram and Post to Facebook buttons do the three steps by hand: save the image to
the camera roll through `@capacitor-community/media`, copy the approved caption, then open the app.
The associate starts a post, picks the image and pastes. Each card offers only its own network,
because the Facebook image is 1200x630 and the Instagram image is 1080x1080.

Share another way keeps the plain share sheet for Messages, mail and anything else.

## Native contacts

`window.Contacts` in `kit/cloud.js` is the one interface the screens call. `available()` returns
`native` when the Capacitor contacts plugin answers, `web` when Android Chrome offers its own
picker, and `file` otherwise. `pick()` follows that: the native path asks for permission, reads
name, emails and phones, and opens an in app list with a search box, checkboxes and an Add selected
button. Picked people go into the contact list with the same duplicate check the vCard import uses,
then `renderContacts()` runs so the cloud sync fires.

The plugin is `@capacitor-community/contacts`. The page has no bundler, so the bridge finds the
plugin three ways, in order: `Capacitor.Plugins.Contacts`, `Capacitor.registerPlugin`, and the
`Capacitor.PluginHeaders` plus `Capacitor.nativePromise` pair that the native runtime injects on its
own. The last one is what actually runs in this app.

`npm test` runs the bridge, the link rules and the QR fallback against a fake native runtime in
jsdom: 42 checks, no phone or emulator needed.

## Links, camera and sign in

* Two hosts open in the in app browser through `@capacitor/browser`: `buy.aflac.com` and the
  Unsubscribe function host `pytbtuzeeguqgrhszmpr.functions.supabase.co`. The list is `INAPP_HOSTS`
  in `kit/cloud.js`. Every other link stays on the path it always used, and anything that is not
  http or https, so mailto, sms and the Gmail and Outlook app schemes, goes to the phone's own apps.
* The QR scanner is the same `getUserMedia` code the website uses. On Android the WebView maps the
  camera request to the `CAMERA` permission we declare, and `BarcodeDetector` is built in. On iOS
  there is no `BarcodeDetector`, so it falls back to jsQR from the CDN. It also falls back to jsQR
  when `BarcodeDetector` exists but its `detect` rejects, which it does on some Android builds.
  Nothing native was added.
  If the scanner fails on a real device, add `@capacitor-mlkit/barcode-scanning` and use it when
  native, keeping the web scanner as the fallback.
* Sign in inside the app is the 6 digit code. The magic link in the same email is pointed at
  https://outreach.benefitsotb.com so it opens the website in Safari rather than a dead app URL. The
  code field asks for a numeric keyboard, is focused once the code is sent, and submits by itself at
  six digits.

## Cloud builds

`codemagic.yaml` at the repo root has two workflows, both started by hand from the Codemagic UI.
Neither one runs on a push.

* `android-debug` assembles a debug APK and leaves it in the artifacts. Free, no Apple account,
  and the right way to prove a change before spending an iOS build on it.
* `ios-testflight` builds, signs and uploads to TestFlight. Signing comes from an App Store Connect
  integration named `Tier One Outreach ASC` that lives in the Codemagic UI. There are no secrets in
  the repo and no environment variable groups to create.

Both workflows run `npm ci`, `npm test` and `npm run build:www` before Capacitor copies the web
assets into the platform project, so a failing test stops the build.

The iOS build number comes from Codemagic's `BUILD_NUMBER`, applied with `agvtool`. That needs
`VERSIONING_SYSTEM = "apple-generic"`, which is set on both build configurations in
`ios/App/App.xcodeproj/project.pbxproj`. Capacitor does not set it.

Click by click setup, from the Apple key to the public TestFlight link, is in the OneDrive project
folder at `Brand Assets/agent/TESTFLIGHT-STEPS.md`.

## Not in git

`node_modules`, `app/www`, the iOS and Android build folders. `app/www` is generated, so any build has to run `npm run build:www` first.
