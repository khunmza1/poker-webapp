# Agent Instructions for Poker Night Ledger

Hello, Agent! This document provides instructions for setting up and running this application, particularly concerning the Firebase configuration required for push notifications.

## 1. Firebase Project Setup

This project uses Firebase for authentication, Firestore database, and Firebase Cloud Messaging (FCM) for push notifications. You must have a Firebase project to run this application.

## 2. Environment Configuration

The application uses Vite and expects Firebase configuration to be provided via environment variables.

### Steps:

1.  **Create a `.env.local` file** in the root directory of this project. This file is for local development and should not be committed to version control.

2.  **Populate `.env.local` with your Firebase credentials.** You can find these credentials in your Firebase project settings.
    - Go to your Firebase project: [https://console.firebase.google.com/](https://console.firebase.google.com/)
    - Click on the gear icon (Project settings) next to "Project Overview".
    - Under the "General" tab, scroll down to "Your apps".
    - Select your web app.
    - You will find the `firebaseConfig` object. Copy the values into your `.env.local` file, adding the `VITE_` prefix to each key.

    Your `.env.local` file should look like this:

    ```
    VITE_FIREBASE_API_KEY="YOUR_API_KEY"
    VITE_FIREBASE_AUTH_DOMAIN="YOUR_AUTH_DOMAIN"
    VITE_FIREBASE_PROJECT_ID="YOUR_PROJECT_ID"
    VITE_FIREBASE_STORAGE_BUCKET="YOUR_STORAGE_BUCKET"
    VITE_FIREBASE_MESSAGING_SENDER_ID="YOUR_MESSAGING_SENDER_ID"
    VITE_FIREBASE_APP_ID="YOUR_APP_ID"
    ```

3.  **Add your VAPID Key for Push Notifications.**
    - In your Firebase project settings, go to the "Cloud Messaging" tab.
    - Under "Web configuration", you will find "Web Push certificates".
    - Generate a new key pair if you don't have one.
    - Copy the **public key** value.
    - Add it to your `.env.local` file:

    ```
    VITE_VAPID_PUBLIC_KEY="YOUR_PUBLIC_VAPID_KEY"
    ```

## 3. Firebase Messaging Service Worker

The service worker file required for Firebase Messaging (`public/firebase-messaging-sw.js`) is generated automatically during the build process (`npm run build`).

The script (`generate-sw.js`) uses the Firebase environment variables you set in your `.env.local` file to create the service worker with the correct configuration. You do not need to manually edit this file.

After setting your environment variables, you can run the application locally (`npm install && npm run dev`) and the "Enable Notifications" feature should work correctly. For production, the build command will handle the file generation.
