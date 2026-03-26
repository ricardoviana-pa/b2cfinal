#!/usr/bin/env node
/**
 * Clear bookingUrl and guestyUrl from properties-synced.json
 * Prevents redirect to booking.portugalactive.com — checkout stays on-site.
 * Run: node scripts/clear-booking-urls.js
 */
const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "../data/properties-synced.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));
let n = 0;
for (const p of data) {
  if (p.bookingUrl) {
    p.bookingUrl = "";
    n++;
  }
  if (p.guestyUrl) {
    p.guestyUrl = "";
    n++;
  }
}
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log("Cleared bookingUrl/guestyUrl from", n, "properties");
