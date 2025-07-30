// This file must be in the public directory.

// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "YOUR_VITE_FIREBASE_API_KEY",
  authDomain: "YOUR_VITE_FIREBASE_AUTH_DOMAIN",
  projectId: "YOUR_VITE_FIREBASE_PROJECT_ID",
  storageBucket: "YOUR_VITE_FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "YOUR_VITE_FIREBASE_MESSAGING_SENDER_ID",
  appId: "YOUR_VITE_FIREBASE_APP_ID"
};


// Initialize the Firebase app in the service worker
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Customize the notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico' // Or path to your app icon
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
