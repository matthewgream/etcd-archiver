#!/usr/bin/env node

// ----------------------

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv))
    .option('db-file', {
        type: 'string',
        description: 'Database storage file name',
        default: '/opt/storage/etcd/db-localhost',
    })
    .help().argv;
const CONFIG_DBFILE = argv['db-file'];
console.log(`config: db-file=${CONFIG_DBFILE}`);

// ----------------------

const { open } = require('lmdb');
const db = open({ path: CONFIG_DBFILE, compression: true });

async function database_read(func) {
    try {
        for (const { key, value } of db.getRange()) for (const [updateKey, updateVal] of Object.entries(value)) func({ key, updateKey, updateVal });
    } catch (error) {
        console.error(`Error reading the database: ${error}`);
    }
}

// ----------------------

database_read(({ key, updateKey, updateVal }) => {
    console.log(`${key} ${updateKey} ${updateVal}`);
});

// ----------------------
