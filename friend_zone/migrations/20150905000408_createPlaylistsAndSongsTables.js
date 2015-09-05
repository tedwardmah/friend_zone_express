exports.up = function(knex, Promise) {
    return knex.schema.createTable('playlists', function(table) {
        table.increments('id').primary();
        table.string('spotify_uri');
        table.string('snapshot_id');
        table.string('prior_snapshot_id');
        table.string('spotify_owner_id');
    }).createTable('songs', function(table) {
        table.increments('id').primary();
        table.string('spotify_uri');
        table.string('added_by_uri');
        table.string('added_by_username');
        table.string('added_on');
        table.integer('playlist_id').references('playlists.id');
    });
};

exports.down = function(knex, Promise) {
    return knex.schema.dropTable('playlists')
        .dropTable('songs');
};