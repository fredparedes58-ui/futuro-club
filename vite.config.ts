import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 5200,
    hmr: {
      overlay: false,
    },
    proxy: {
      // Proxy API calls to Vercel dev server (run `vercel dev --listen 3001` separately)
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "::",
    port: 5200,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png", "icon.svg"],
      manifest: {
        name: "VITAS · Football Intelligence",
        short_name: "VITAS",
        description: "Inteligencia futbolística con corrección de maduración biológica. Detecta talento oculto en academias juveniles.",
        theme_color: "#f0f4f8",
        background_color: "#f0f4f8",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        lang: "es",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        importScripts: ["custom-sw.js"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        // ── CRITICAL: prevent stale index.html from serving old chunk references
        // skipWaiting + clientsClaim → new SW takes control of all tabs IMMEDIATELY
        // on activation, instead of waiting for them to close. Combined with the
        // NetworkFirst handler for navigations below, this ensures a fresh
        // deploy is picked up on the next request, not after a manual refresh.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Navigations (index.html / SPA routes): ALWAYS try the network
            // first to pick up new asset hashes. Cache is only used when
            // offline. 3s timeout falls back to cache on slow networks.
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "vitas-html",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // JS/CSS chunks: filenames have a content hash, so the content
            // is immutable. Safe to CacheFirst forever — when the hash
            // changes (= content changed), it's a different URL.
            urlPattern: /\/assets\/.*\.(?:js|css|woff2)(?:\?.*)?$/,
            handler: "CacheFirst",
            options: {
              cacheName: "vitas-immutable-assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Cache API data for offline access (StaleWhileRevalidate)
            urlPattern: /\/api\/(players\/crud|rankings\/list|scout\/insights|videos\/list)/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "vitas-api-data",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }, // 24h
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache DiceBear avatars
            urlPattern: /^https:\/\/api\.dicebear\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "vitas-avatars",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 }, // 30 days
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
    // Sentry source maps upload (only in production build with auth token)
    mode === "production" &&
      process.env.SENTRY_AUTH_TOKEN &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
      }),
  ].filter(Boolean),
  build: {
    sourcemap: true,
    rollupOptions: {
      external: ["@mediapipe/tasks-vision"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  assetsInclude: ["**/*.onnx"],
  worker: {
    format: "es",
  },
}));
