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
var stored_access_token = null; //TODO pass access_token?
var FZsettings = {
    debuggerPlaylist: '3xK9wu5wet6fyy0I9mAk77',
    friendZoneMasterPlaylistId: '0WSVlLsBh8zDHARsTqSoXW',
    fzAugustMasterBackup: '7F8BlhTzhRUfZf3saBKc58', 
    friendZoneRadioId: '73k1L1bpCRqbbUAltTRMp4', //FKA FZ August
    // backupPlaylistId: '0NpOn7HwkFgvDz7G7c0FTU' //August the first
};

var bookshelf = require('../config/bookshelf');

var Playlist = bookshelf.Model.extend({
  tableName: 'playlists',
  hasTimestamps: true,
  songs: function() {
    return this.hasMany(Song);
  }
});

var Song = bookshelf.Model.extend({
  tableName: 'songs',
  hasTimestamps: true,
  playlist: function() {
    return this.belongsTo(Playlist);
  }
});

/* GET friendzone listing. */
router.get('/', function(req, res, next) {
    access_token = req.query.access_token;
    var sendResponse = function sendResponse(playlistURIs) {
        res.status('200').json({
            message: 'You in the ZONE now boiiii',
            stored_access_token: stored_access_token
                // responses: playlistURIs,
                // totalTracks: totalTracks,
                // addedTracks: totalAddedTracks
        });
    };
    // getPlaylistsTracks(getPlaylistURIs(), [], getPlaylistsTracks, sendResponse);
    playlistURIs = getPlaylistURIs();
});

router.get('/playlists', function(req, res, next) {
    var access_token = req.query.access_token;
    var playlistsOptions = apiOptions.getAllUserPlaylists(req.query.access_token);
    var playlists = Playlist.fetchAll().then(function(collection){
        res.status('200').json({
            playlistsCollection: collection
        });
    });
});

router.get('/empty', function(req, res, next) {
    stored_access_token = req.query.access_token;
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
                res.status('200').json({
                    body: body2
                });
            });
        }

    });
});

var fetchThisMonthAndPreviousArchives = function fetchThisMonthAndPreviousArchives(){
    var d = when.defer();
    Playlist.fetchAll({
        withRelated: ['songs']
    }).then(function(playlistCollection){
        d.resolve(playlistCollection);
    });

    return d.promise;
};

var sortPlaylistTracksByMonth = function sortPlaylistTracksByMonth(playlistObject) {
    var tracks = playlistObject.tracks.items;
    var sortedTracks = {};

    var month;
    for (var i=0;i<tracks.length;i++){
        month = moment.utc(tracks[i].added_at).month() + '';
        if (!sortedTracks[month]) {
            sortedTracks[month] = [tracks[i]];
        } else {
            sortedTracks[month].push(tracks[i]);
        }
    }
    return sortedTracks;
};

var addNewTracksToArchive = function addNewTracksToArchive(dbQuery, pruneTracks) {
    var d = when.defer();
    var months = Object.keys(pruneTracks);
    
    var trackArchivePromises = [];
    for (var i = 0; i < months.length; i++) {
        var radioMonthTracks = pruneTracks[months[i]];
        var dbMonth = dbQuery.findWhere({month: months[i]});
        var monthName = months[i];
        trackArchivePromises.push( archiveMonth( monthName, radioMonthTracks, dbMonth ) );
    }

    when.all(trackArchivePromises).then(function(promiseReturns){
        d.resolve(promiseReturns);
    });

    return d.promise;
};

var archiveMonth = function archiveMonth(monthName, radioMonthTracks, dbMonth ) {
    var d = when.defer();

    var tracksToAddArray = [];
    if (dbMonth) { 
        var dbTracks = dbMonth.relations.songs.toJSON();

        var findDbTrack = function findDbTrack(spotifyURI){
            var track;
            for (var j=0; j<dbTracks.length; j++){
                if (dbTracks[j].spotify_uri === spotifyURI){
                    track = dbTracks[j];
                }
            }
            return track;
        };

        for (var i=0; i < radioMonthTracks.length; i++) {
            var result = findDbTrack( radioMonthTracks[i].track.uri );

            if ( !result ) {
                tracksToAddArray.push(radioMonthTracks[i]);
            }
        }

        if (tracksToAddArray.length > 0) {
            addTracksToDbPlaylist(dbMonth, tracksToAddArray).then(function(dbResponse){
                d.resolve(dbResponse);
            });
        } else {
            d.resolve('nothingToAdd');
        }
    } else {
        createNewDbPlaylistAndTracks(monthName, radioMonthTracks)
        .then(function(dbResponse){
            var playlistName = 'FZ ' + moment.months()[monthName];

            request.post(apiOptions.createPlaylist(null, playlistName, false), function(error, response, body) {
                d.resolve({
                    error: error,
                    response: response,
                    body: body
                });
            });
        });
    }


    return d.promise;   
};

var createPlaylist = function createPlaylist(){};

var addTracksToDbPlaylist = function addTracksToDbPlaylist(dbMonth, tracksToAddArray) {
    var d = when.defer();
    bookshelf.transaction(function(t){
        var tracks = [];
        var spotifyTrack;
        for (var i=0; i<tracksToAddArray.length;i++) {
            spotifyTrack = tracksToAddArray[i];
            tracks.push({
                spotify_uri: spotifyTrack.track.uri,
                added_by_uri: spotifyTrack.added_by.id,
                added_on: spotifyTrack.added_at,
                playlist_id: dbMonth.id          
            });    
        }

        return when.map(tracks,
            function (trackInfo){
                return new Song(trackInfo).save(null, {transacting: t});
            });

    })
    .then(function(songInfo){
        d.resolve(songInfo);
    })
    .catch(function(err) {
        d.resolve({
            message: 'problem saving to db!',
            error: err
        });
    });

    return d.promise;
};

var createNewDbPlaylistAndTracks = function createNewDbPlaylist(monthName, radioMonthTracks) {
    var d = when.defer();

    var currentUserId = '1263219154';
    var collaborationName = 'FZ';
    var month = monthName;


    // Need to add a flag to reflect whether the playlist exists in spotify yet / has been synced
    bookshelf.transaction(function(t) {
        var tracks = [];
        var spotifyTrack;
        for (var i=0; i<radioMonthTracks.length;i++) {
            spotifyTrack = radioMonthTracks[i];
            tracks.push({
                spotify_uri: spotifyTrack.track.uri,
                added_by_uri: spotifyTrack.added_by.id,
                added_on: spotifyTrack.added_at,
            });    
        }
        return new Playlist({
            spotify_owner_id: currentUserId,
            collaboration_name: collaborationName,
            month: month,
            year: '2015',
            is_archive: true
        })
        .save(null, {transacting: t})
        .tap(function(model) {
          return when.map(tracks, function(info) {
            return new Song(info).save({'playlist_id': model.id}, {transacting: t});
          });
        });
    })
    .then(function(transactionResult) {
        d.resolve(transactionResult);
    })
    .catch(function(err) {
        d.resolve({
            message: 'problem saving to db!',
            error: err
        });
    });

    return d.promise;
};

router.get('/prune', function(req, res, next) {
    stored_access_token = req.query.access_token;
    var access_token = req.query.access_token;
    var playlistToPrune = FZsettings.friendZoneRadioId;
    // var playlistToPrune = '73k1L1bpCRqbbUAltTRMp4'; //FriendZone August
    // 
    // var backupPlaylistId = FZsettings.backupPlaylistId;
    // var backupPlaylistId = FZsettings.backupPlaylistId;

    when.all( [fetchThisMonthAndPreviousArchives(), getPlaylistInfo(playlistToPrune) ] )
    .then(function(promiseArray){
        var dbQuery = promiseArray[0];
        var pruneTracks = sortPlaylistTracksByMonth(promiseArray[1]);
        
        addNewTracksToArchive(dbQuery, pruneTracks).then(function(newTracksResponse){

            res.status('200').json({
                newTracksResponse: newTracksResponse
            });

        });
    });
});

module.exports = router;

var apiOptions = {
    createPlaylist: function(access_token, playlistName, isPublic) {
        var accessToken = access_token ? access_token : stored_access_token;
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists',
            headers: {
                'Authorization': 'Bearer ' + accessToken
            },
            body: {
                name: playlistName,
                public: isPublic
            },
            json: true
        };
    },
    getPlaylistInfo: function(playlistId, optionalQuery) {
        var access_token = stored_access_token;
        var query = optionalQuery ? ('?fields=' + optionalQuery) : '';
        return {
            url: 'https://api.spotify.com/v1/users/' + userId + '/playlists/' + playlistId + query,
            headers: {
                'Authorization': 'Bearer ' + access_token
            },
            json: true
        };
    },
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
        march: '3Bx4pYALhO3uz7xpyPCFog', //spotify:user:1263219154:playlist:3Bx4pYALhO3uz7xpyPCFog
        april: '4ZxRnNoRY6kfde6ObumcIJ', //spotify:user:1263219154:playlist:4ZxRnNoRY6kfde6ObumcIJ
        may: '0WXmnDBQlFwnOomrZKcxvi', //spotify:user:1263219154:playlist:0WXmnDBQlFwnOomrZKcxvi
        june: '5TtSuNT4VzUC891uNF6WEM', //spotify:user:1263219154:playlist:5TtSuNT4VzUC891uNF6WEM
        july: '745orEm9Fk4NPldihQuPYy', //spotify:user:1263219154:playlist:745orEm9Fk4NPldihQuPYy
        august: '7F8BlhTzhRUfZf3saBKc58', //spotify:user:1263219154:playlist:7F8BlhTzhRUfZf3saBKc58
        // august: '0NpOn7HwkFgvDz7G7c0FTU', // spotify:user:1263219154:playlist:0NpOn7HwkFgvDz7G7c0FTU
        friendZoneRadio: '73k1L1bpCRqbbUAltTRMp4' //spotify:user:1263219154:playlist:73k1L1bpCRqbbUAltTRMp4
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

var sortFriendZoneRadio = function(playlistURI, backupPlaylistURI) {
    var d = when.defer();
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
        //// Move items off this playlist into backup playlist //TODO add function to auto-determine the month of the backup playlist
        
        // Add song to monthly backup playlist as soon as it's added to friend zone radio
        // BEFORE WE RUN THE ABOVE SORT BY TIME
        // When.all('DB query to get last month's and this month's playlist tracks', 'above request').then(function(returnArray){
        //     returnArray[0] = dbQuery;
        //     returnArray[1] = fzTracks;
        //     addNewTracksToDB(dbQuery, fzTracks).then(function(dbResult){
        //         prune(fzTracks);
        //     });
        // })
        // Need to get list of stored backup playlist data:  User.playlists.where(year && month === )

        d.resolve( addToBackUp(playlistURI, backupPlaylistURI, tracksToAddArray) );
    });
    return d.promise;
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

var getPlaylistTracks = function getPlaylist(playlistId) {
    var d = when.defer();
    request.get(apiOptions.getPlaylistTracks(playlistId), function(error, response, body) {
        if (!error) {
            d.resolve(body);
        } else {
            d.resolve({
                error: error,
                body: body
            });
        }
    });

    return d.promise;
};

var getPlaylistInfo = function getPlaylistInfo(playlistId) { 
    var d = when.defer();
    request.get(apiOptions.getPlaylistInfo(playlistId), function(error, response, body) {
        if (!error) {
            d.resolve(body);
        } else {
            d.resolve({
                error: error,
                body: body
            });
        }
    });

    return d.promise;
};

var getPlaylistInfoAndTracks = function getPlaylistInfoAndTracks(playlistId) {
    var d = when.defer();
    when.all([
            getPlaylistInfo(playlistId),
            getPlaylistTracks(playlistId)
        ])
    .then(function(returnValues){
            d.resolve({
                playlistInfo: returnValues[0],
                trackInfo: returnValues[1]
            });
    });

    return d.promise;
};

var makeBookshelfPlaylistTransaction = function makeBookshelfPlaylistTransaction(serviceResponse, songInfoArray) {
    var d = when.defer();
    var playlistNameInfo = serviceResponse.name.split(' ');
    playlistNameInfo = playlistNameInfo.length === 3 ? ['FZ', 'Radio', 'false'] : playlistNameInfo;
    bookshelf.transaction(function(t) {
      return new Playlist({
            spotify_uri: serviceResponse.id,
            snapshot_id: serviceResponse.snapshot_id,
            spotify_owner_id: serviceResponse.owner.id,
            collaboration_name: playlistNameInfo[0],
            month: moment.months().indexOf(playlistNameInfo[1]) + '',
            year: '2015',
            is_archive: playlistNameInfo.length === 3 ? false : true
        })
        .save(null, {transacting: t})
        .tap(function(model) {
          return when.map(songInfoArray, function(info) {
            return new Song(info).save({'playlist_id': model.id}, {transacting: t});
          });
        });
    })
    .then(function(library) {
        d.resolve(library);
    })
    .catch(function(err) {
        d.resolve({
            message: 'problem saving to db!',
            error: err
        });
    });

    return d.promise;
};

var constructSongInfoArray = function constructSongInfoArray(serviceResponse){
    var songInfoArray = [];
    var songs = serviceResponse.tracks.items;
    for (var i=0;i<songs.length; i++) {
        songInfoArray.push({
            spotify_uri: songs[i].track.uri,
            added_by_uri: songs[i].added_by.id,
            added_on: songs[i].added_at
        });
    }
    return songInfoArray;
};

router.get('/writeDB', function(req, res) {
    stored_access_token = req.query.access_token;   
    var playlistURIs = getPlaylistURIs();
    var svcResponses;
    var playlistSVCPromises = [];
    for (var i=0; i<playlistURIs.length; i++){
        playlistSVCPromise = getPlaylistInfo( playlistURIs[i] );
        playlistSVCPromises.push( playlistSVCPromise );
    }

    when.all(playlistSVCPromises)
    .then( function(serviceResponses) {
        var librariesReady = [];
        for (var i=0;i<serviceResponses.length;i++){
            librariesReady.push( makeBookshelfPlaylistTransaction( serviceResponses[i], constructSongInfoArray(serviceResponses[i]) ) );
        }
        when.all(librariesReady)
        .then( function(libraries){
            res.status('200').json({
                message: 'You in the ZONE now boiiii',
                response: {
                    dbPlaylistInfo: libraries
                }
            });
        });

    },
    function(serviceError){
        res.status('200').json({
            serviceError: serviceError
        });
    });
});

router.get('/songs', function(req, res, next) {
    var access_token = req.query.access_token;
    Playlist.fetchAll({
        withRelated: ['songs']
    })
    .then(function(allSongsCollection){
        var firstSongId = allSongsCollection.first().id;

        res.status('200').json({
            message: 'saul goode bro!',
            firstSongId: firstSongId,
            allSongsCollection: allSongsCollection
        });
        // console.log(library.related('books').pluck('title'));
    });
});