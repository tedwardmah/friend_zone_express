var express = require('express');
var router = express.Router();

var request = require('request'); // "Request" library
var when = require('when');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var moment = require('moment');
moment.utc().format();

var client_id = process.env.FRIEND_ZONE_CLIENT_ID; // Your client id
var client_secret = process.env.FRIEND_ZONE_CLIENT_SECRET; // Your client secret
var redirect_uri = 'http://localhost:3000/callback'; // Your redirect uri
var userId = '1263219154'; //spotify:user:1263219154
var stored_access_token = null;
var FZsettings = {
    friendZoneMasterPlaylistId: '0WSVlLsBh8zDHARsTqSoXW',
    fzAugustMasterBackup: '7F8BlhTzhRUfZf3saBKc58',
    friendZoneRadioId: '73k1L1bpCRqbbUAltTRMp4', //FKA FZ August
    backupPlaylistId: '0NpOn7HwkFgvDz7G7c0FTU' //August the first
};

/* GET friendzone listing. */
router.get('/', function(req, res, next) {
    access_token = req.query.access_token;
    var sendResponse = function sendResponse(playlistURIs) {
        res.json({
            message: 'You in the ZONE now boiiii',
            stored_access_token: stored_access_token
                // responses: playlistURIs,
                // totalTracks: totalTracks,
                // addedTracks: totalAddedTracks
        });
    };
    // getPlaylistsTracks(getPlaylistURIs(), [], getPlaylistsTracks, sendResponse);
});

router.get('/playlists', function(req, res, next) {
    var access_token = req.query.access_token;
    var playlistsOptions = apiOptions.getAllUserPlaylists(req.query.access_token);

    request.get(playlistsOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            res.json({
                body: body
            });
        }
    });
});

router.get('/empty', function(req, res, next) {
    stored_access_token = req.query.refresh_token;
    var access_token = req.query.access_token;
    var playlistToEmptyId = FZsettings.friendZoneMasterPlaylistId;

    var emptyOptions = apiOptions.getPlaylistTracks(playlistToEmptyId);
    var getTracksToDeleteOptions = apiOptions.getPlaylistTracks(playlistToEmptyId);

    request.get(getTracksToDeleteOptions, function(error, response, body) {
        var trackIds = [];
        if (!error && response.statusCode === 200) {
            for (var i = 0; i < body.items.length; i++) {
                trackIds.push({
                    uri: body.items[i].track.uri
                });
            }
            emptyOptions.body = {
                tracks: trackIds
            };
            request.del(emptyOptions, function(error2, response2, body2) {
                res.json({
                    body: body2
                });
            });
        }

    });
});

router.get('/prune', function(req, res, next) {
    stored_access_token = req.query.refresh_token;
    var access_token = req.query.access_token;
    var playlistToPrune = FZsettings.friendZoneRadioId;
    // var playlistToPrune = '73k1L1bpCRqbbUAltTRMp4'; //FriendZone August
    var backupPlaylistId = FZsettings.backupPlaylistId;
    var sendResponse = function(data) {
        res.json({
            message: 'saul goode bro!',
            data: data
        });
    };

    sortFriendZoneRadio(playlistToPrune, backupPlaylistId, sendResponse);
});



module.exports = router;

var apiOptions = {
    getPlaylistTracks: function(playlistId, optionalQuery) {
        var access_token = stored_access_token;
        var query = optionalQuery ? ('?fields=' + optionalQuery) : '';
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists/' + playlistId + '/tracks' + query,
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            json: true
        };
    },
    friendZoneMasterAdd: function(urisArray) {
        var access_token = stored_access_token;
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists/' + FZsettings.fzAugustMasterBackup + '/tracks',
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            body: {
                'uris': urisArray
            },
            json: true
        };
    },
    getAllUserPlaylists: function(access_token) {
        var accessToken = access_token ? access_token : stored_access_token;
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists?limit=50',
            headers: {
                'Authorization': 'Bearer ' + accessToken
            },
            json: true
        };
    },
    addToBackUp: function(backupPlaylistId, urisArray) {
        var access_token = stored_access_token;
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists/' + backupPlaylistId + '/tracks',
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            body: {
                'uris': urisArray
            },
            json: true
        };
    }
};

var getPlaylistURIs = function getPlaylistURIs() {
    var playlists = {
        // march: '3Bx4pYALhO3uz7xpyPCFog', //spotify:user:1263219154:playlist:3Bx4pYALhO3uz7xpyPCFog
        // april: '4ZxRnNoRY6kfde6ObumcIJ', //spotify:user:1263219154:playlist:4ZxRnNoRY6kfde6ObumcIJ
        // may: '0WXmnDBQlFwnOomrZKcxvi', //spotify:user:1263219154:playlist:0WXmnDBQlFwnOomrZKcxvi
        // june: '5TtSuNT4VzUC891uNF6WEM', //spotify:user:1263219154:playlist:5TtSuNT4VzUC891uNF6WEM
        // july: '745orEm9Fk4NPldihQuPYy', //spotify:user:1263219154:playlist:745orEm9Fk4NPldihQuPYy
        // friendZoneRadio: '73k1L1bpCRqbbUAltTRMp4' //spotify:user:1263219154:playlist:73k1L1bpCRqbbUAltTRMp4
    };
    var playlistNames = Object.keys(playlists);
    var playlistURIs = [];
    for (var i = 0; i < playlistNames.length; i++) {
        playlistURIs.push(playlists[playlistNames[i]]);
    }
    return playlistURIs;
};

var getCutoffDate = function(daysAgo) {
    var now = moment.utc();
    var cutoff = now.subtract(daysAgo, 'days');
    return cutoff;
};


var sortFriendZoneRadio = function(playlistURI, backupPlaylistURI, sendResponseCallback) {
    var tracksToAddArray = [];
    request.get(apiOptions.getPlaylistTracks(playlistURI), function(error, response, body) {
        if (!error && response.statusCode === 200) {
            var uri = null;
            var addedAt = null;
            var cutoff = getCutoffDate(30);
            for (var i = 0; i < body.items.length; i++) {
                uri = body.items[i].track.uri;
                if (uri.indexOf('local') < 0 && uri.indexOf('track:null') < 0) {
                    addedAt = moment.utc(body.items[i].added_at);
                    if (addedAt < cutoff) {
                        tracksToAddArray.push(uri);
                    }
                } else {
                    console.log('ERROR when adding %s', uri);
                }
            }
        }
        // Move items off this playlist into backup playlist //TODO add function to auto-determine the month of the backup playlist
        addToBackUp(playlistURI, backupPlaylistURI, tracksToAddArray, sendResponseCallback);
    });
};

var addToBackUp = function(playlistURI, backupPlaylistURI, tracksToAddArray, sendResponseCallback) { //TODO consolidate these passed options into a single object
    request.post(apiOptions.addToBackUp(backupPlaylistURI, tracksToAddArray), function(error, response, body) {
        removeFromFriendZoneRadio(playlistURI, backupPlaylistURI, tracksToAddArray, sendResponseCallback);
    });
};

var removeFromFriendZoneRadio = function(playlistURI, backupPlaylistURI, tracksToAddArray, sendResponseCallback) {
    var playlistToEmptyId = playlistURI;

    var formattedArray = function() { //TODO move this declaration outside of the function, need to pass an array in and return an array
        var returnArray = [];
        for (var u = 0; u < tracksToAddArray.length; u++) {
            returnArray.push({
                uri: tracksToAddArray[u]
            });
        }
        return returnArray;
    };
    var emptyOptions = apiOptions.getPlaylistTracks(playlistToEmptyId);
    emptyOptions.body = {
        tracks: formattedArray()
    };
    request.del(emptyOptions, function(error, response, body) {
        sendResponseCallback.call(this, {
            body: body
        });
    });
};

// Pass an array of spotify playlistUris, along with an empty array and the sendResponseCallback that gives access to the client response
var getPlaylistsTracks = function getPlaylistsTracks(playlistURIArray, tracksToAddArray, callback, sendResponseCallback) {
    var playlistURI = playlistURIArray.pop();
    if (playlistURI !== undefined) {
        request.get(apiOptions.getPlaylistTracks(playlistURI, 'items.track.uri'), function(error, response, body) {
            if (!error && response.statusCode === 200) {
                var uri = null;
                for (var i = 0; i < body.items.length; i++) {
                    uri = body.items[i].track.uri;
                    if (uri.indexOf('local') < 0 && uri.indexOf('track:null') < 0) {
                        tracksToAddArray.push(uri);
                    } else {
                        console.log('ERROR when adding %s', uri);
                    }
                }
                //continue to pass array of playlists, array holding all uris
                callback.call(this, playlistURIArray, tracksToAddArray, callback, sendResponseCallback);
            }
        });
    } else {
        // Call the function that will add tracks 100 at a time to a playlist (configured in apiOptions object)
        addPlaylistsTracksToMaster(tracksToAddArray, addPlaylistsTracksToMaster, sendResponseCallback);
    }
};

//
var addPlaylistsTracksToMaster = function addPlaylistsTracksToMaster(tracksToAddArray, callback, sendResponseCallback) {
    if (tracksToAddArray && tracksToAddArray.length > 0) {
        console.log('tracksToAddArray is %s in length', tracksToAddArray.length);
        var currentAddition = tracksToAddArray.splice(0, 100);
        request.post(apiOptions.friendZoneMasterAdd(currentAddition), function(error, response, body) {
            // responses.push({
            //     href: playlistHref,
            //     body: body2
            // });
            callback.call(this, tracksToAddArray, callback, sendResponseCallback);
        });
    } else {
        sendResponseCallback();
    }
};