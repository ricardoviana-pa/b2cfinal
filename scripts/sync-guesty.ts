#!/usr/bin/env tsx
/**
 * Run: pnpm run sync:guesty
 * Fetches listings from Guesty and writes to data/properties-synced.json
 */

import { runSync } from "../server/services/guesty-sync";

runSync()
  .then((path) => {
    console.log("Done:", path);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
