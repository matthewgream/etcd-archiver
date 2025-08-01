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
        description: 'Datbase storage update time (in seconds)',
        default: 60,
    })
    .help().argv;
const CONFIG_ETCDHOST = argv['etcd-host'];
const CONFIG_ETCDPATH = argv['etcd-path'];
const CONFIG_DBFILE = argv['db-file'];
const CONFIG_DBTIME = argv['db-time'];
console.log(`config: etcd-host=${CONFIG_ETCDHOST}, etcd-path=${CONFIG_ETCDPATH}, db-file=${CONFIG_DBFILE}, db-time=${CONFIG_DBTIME}`);

// ----------------------
