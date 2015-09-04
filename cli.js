#!/usr/bin/env node
'use strict';

var yargs = require('yargs');

var project = require('./package.json');

var argv = yargs
	.detectLocale(false)
	.strict()
	.usage('Usage: ' + project.name + ' [options] <path>')
	.version(project.version)
	.alias('version', 'V')
	.help('help')
	.alias('help', 'h')
	.options('ignore', {
		alias: 'i',
		describe: 'Ignore the given files',
		type: 'array'
	})
	.option('missing-bundle', {
		alias: 'm',
		describe: 'How to handle missing bundles',
		choices: ['forbid', 'allow', 'create'],
		default: 'allow'
	})
	.argv;

var checkLocales = require('./');

checkLocales(argv._[0] || '.', argv, function onDone(error, badBundles) {
	if (error) {
		console.error('Unexpected error: ' + error);
		process.exit(3);
	}

	if (badBundles.length > 0) {
		process.exit(2);
	}
});
