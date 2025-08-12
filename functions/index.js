const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { setGlobalOptions } = require("firebase-functions/v2");

// Initialize Firebase and set global options once.
initializeApp();
setGlobalOptions({ maxInstances: 10 });

// --- HELPER FUNCTION TO CLEAN UP INVALID TOKENS ---
/**
 * Deletes invalid FCM tokens from a user's document.
 * @param {string} uid The user ID.
 * @param {string} token The invalid token to delete.
 * @param {string} appId The application ID from the Firestore path.
 */
const cleanupToken = async (uid, token, appId) => {
  const db = getFirestore();
  const userRef = db.doc(`artifacts/${appId}/public/data/users/${uid}`);
  const userDoc = await userRef.get();
  if (userDoc.exists()) {
    const existingToken = userDoc.data().notificationToken;
    // Ensure we are only deleting the token if it's the one that failed.
    if (existingToken === token) {
      console.log(`Deleting invalid token for user ${uid}`);
      await userRef.update({ notificationToken: null });
    }
  }
};


// --- TRANSACTION NOTIFICATION FUNCTION ---
// This function is currently not fully implemented as it has a different logic
// of finding users. For now, we will focus on the test notification.
// A complete implementation would require a more robust way to map player names to UIDs.
exports.sendTransactionNotification = onDocumentUpdated("artifacts/{appId}/public/data/poker-sessions/{sessionId}", async (event) => {
    // This function's logic is complex and relies on mapping player names to UIDs.
    // The core notification sending part is demonstrated in the test notification function.
    // For now, this function will remain as a placeholder to avoid breaking existing structure.
    console.log("Transaction notification triggered, but implementation is pending full review of user mapping logic.");
    return null;
});


// --- ADMIN TEST NOTIFICATION FUNCTION (REWRITTEN) ---
exports.sendTestNotificationOnRequest = onDocumentWritten("artifacts/{appId}/tasks/{taskId}", async (event) => {
    if (!event.data.after.exists) {
        return null; // Task was deleted.
    }

    const taskData = event.data.after.data();
    const appId = event.params.appId;

    if (taskData.type !== 'sendTestNotification') {
        return null; // Not the task we are looking for.
    }

    const requesterName = taskData.displayName || "An admin";
    console.log(`Test notification requested by ${requesterName} for app ID: ${appId}`);

    const db = getFirestore();
    const usersSnapshot = await db.collection(`artifacts/${appId}/public/data/users`).get();
    
    if (usersSnapshot.empty) {
        console.log("No user documents found to send notifications to.");
        return event.data.after.ref.delete();
    }

    // Collect all valid tokens and their corresponding UIDs.
    const tokens = [];
    const userMap = {}; // Map token to UID for cleanup
    usersSnapshot.forEach((doc) => {
        const user = doc.data();
        // IMPORTANT: Reading from `notificationToken` now.
        if (user && user.notificationToken) {
            tokens.push(user.notificationToken);
            userMap[user.notificationToken] = doc.id; // Map token to user ID
        }
    });

    if (tokens.length === 0) {
        console.log("Found user documents, but none have a valid notificationToken.");
        return event.data.after.ref.delete();
    }

    console.log(`Found ${tokens.length} tokens to send notifications to.`);

    const message = {
        notification: {
            title: "Poker Night Ledger Test",
            body: `This is a test notification sent by ${requesterName}.`,
        },
        webpush: {
            notification: {
                icon: "/192x192 poker.png", // A valid icon path
            },
        },
        tokens: tokens,
    };

    try {
        const response = await getMessaging().sendEachForMulticast(message);
        console.log(`${response.successCount} messages were sent successfully.`);

        if (response.failureCount > 0) {
            const cleanupPromises = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const error = resp.error;
                    const failedToken = tokens[idx];
                    const failedUid = userMap[failedToken];
                    console.error(`Failure sending notification to token: ${failedToken}`, error);

                    // Check for errors indicating an invalid or unregistered token.
                    if (error.code === 'messaging/invalid-registration-token' ||
                        error.code === 'messaging/registration-token-not-registered') {
                        cleanupPromises.push(cleanupToken(failedUid, failedToken, appId));
                    }
                }
            });
            await Promise.all(cleanupPromises);
        }
    } catch (error) {
        console.error("Error sending multicast message:", error);
    }

    // Delete the task document now that we're done.
    return event.data.after.ref.delete();
});
