var express = require('express');
var knex = require('knex')({
    client: 'postgresql',
    // connection: process.env.PG_CONNECTION_STRING
    connection: {
        // host: '127.0.0.1',
        // user     : 'your_database_user',
        // password : 'your_database_password',
        database: 'friend_zone'
    }
});
module.exports = require('bookshelf')(knex);