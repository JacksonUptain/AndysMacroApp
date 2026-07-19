import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.andysmacro.counter",
  appName: "Andy's Macro Counter",
  webDir: "out",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
