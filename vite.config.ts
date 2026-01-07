export default defineConfig({
  base: "/prompt-generator-studio/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: "Prompt Generator Studio",
        short_name: "Prompt Studio",
        description: "Professional AI video prompt generator with timeline scripting",
        start_url: "/prompt-generator-studio/",
        scope: "/prompt-generator-studio/",
        display: "standalone",
        theme_color: "#0b1220",
        background_color: "#0b1220",
        icons: [
          { src: "/prompt-generator-studio/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/prompt-generator-studio/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
          { src: "/prompt-generator-studio/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/prompt-generator-studio/icons/icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
        ],
      },
    }),
  ],
});
