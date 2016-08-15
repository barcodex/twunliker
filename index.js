
/* VALUES TO SET FOR YOUR TWITTER APP */
var twitterKeys = {
    consumer_key: '',
    consumer_secret: '',
    access_token_key: '',
    access_token_secret: ''
};                       // <==== SET KEYS OF YOUR APP HERE
var DEFAULT_HANDLE = ''; // <==== SET YOUR HANDLE HERE



/* VALUES TO SET FOR THE NEXT SCRIPT RUN */
var GET_PORTION_SIZE = 200;         // max allowed set of likes returned by Twitter API
var TOTAL_LIMIT_GET = 3000;         // how many recent likes to ask from Twitter (at least)
var TOTAL_LIMIT_POST = 2000;        // how many oldest likes from selection to process (at most)
var POLLING_INTERVAL_GET = 60;      // polling interval (in seconds) for favorites/list GET API
var POLLING_INTERVAL_POST = 5;      // polling interval (in seconds) for favorites/destroy POST API
// See Twitter API documentation to check actual usage limits. 60s and 5s worked well on 15.08.2016

var unprocessedLikes = [];  // registry of all likes (IDs of liked statuses) to process
var skippedLikes = [];      // likes for tweets that were deleted since they were liked
var deletedLikes = [];      // likes that were successfully processed (unliked)

// Get access to twitter API
var Twitter = require('twitter');
var t = new Twitter(twitterKeys);

// Define what to do after receiving all the likes you want to process: start processing
function onFinishedReceiving() {
    console.log('Final total of likes to process: ', unprocessedLikes.length);
    // Start the processing by making a first call. It will work recursively until limits are reached.
    processNextLike();
}

// Define what to do after allowed number of items was processed: just report
function onFinishedProcessing() {
    console.log('Successfully gone through the list of likes');
    dumpProcessStatus();
}

// Print out current status of the process (to be used for console messages)
function dumpProcessStatus() {
    console.log(
        'Deleted/skipped/unprocessed = ' +
        deletedLikes.length + '/' + skippedLikes.length + '/' + unprocessedLikes.length
    );
}

// End the script gracefully when controlled fatal error occurs
function onFatalError(id, error) {
    console.log('Fatal error while processing status ' + id, error);
    dumpProcessStatus();
}

// Recursive function to unlike tweets.
function processNextLike() {
    // Only try to unlike a tweet if the limit is not reached yet
    if (unprocessedLikes.length > 0 && deletedLikes.length < TOTAL_LIMIT_POST) {
        dumpProcessStatus(); // To animate console output with running progress
        var id = unprocessedLikes.pop(); // ID to work with. Popping removes it from the list to process
        console.log('Waiting ' + POLLING_INTERVAL_POST + ' seconds before destroying a favourite ' + id);
        // Wait before calling API next time for not abusing the usage limits
        setTimeout(function() {
            t.post('favorites/destroy', {id: id}, function(error, response) {
                if (error && Array.isArray(error)) {
                    if (error[0].code == 144) { // "tweet is not found"
                        skippedLikes.push(id);
                        processNextLike();
                    } else { // some error that is not handled yet, possibly a room for improvement
                        onFatalError(id, error[0]);
                    }
                } else {
                    deletedLikes.push(id);
                    processNextLike();
                }
            });
        }, POLLING_INTERVAL_POST * 1000);
    } else {
        onFinishedProcessing();
    }
}

// Define what to do after portion of likes is received
function onReceivedPortionOfLikes(likes) {
    console.log('Received ' + likes.length + ' likes');
    if (likes.length == 0) {
        // There's nothing left to ask for
        onFinishedReceiving();
    } else {
        // Copy IDs of statuses to the array of unprocessed likes
        likes.forEach(function(like) {
            var id = like.id_str;
            if (id) {
                unprocessedLikes.push(like.id_str);
            }
        });
        // Only ask for next portion if desired number of likes is not gathered yet
        if (unprocessedLikes.length < TOTAL_LIMIT_GET) {
            var oldestLike = likes.pop();
            // Dump the oldest like to report the progress in console
            console.log('Oldest like: ', [oldestLike.created_at, oldestLike.user.screen_name, oldestLike.text]);
            // Wait before calling API next time for not abusing the usage limits
            console.log(
                'We now have ' + unprocessedLikes.length + ' unprocessed likes, which is still than ' + TOTAL_LIMIT_GET +
                ', so now we wait ' + POLLING_INTERVAL_GET + ' seconds and then get another portion...'
            );
            setTimeout(function() {
                // Get the next portion, using the id of oldest processed like as a boundary for Twitter search
                getPortionOfLikes({max_id: oldestLike.id}, onReceivedPortionOfLikes);
            }, POLLING_INTERVAL_GET * 1000);
        } else {
            onFinishedReceiving();
        }
    }
}

// Get the portion of likes of configured size and execute the callback
function getPortionOfLikes(params, callback) {
    var screenName = params.screen_name || DEFAULT_HANDLE;
    var count = params.count || GET_PORTION_SIZE;
    var apiParams = {screen_name: screenName, count: count};
    if ('max_id' in params) {
        apiParams.max_id = params.max_id;
    }
    console.log('getPortionOfLikes(); ', apiParams);
    t.get('favorites/list', apiParams,  function (error, response) {
        if (error) {
            console.log('Error while getting a portion of likes', error);
        } else {
            callback(response);
        }
    });
}

// Get the first portion of files to start the process
getPortionOfLikes({}, onReceivedPortionOfLikes);
