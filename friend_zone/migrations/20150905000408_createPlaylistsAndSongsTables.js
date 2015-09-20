exports.up = function(knex, Promise) {
    return knex.schema.createTable('playlists', function(table) {
        table.increments('id').primary();
        table.string('spotify_uri');
        table.boolean('is_archive');
        table.string('spotify_owner_id');
        table.string('snapshot_id');
        table.string('collaboration_name');
        table.string('year');
        table.string('month');
        table.timestamps();
    }).createTable('songs', function(table) {
        table.increments('id').primary();
        table.string('spotify_uri');
        table.string('added_by_uri');
        table.string('added_by_username');
        table.string('added_on');
        table.integer('playlist_id').references('playlists.id');
        table.timestamps();
    });
};

exports.down = function(knex, Promise) {
    return knex.schema.dropTable('songs')
        .dropTable('playlists');
};