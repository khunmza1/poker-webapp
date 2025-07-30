const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const functions = require("firebase-functions");
const webpush = require("web-push");

// Initialize Firebase and set global options once.
initializeApp();
setGlobalOptions({ maxInstances: 10 });

/**
 * Initializes VAPID details for web-push.
 * It's good practice to do this once and reuse it.
 */
const initializeWebPush = () => {
    // Ensure you have set these in your Firebase environment
    // firebase functions:config:set vapid.public_key="YOUR_KEY"
    // firebase functions:config:set vapid.private_key="YOUR_KEY"
    const vapidPublicKey = functions.config().vapid.public_key;
    const vapidPrivateKey = functions.config().vapid.private_key;

    if (!vapidPublicKey || !vapidPrivateKey) {
        console.error("VAPID keys are not set in Firebase Functions config. Please run 'firebase functions:config:set vapid.public_key=...' and 'vapid.private_key=...'");
        return false;
    }

    webpush.setVapidDetails(
        "mailto:your-email@example.com", // Replace with your contact email
        vapidPublicKey,
        vapidPrivateKey
    );
    return true;
};

// --- YOUR EXISTING FUNCTION (with slight improvements) ---
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
        return null;
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
                console.error(`Failed to send notification to UID ${uid}:`, error);
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await userRef.update({ notificationSubscription: null });
                }
            }
        }
    });

    await Promise.all(promises);
    return { success: true };
});


// --- NEW FUNCTION FOR ADMIN TEST NOTIFICATIONS ---
exports.sendTestNotificationOnRequest = onDocumentWritten("artifacts/{appId}/private/tasks/{taskId}", async (event) => {
    // Only run on document creation
    if (!event.data.after.exists) {
        return null;
    }
    if (!initializeWebPush()) return null;

    const taskData = event.data.after.data();
    const appId = event.params.appId;

    // Ensure this function only handles 'sendTestNotification' tasks
    if (taskData.type !== 'sendTestNotification') {
        return null;
    }

    const requesterName = taskData.displayName || "An admin";
    console.log(`Test notification requested by ${requesterName} for app ID: ${appId}`);

    const db = getFirestore();
    const usersSnapshot = await db.collection(`artifacts/${appId}/public/data/users`).get();
    
    if (usersSnapshot.empty) {
        console.log("No users found to send notifications to.");
        return event.data.after.ref.delete(); // Clean up task
    }

    const notificationPayload = JSON.stringify({
      title: "Poker Night Ledger Test",
      body: `This is a test notification sent by ${requesterName}.`,
      icon: "/favicon.ico", // Make sure you have an icon at this path in your hosting
    });

    const promises = [];
    usersSnapshot.forEach((doc) => {
      const user = doc.data();
      if (user.notificationSubscription && user.notificationSubscription.endpoint) {
        const subscription = user.notificationSubscription;
        console.log(`Sending test notification to user: ${user.displayName || doc.id}`);
        
        const pushPromise = webpush.sendNotification(subscription, notificationPayload)
          .catch((error) => {
            console.error(`Error sending test notification to ${user.displayName}:`, error);
            if (error.statusCode === 404 || error.statusCode === 410) {
              console.log("Subscription is invalid, deleting from user profile.");
              return doc.ref.update({ notificationSubscription: null });
            }
          });
        promises.push(pushPromise);
      }
    });

    await Promise.all(promises);
    console.log("Finished sending all test notifications.");

    // Delete the task document after completion
    return event.data.after.ref.delete();
});
