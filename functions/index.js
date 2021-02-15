const functions = require("firebase-functions");
const admin = require('firebase-admin');
const crypto = require('crypto');

// Initialize Firebase App
admin.initializeApp();

// Database references
const latestRef = admin.firestore().collection("latest");
const usersRef = admin.firestore().collection("users");
const tweetsRef = admin.firestore().collection('tweets');
const followsRef = admin.firestore().collection('follows');

// USERNAME = 'simulator'
// PWD = 'super_safe!'
// CREDENTIALS = ':'.join([USERNAME, PWD]).encode('ascii')
// ENCODED_CREDENTIALS = base64.b64encode(CREDENTIALS).decode()
// HEADERS = {'Connection': 'close',
//            'Content-Type': 'application/json',
//            f'Authorization': f'Basic {ENCODED_CREDENTIALS}'}

async function InitializeTestEnv(res) {
    await latestRef.doc("latest").create({"latest": 0});

    // await tweetsRef.doc().set({
    //     'pub_date': admin.firestore.Timestamp.fromDate(new Date()),
    //     'content': "Hello! World",
    //     'username': "a",
    //     'flagged': false 
    // });
    // await tweetsRef.doc().set({
    //     'pub_date': admin.firestore.Timestamp.fromDate(new Date()),
    //     'content': "Hello! World 2",
    //     'username': "b",
    //     'flagged': false 
    // });

    res.send(200);
    // usersRef.doc().set({
    //     'username': 'a',
    //     'email': 'a',
    //     'pwd': sha256("password")
    // });
    // usersRef.doc().set({
    //     'username': 'b',
    //     'email': 'b',
    //     'pwd': sha256("qwerty123")
    // });
}


const increment = admin.firestore.FieldValue.increment(1);

function sha256(data) {
    return crypto.createHash("sha256").update(data, "binary").digest("base64");
}

async function updateLatest(newLatest = null) {
    // Update latest count
    if (newLatest)
        await latestRef.doc('latest').update({ 'latest': parseInt(newLatest)})
    else
        await latestRef.doc('latest').update({ 'latest': increment });
}

async function userExists(username) {
    return await usersRef.where('username', '==', username).get().empty
}

function validAuthorization(req, res) {
    let from_simulator = req.headers.authorization;
    if (from_simulator != "Basic c2ltdWxhdG9yOnN1cGVyX3NhZmUh") {
        error = "You are not authorized to use this resource!"
        res.status(403).send(error)
        return false
    }
    return true;
}

exports.init = functions.https.onRequest(async (req,res) => InitializeTestEnv(res))

exports.latest = functions.https.onRequest(async (req, res) => {
    functions.logger.info("Getting latest...", {structuredData: true});
    const latestDoc = await latestRef.doc('latest').get();
    if (!latestDoc.exists) {
        functions.logger.warn("Latest document does not exist.");
        return;
    }

    const latest = latestDoc.data().latest;
    functions.logger.info("Retrieved latest value", latest);
    res.send({"latest": latest});
});

exports.register = functions.https.onRequest(async (req,res) => {
    await updateLatest(req.query.latest);

    const username = req.body.username;
    const email = req.body.username;
    const pwd = req.body.username;

    if (await userExists(username))
    {
        functions.logger.info(`${username} tried to register again`)
        res.status(404).send("Username already in use.")
        return;
    }

    const result = await usersRef.doc().create({
        'username': username,
        'email': email,
        'pwd': sha256(pwd)
    });

    if (result) {
        functions.logger.info(`Created user ${username} with email: ${email}}`)
        res.status(204).send(result);
    }
    else {
        functions.logger.warn("Unable to create user", username, email, pwd)
        res.status(500).send("Unable to create user");
    }

});

async function handleMsgGet(res, defaultLimit, username = null) {
    var query = tweetsRef.where('flagged', '==', false);
    if (username) {
        query = query.where('username', '==', username)
    }
    query = query.orderBy('pub_date', 'desc').limit(defaultLimit);

    const tweets = await query.get();

    const messages = []
    tweets.forEach(t => messages.push({
        'content': t.data().content,
        'pub_date': t.data().pub_date.toDate(),
        'user': t.data().username,
    }));

    res.status(200).send(messages);
}

async function handleMsgPostUser(username, tweet, res, defaultLimit) {
    tweetsRef.doc().create({
        'content': tweet,
        'pub_date': admin.firestore.Timestamp.fromDate(new Date()),
        'username': username,
        'flagged': false
    });

    res.status(204).send("");


}

exports.msgs = functions.https.onRequest(async (req, res) => {
    await updateLatest(req.query.latest);

    if (!validAuthorization(req, res))
        return;

    var defaultLimit = 50;
    if (req.query.no)
        defaultLimit = parseInt(req.query.no)

    switch(req.method) {
        case "POST":
            if (req.params[0] != '/')
                handleMsgPostUser(req.params[0].substring(1), req.body.content, res, defaultLimit)
            else
                res.status(404).send("Specify user to post from")
            break;
        case "GET":
            if (req.params[0] != '/')
                handleMsgGet(res, defaultLimit, req.params[0].substring(1))
            else
                handleMsgGet(res, defaultLimit)
            break;
        default:
            res.status(404).send("Unable to handle request method: " + req.method)
    }
});

async function handleFollowGet(req, res) {
    const username = req.params[0].substring(1);

    var defaultLimit = 50;
    if (req.query.no)
        defaultLimit = parseInt(req.query.no);
    
    const followers = await followsRef
        .where('who_id', '==', username)
        .limit(defaultLimit)
        .get();
    
    const follower_names = [];
    followers.forEach(f => {
        follower_names.push(f.data().whom_id);
    });

    res.status(200).json({
        'follows': follower_names
    })
}

async function handleFollowPost(req, res) {
    const username = req.params[0].substring(1);
    if (req.body.follow) {
        const follows_username = req.body.follow
        if (!userExists(follows_username)) {
            res.status(404).send(`Username: '${follows_username}' does not exist`)
            return;
        }

        followsRef.doc().create({
            'who_id': username,
            'whom_id': follows_username
        });

        res.status(204).send("")
    }
    else if (req.body.unfollow) {
        const unfollows_username = req.body.unfollow
        if (!userExists(unfollows_username)) {
            res.status(404).send(`Username: '${unfollows_username}' does not exist`)
            return;
        }

        const follows = await followsRef
            .where('who_id', '==', username)
            .where('whom_id', '==', unfollows_username)
            .get();
        
        follows.forEach(async doc => {
            await doc.ref.delete()
        })

        res.status(204).send("")
    }
    else {
        res.status(404).send("Invalid request body")
    }
}

exports.fllws = functions.https.onRequest(async (req, res) => {
    if (req.params[0] == '/')
    {
        res.status(404).send("Please specify username.")
        return;
    }

    await updateLatest(req.query.latest)

    switch(req.method) {
        case "POST":
            handleFollowPost(req, res)
            break;
        case "GET":
            handleFollowGet(req, res)
            break;
        default:
            res.status(404).send("Unable to handle request method: " + req.method)
    }

})