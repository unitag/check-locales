#!/usr/bin/env node
'use strict';

var checkLocales = require('./');

checkLocales(process.argv[2] || '.', function (error, badBundles) {
	if (error) {
		console.error('Unexpected error: ' + error);
		process.exit(2);
	}

	if (badBundles.length > 0) {
		process.exit(1);
	}
});
