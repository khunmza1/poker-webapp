import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// When using ES modules, __dirname is not available. We need to calculate it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

// --- Validation ---
const missingKeys = Object.entries(firebaseConfig)
  .filter(([key, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.error('Error: Missing Firebase environment variables:');
  missingKeys.forEach(key => console.error(`- VITE_FIREBASE_${key.toUpperCase()}`));
  console.error('\nPlease ensure all VITE_FIREBASE_* variables are set in your environment.');
  process.exit(1); // Exit with an error code
}

// --- File Paths ---
const templatePath = path.join(__dirname, 'firebase-messaging-sw.template.js');
const outputPath = path.join(__dirname, 'public', 'firebase-messaging-sw.js');

// --- Script ---
console.log('Generating firebase-messaging-sw.js...');

// 1. Read the template file
fs.readFile(templatePath, 'utf8', (err, data) => {
  if (err) {
    console.error(`Error reading template file: ${templatePath}`, err);
    process.exit(1);
  }

  // 2. Replace the placeholder with the actual config
  const configString = JSON.stringify(firebaseConfig, null, 2);
  const result = data.replace('__FIREBASE_CONFIG__', configString);

  // 3. Write the new file to the public directory
  fs.writeFile(outputPath, result, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing output file: ${outputPath}`, err);
      process.exit(1);
    }
    console.log(`Successfully generated ${outputPath}`);
  });
});
