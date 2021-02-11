const functions = require("firebase-functions");
const admin = require('firebase-admin');

var crypto = require('crypto');

// Initialize Firebase App
admin.initializeApp();

// Database references
let latestRef = admin.firestore().collection("latest");
let usersRef = admin.firestore().collection("users");

const increment = admin.firestore.FieldValue.increment(1);

function sha256(data) {
    return crypto.createHash("sha256").update(data, "binary").digest("base64");
}

exports.getLatest = functions.https.onRequest(async (req, res) => {
    functions.logger.info("Getting latest...", {structuredData: true});
    const latestDoc = await latestRef.doc('latest').get();
    if (!latestDoc.exists) {
        functions.logger.warn("Latest document does not exist.");
        return;
    }

    const latest = latestDoc.data().latest;
    functions.logger.info("Retrieved latest value", latest);
    res.json({"latest": latest});
});

exports.register = functions.https.onRequest(async (req,res) => {
    const username = req.body.username;
    const email = req.body.username;
    const pwd = req.body.username;

    const result = await usersRef.doc().set({
        'username': username,
        'email': email,
        'pwd': sha256(pwd)
    });

    if (result) {
        functions.logger.info(`Created user ${username} with email: ${email}}`)
        res.status(204).json(result);
    }
    else {
        functions.logger.warn("Unable to create user", username, email, pwd)
        res.status(500).json("Unable to create user");
    }

});

exports.updateLatest = functions.firestore.document('/users/{documentId}').onCreate(async (snap, context) => { 
    // Document reference
    const latest = latestRef.doc('latest');
    // Update latest count
    await latest.update({ latest: increment });
});


// exports.updateLatest = functions.https.onRequest(async (req, res) => {
//     const original = snap.data().original;

//       // Access the parameter `{documentId}` with `context.params`
//       functions.logger.log('Uppercasing', context.params.documentId, original);
      
//       const uppercase = original.toUpperCase();
      
//       // You must return a Promise when performing asynchronous tasks inside a Functions such as
//       // writing to Firestore.
//       // Setting an 'uppercase' field in Firestore document returns a Promise.
//       return snap.ref.set({uppercase}, {merge: true}); 
// });