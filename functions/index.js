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
 */
const initializeWebPush = () => {
    const vapidPublicKey = functions.config().vapid.public_key;
    const vapidPrivateKey = functions.config().vapid.private_key;

    if (!vapidPublicKey || !vapidPrivateKey) {
        console.error("VITAL: VAPID keys are not set in Firebase Functions config. Run 'firebase functions:config:set vapid.public_key=...' and 'vapid.private_key=...'");
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
    // ... (your existing transaction logic)
});


// --- NEW FUNCTION FOR ADMIN TEST NOTIFICATIONS (WITH DEBUG LOGGING) ---
exports.sendTestNotificationOnRequest = onDocumentWritten("artifacts/{appId}/tasks/{taskId}", async (event) => {
    // Note: The path was corrected to artifacts/{appId}/tasks/{taskId}
    
    // Only run on document creation
    if (!event.data.after.exists) {
        console.log("DEBUG: Task document deleted, ignoring.");
        return null;
    }

    console.log("DEBUG: sendTestNotificationOnRequest function triggered.");

    if (!initializeWebPush()) {
        console.error("DEBUG: Web Push initialization failed. Halting execution.");
        return null;
    }

    const taskData = event.data.after.data();
    const appId = event.params.appId;

    if (taskData.type !== 'sendTestNotification') {
        console.log(`DEBUG: Ignoring task of type '${taskData.type}'.`);
        return null;
    }

    const requesterName = taskData.displayName || "An admin";
    console.log(`DEBUG: Test notification requested by ${requesterName} for app ID: ${appId}`);

    const db = getFirestore();
    const usersSnapshot = await db.collection(`artifacts/${appId}/public/data/users`).get();
    
    if (usersSnapshot.empty) {
        console.log("DEBUG: No user documents found in the collection. Nothing to do.");
        return event.data.after.ref.delete(); // Clean up task
    }

    console.log(`DEBUG: Found ${usersSnapshot.size} total user documents.`);

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
        console.log(`DEBUG: Found valid subscription for user: ${user.displayName || doc.id}. Preparing to send.`);
        
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

    console.log(`DEBUG: Attempting to send notifications to ${validSubscriptions} users with subscriptions.`);

    await Promise.all(promises);
    console.log("DEBUG: Finished sending all test notifications.");

    // Delete the task document after completion
    return event.data.after.ref.delete();
});
