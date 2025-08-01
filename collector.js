#!/usr/bin/env node

// ----------------------

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const argv = yargs(hideBin(process.argv))
    .option('etcd-host', {
        type: 'string',
        description: 'ETCD servier host address/port',
        default: 'localhost:2379',
    })
    .option('etcd-path', {
        type: 'string',
        description: 'ETCD server watch prefix path',
        default: '/',
    })
    .option('db-file', {
        type: 'string',
        description: 'Database storage file name',
        default: '/opt/storage/etcd/db-localhost',
    })
    .option('db-time', {
        type: 'number',
        description: 'Database storage update time (in seconds)',
        default: 60,
    })
    .option('db-report', {
        type: 'number',
        description: 'Database storage report time (in seconds)',
        default: 30 * 60,
    })
    .help().argv;
const CONFIG_ETCDHOST = argv['etcd-host'];
const CONFIG_ETCDPATH = argv['etcd-path'];
const CONFIG_DBFILE = argv['db-file'];
const CONFIG_DBTIME = argv['db-time'];
const CONFIG_DBREPORT = argv['db-report'];

// ----------------------

const fs = require('fs');
const path = require('path');

function util_log(s) {
    console.log(s);
}
function util_err(s) {
    console.error(s);
    return 0;
}
function util_obj_str(x) {
    return Object.keys(x)
        .sort()
        .map((k) => `${k}=${x[k]}`)
        .join(', ');
}
function util_exception_wrapper(f, g = undefined) {
    try {
        return f();
    } catch (e) {
        return g ? g(e) : g;
    }
}
async function util_exception_wrapper_async(f, g = undefined) {
    try {
        return await f();
    } catch (e) {
        return g ? g(e) : g;
    }
}
function util_date_epochToStr_ISO(a) {
    const aa = new Date();
    aa.setTime(a);
    return aa.toISOString();
}
function util_sizeof_file(filePath) {
    return util_exception_wrapper(
        () => fs.statSync(filePath).size,
        (e) => util_err(`Error getting file size: ${e}`)
    );
}
function util_sizeof_directory(directoryPath) {
    return util_exception_wrapper(
        () => fs.readdirSync(directoryPath).reduce((size, file) => size + util_sizeof_file(path.join(directoryPath, file)), 0),
        (e) => util_err(`Error getting directory size: ${e}`)
    );
}
function util_num_sum(x) {
    return x.reduce((count, num) => count + num, 0);
}

// ----------------------

const { open } = require('lmdb');
let database_client;
function database_open(path) {
    database_client = open({ path, compression: true });
}
async function database_close() {
    await util_exception_wrapper_async(
        async () => (database_client ? (await database_client.close(), (database_client = undefined)) : undefined),
        (error) => util_err(`Error closing the database: ${error}`)
    );
}
function database_read(func) {
    util_exception_wrapper(
        () => {
            for (const { key, value } of database_client.getRange())
                for (const [updateKey, updateVal] of Object.entries(value)) func({ key, updateKey, updateVal });
        },
        (error) => util_err(`Error reading the database: ${error}`)
    );
}
function database_size() {
    return util_sizeof_directory(database_client.path);
}
function database_stats() {
    var keys = new Set(),
        elements = 0,
        valsizes = 0;
    database_read(({ key, updateKey, updateVal }) => {
        if (!keys.has(key)) keys.add(key);
        elements++;
        valsizes += updateKey.length + updateVal.length;
    });
    const entries = keys.size,
        keysizes = util_num_sum([...keys].map((key) => key.length));
    return { entries, elements, keysizes, valsizes, totsizes: keysizes + valsizes, bytes: database_size() };
}

// ----------------------

let collector_total = 0;
const collector_cache = {};
function collector_store(data) {
    const time = util_date_epochToStr_ISO(Math.floor(Date.now() / 1000) * 1000);
    collector_cache[time] = { ...(collector_cache[time] || {}), ...data };
}
function collector_write(flush = false) {
    let entries = Object.keys(collector_cache).sort();
    if (!flush) entries = entries.slice(0, -1); // last timestamp might still be filling
    entries.forEach((time) => {
        database_client.put(time, collector_cache[time]);
        delete collector_cache[time];
        collector_total++;
    });
}
function collector_report() {
    util_log(`collector: writes=${collector_total}; database: ${util_obj_str(database_stats())}`);
}

let collector_interval, collector_reporter;
function collector_begin() {
    collector_interval = setInterval(collector_write, CONFIG_DBTIME * 1000);
    collector_reporter = setInterval(collector_report, CONFIG_DBREPORT * 1000);
}
function collector_end() {
    if (collector_interval) {
        clearInterval(collector_interval);
        collector_interval = undefined;
        collector_write(true);
    }
    if (collector_reporter) {
        clearInterval(collector_reporter);
        collector_reporter = undefined;
        collector_report();
    }
}

// ----------------------

const { Etcd3 } = require('etcd3');
let etcd3_client, etcd3_watcher;
async function etcd3_open(hosts, path) {
    (etcd3_client = new Etcd3({ hosts }))
        .watch()
        .prefix(path)
        .create()
        .then((watcher) => {
            etcd3_watcher = watcher;
            collector_begin();
            watcher
                .on('put', (entry) => collector_store({ [entry.key.toString()]: entry.value.toString() }))
                .on('error', (error) => util_err(`watcher:error(${error})`))
                .on('disconnected', () => util_err('watcher:disconnected'))
                .on('connected', () => util_log('watcher:connected'))
                .on('end', () => collector_end());
        })
        .catch((error) => util_err(`watcher error: ${error}`));
}
async function etcd3_close() {
    await util_exception_wrapper_async(
        async () => (etcd3_watcher ? (await etcd3_watcher.cancel(), (etcd3_watcher = undefined)) : undefined),
        (error) => util_err(`Error cancelling etcd3 watcher: ${error}`)
    );
    await util_exception_wrapper_async(
        async () => (etcd3_client ? (await etcd3_client.close(), (etcd3_client = undefined)) : undefined),
        (error) => util_err(`Error closing etcd3 client: ${error}`)
    );
}

// ----------------------

util_log(
    `starting: etcd-host=${CONFIG_ETCDHOST}, etcd-path=${CONFIG_ETCDPATH}, db-file=${CONFIG_DBFILE}, db-time=${CONFIG_DBTIME}, db-report=${CONFIG_DBREPORT}`
);
database_open(CONFIG_DBFILE);
etcd3_open(CONFIG_ETCDHOST, CONFIG_ETCDPATH);
async function cleanup() {
    await etcd3_close();
    await database_close();
    setTimeout(() => {
        process.exit(0);
    }, 100);
}
process.on('SIGINT', () => cleanup());
process.on('SIGTERM', () => cleanup());
process.on('exit', () => util_log('stopped'));

// ----------------------
