const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineString } = require('firebase-functions/params');
const webpush = require("web-push");

// Initialize Firebase and set global options once.
initializeApp();
setGlobalOptions({ maxInstances: 10 });

// Define environment variables for VAPID keys using the v2 method.
const VAPID_PUBLIC_KEY = defineString("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineString("VAPID_PRIVATE_KEY");

// --- HELPER FUNCTION ---
/**
 * Initializes VAPID details for web-push.
 */
const initializeWebPush = () => {
    try {
        const publicKey = VAPID_PUBLIC_KEY.value();
        const privateKey = VAPID_PRIVATE_KEY.value();

        if (!publicKey || !privateKey) {
            console.error("VITAL: VAPID keys are not defined. Deploy with `firebase deploy` and enter values when prompted.");
            return false;
        }

        webpush.setVapidDetails(
            "mailto:your-email@example.com", // Replace with your contact email
            publicKey,
            privateKey
        );
        return true;
    } catch (e) {
        console.error("VITAL: Error initializing web-push. Make sure VAPID keys are set in your environment.", e);
        return false;
    }
};

// --- TRANSACTION NOTIFICATION FUNCTION ---
exports.sendTransactionNotification = onDocumentUpdated("artifacts/{appId}/public/data/poker-sessions/{sessionId}", async (event) => {
    if (!initializeWebPush()) return null;

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const appId = event.params.appId;

    const oldLog = beforeData.transactionLog || [];
    const newLog = afterData.transactionLog || [];

    if (newLog.length === oldLog.length) return null;

    const transaction = newLog[newLog.length - 1];
    const involvedPlayers = new Set();
    let notificationPayload = {};

    if (transaction.type === "Player Buy-in" && transaction.source && transaction.source.startsWith("from ")) {
        const sellerName = transaction.source.replace("from ", "");
        involvedPlayers.add(sellerName);
        notificationPayload = {
            title: "Chip Sale",
            body: `${transaction.player} bought ${transaction.amount} chips from you.`,
        };
    } else {
        return null; // Only notify on player-to-player transactions
    }

    if (involvedPlayers.size === 0) return null;

    const playersInSession = afterData.players || [];
    const uidsToNotify = playersInSession
        .filter((p) => involvedPlayers.has(p.name) && p.status === "joined" && p.uid)
        .map((p) => p.uid);

    if (uidsToNotify.length === 0) return null;

    const db = getFirestore();
    const promises = uidsToNotify.map(async (uid) => {
        const userRef = db.doc(`artifacts/${appId}/public/data/users/${uid}`);
        const userDoc = await userRef.get();
        if (userDoc.exists() && userDoc.data().notificationSubscription) {
            const subscription = userDoc.data().notificationSubscription;
            try {
                await webpush.sendNotification(subscription, JSON.stringify(notificationPayload));
            } catch (error) {
                console.error(`Failed to send transaction notification to UID ${uid}:`, error.body || error);
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await userRef.update({ notificationSubscription: null });
                }
            }
        }
    });

    await Promise.all(promises);
    return { success: true };
});


// --- ADMIN TEST NOTIFICATION FUNCTION ---
// FIXED: The trigger path now correctly matches the front-end code.
exports.sendTestNotificationOnRequest = onDocumentWritten("artifacts/{appId}/tasks/{taskId}", async (event) => {
    if (!event.data.after.exists) {
        return null;
    }

    if (!initializeWebPush()) {
        return null;
    }

    const taskData = event.data.after.data();
    const appId = event.params.appId;

    if (taskData.type !== 'sendTestNotification') {
        return null;
    }

    const requesterName = taskData.displayName || "An admin";
    console.log(`Test notification requested by ${requesterName} for app ID: ${appId}`);

    const db = getFirestore();
    const usersSnapshot = await db.collection(`artifacts/${appId}/public/data/users`).get();
    
    if (usersSnapshot.empty) {
        console.log("No user documents found to send notifications to.");
        return event.data.after.ref.delete();
    }

    console.log(`Found ${usersSnapshot.size} total user documents.`);

    const notificationPayload = JSON.stringify({
      title: "Poker Night Ledger Test",
      body: `This is a test notification sent by ${requesterName}.`,
      icon: "/favicon.ico",
    });

    const promises = [];
    let validSubscriptions = 0;

    usersSnapshot.forEach((doc) => {
      const user = doc.data();
      if (user.notificationSubscription && user.notificationSubscription.endpoint) {
        validSubscriptions++;
        const subscription = user.notificationSubscription;
        console.log(`Sending test notification to user: ${user.displayName || doc.id}`);
        
        const pushPromise = webpush.sendNotification(subscription, notificationPayload)
          .then(() => {
              console.log(`SUCCESS: Notification sent to ${user.displayName || doc.id}`);
          })
          .catch((error) => {
            console.error(`ERROR sending notification to ${user.displayName || doc.id}:`, error.body || error);
            if (error.statusCode === 404 || error.statusCode === 410) {
              console.log("Subscription is invalid, deleting from user profile.");
              return doc.ref.update({ notificationSubscription: null });
            }
          });
        promises.push(pushPromise);
      }
    });

    console.log(`Attempting to send notifications to ${validSubscriptions} users with subscriptions.`);

    await Promise.all(promises);
    console.log("Finished sending all test notifications.");

    return event.data.after.ref.delete();
});
