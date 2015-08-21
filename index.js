#!/usr/bin/env node
'use strict';

var path = require('path');
var fs = require('fs');

var glob = require('glob');

if (process.argv.length < 3) {
	console.error('Usage: ' + process.argv[0] + ' ' + path.basename(__filename) + ' <project path>');
	process.exit(1);
}

var root = path.resolve(process.argv[2]);

var templateKeyPattern = /\{@pre\s+type="content"\s+key="([a-zA-Z0-9.\[\]]+)"\s*\/\}/gm;
var templatesPath = path.join(root, 'public/templates');
var templatesExt = '.dust';

var bundleKeyPattern = /^\s*([a-zA-Z0-9.\[\]]+)\s*=.*$/gm;
var bundlesPath = path.join(root, 'locales');
var bundlesExt = '.properties';

var templates = {};
glob.sync(path.join(templatesPath, '**/*' + templatesExt)).forEach(onTemplate);

var locales = glob.sync(path.join(bundlesPath, '*/*')).map(onLocale);

Object.keys(templates).forEach(checkTemplate);

// console.log(require('util').inspect(templates, {colors: true, depth: null}));

function onTemplate(filename) {
	var name = path.relative(templatesPath, filename).slice(0, -templatesExt.length);
	var keys = getKeys(fs.readFileSync(filename, 'utf8'), templateKeyPattern);

	templates[name] = {
		name: name,
		keys: keys,
		locales: {}
	};
}

function onLocale(dirname) {
	var locale = path.relative(bundlesPath, dirname);

	glob.sync(path.join(dirname, '**/*' + bundlesExt)).forEach(onBundle);

	function onBundle(filename) {
		var name = path.relative(dirname, filename).slice(0, -bundlesExt.length);

		if (!templates.hasOwnProperty(name)) {
			console.error('Unused bundle: ' + path.relative(bundlesPath, filename));
			return;
		}

		templates[name].locales[locale] = getKeys(fs.readFileSync(filename, 'utf8'), bundleKeyPattern);
	}

	return locale;
}

function getKeys(file, pattern) {
	var keys = {};

	var match;
	while ((match = pattern.exec(file))) {
		keys[match[1]] = true;
	}

	return Object.keys(keys);
}

function checkTemplate(name) {
	var template = templates[name];

	locales.forEach(checkLocale);

	function checkLocale(locale) {
		var requiredKeys = buildHash(template.keys);
		var unusedKeys = [];

		(template.locales[locale] || []).forEach(checkKey);

		var missingKeys = Object.keys(requiredKeys);

		var missing = (missingKeys.length > 0);
		var unused = (unusedKeys.length > 0);

		if (missing || unused) {
			console.error('\nInvalid bundle: ' + path.join(locale, template.name + bundlesExt));
			if (missing) {
				console.error('\tMissing keys: ' + missingKeys.join(', '));
			}
			if (unused) {
				console.error('\tUnused keys: ' + unusedKeys.join(', '));
			}
		}

		function checkKey(key) {
			if (requiredKeys.hasOwnProperty(key)) {
				delete requiredKeys[key];
			} else {
				unusedKeys.push(key);
			}
		}
	}
}

function buildHash(keys) {
	return keys.reduce(addKey, {});
}

function addKey(hash, key) {
	hash[key] = true;
	return hash;
}
