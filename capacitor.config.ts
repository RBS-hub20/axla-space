import type { CapacitorConfig } from "@capacitor/cli";

// Reverse-DNS of axla.space (the domain we actually own), not a literal
// "com.axla.space" / "app.axla.space" guess — this is what Play Store
// expects as an application ID and it must never change after first publish.
const config: CapacitorConfig = {
  appId: "space.axla.app",
  appName: "Axla",
  webDir: "public",
  server: {
    url: "https://axla.space",
    androidScheme: "https",
  },
};

export default config;
