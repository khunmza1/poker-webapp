const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {setGlobalOptions} = require("firebase-functions/v2");
const functions = require("firebase-functions");
const webpush = require("web-push");

initializeApp();
setGlobalOptions({maxInstances: 10});

// This is the Cloud Function that will be triggered.
exports.sendTransactionNotification = onDocumentUpdated("artifacts/poker-ledger-default/public/data/poker-sessions/{sessionId}", async (event) => {
    // Initialize VAPID keys inside the function
    webpush.setVapidDetails(
        "mailto:33277sp@gmail.com", // Replace with your email
        functions.config().vapid.public_key,
        functions.config().vapid.private_key,
    );

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    // Get the latest transaction
    const oldLog = beforeData.transactionLog || [];
    const newLog = afterData.transactionLog || [];

    if (newLog.length === oldLog.length) {
      // No new transaction, so exit.
      return null;
    }

    const transaction = newLog[newLog.length - 1];
    const involvedPlayers = new Set();
    let notificationPayload = {};

    // Determine who was involved and create the message
    if (transaction.type === "Player Buy-in" && transaction.source.startsWith("from ")) {
      const sellerName = transaction.source.replace("from ", "");
      involvedPlayers.add(sellerName);
      notificationPayload = {
        title: "Chip Sale",
        body: `${transaction.player} bought ${transaction.amount} chips from you.`,
      };
    } else {
      // For other types of notifications in the future
      return null;
    }

    if (involvedPlayers.size === 0) {
      return null;
    }

    // Find the UIDs of the involved players
    const playersInSession = afterData.players || [];
    const uidsToNotify = playersInSession
        .filter((p) => involvedPlayers.has(p.name) && p.status === "joined" && p.uid)
        .map((p) => p.uid);

    if (uidsToNotify.length === 0) {
      return null;
    }

    // Get the notification subscriptions for each user
    const db = getFirestore();
    const promises = uidsToNotify.map(async (uid) => {
      const userRef = db.doc(`artifacts/poker-ledger-default/public/data/users/${uid}`);
      const userDoc = await userRef.get();
      if (userDoc.exists() && userDoc.data().notificationSubscription) {
        const subscription = userDoc.data().notificationSubscription;
        try {
            await webpush.sendNotification(subscription, JSON.stringify(notificationPayload));
        } catch (error) {
            console.error(`Failed to send notification to UID ${uid}:`, error);
            // Optional: If subscription is invalid (e.g., 410 Gone), remove it from Firestore.
            if (error.statusCode === 410) {
                await userRef.update({ notificationSubscription: null });
            }
        }
      }
      return null;
    });

    await Promise.all(promises);
    return {success: true};
});
