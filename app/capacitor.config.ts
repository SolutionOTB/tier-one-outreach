import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.solutionotb.tieroneoutreach',
  appName: 'Tier One Outreach',
  webDir: 'www',
  server: {
    // https on Android so localStorage and the Supabase session behave like the website.
    // iOS stays on the default capacitor scheme: WKWebView will not let an app handle https itself.
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'always'
  }
};

export default config;
