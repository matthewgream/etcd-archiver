#!/usr/bin/env node

// ----------------------

const moment = require('moment');

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv))
    .option('db-file', {
        type: 'string',
        description: 'Database storage file name',
        default: '/opt/storage/etcd/db-localhost',
    })
    .option('key', {
        type: 'string',
        description: 'Key',
    })
    .option('start', {
        type: 'string',
        description: 'Start time',
    })
    .option('end', {
        type: 'string',
        description: 'End time',
    })
    .help().argv;
const CONFIG_DBFILE = argv['db-file'];
console.log(`config: db-file=${CONFIG_DBFILE}`);
const options = {
    key: argv.key,
    start: argv.start && moment(argv.start),
    end: argv.end && moment(argv.end),
};

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

const timeIsBetween = (timeKey, timeStart, timeEnd) => (!timeStart || timeKey.isSameOrAfter(timeStart)) && (!timeEnd || timeKey.isSameOrBefore(timeEnd));
database_read(({ key, updateKey, updateVal }) => {
    if (updateKey === options.key && timeIsBetween(moment(key), options.start, options.end)) console.log(`${key} ${updateKey} ${updateVal}`);
});

// ----------------------
