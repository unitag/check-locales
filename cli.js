#!/usr/bin/env node
'use strict';

var path = require('path');

var chalk = require('chalk');

var checkLocales = require('./');

if (process.argv.length < 3) {
	console.error('Usage: ' + process.argv[0] + ' ' + path.basename(__filename) + ' <project path>');
	process.exit(2);
}

var root = path.resolve(process.argv[2]);

checkLocales(root, function (error, badBundles) {
	if (error) {
		console.error('Unexpected error: ' + error);
		process.exit(3);
	}

	if (badBundles.length > 0) {
		process.exit(1);
	}
});
