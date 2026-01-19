import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ca.onsiteclub.calculator',
  appName: 'OnSite Calculator',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // Desabilita CapacitorHttp para evitar bug que remove query params
    // https://github.com/ionic-team/capacitor/issues/7319
    CapacitorHttp: {
      enabled: false
    }
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
      keystorePassword: undefined,
      keystoreAlias: undefined,
      keystoreAliasPassword: undefined,
    },
  },
};

export default config;
