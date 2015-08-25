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

var templateKeyPattern = /\{@pre\s+type="content"\s+key="([a-zA-Z0-9.\[\]]+)"(?:\s+mode="([^"]+)")?\s*\/\}/gm;
var templatesPath = path.join(root, 'public/templates');
var templatesExt = '.dust';

var bundleKeyPattern = /^\s*([a-zA-Z0-9.\[\]]+)\s*=.*$/gm;
var bundlesPath = path.join(root, 'locales');
var bundlesExt = '.properties';

var templates = {};
glob.sync(path.join(templatesPath, '**', '*' + templatesExt)).forEach(loadTemplate);

var locales = glob.sync(path.join(bundlesPath, '*', '*')).map(loadLocale);

Object.keys(templates).forEach(checkTemplate);

// console.log(require('util').inspect(templates, {colors: true, depth: null}));

function loadTemplate(filename) {
	var name = path.relative(templatesPath, filename).slice(0, -templatesExt.length);
	var keys = getTemplateKeys(fs.readFileSync(filename, 'utf8'), templateKeyPattern);

	templates[name] = {
		name: name,
		keys: keys,
		locales: {}
	};
}

function loadLocale(dirname) {
	var locale = path.relative(bundlesPath, dirname);

	glob.sync(path.join(dirname, '**', '*' + bundlesExt)).forEach(loadBundle);

	function loadBundle(filename) {
		var name = path.relative(dirname, filename).slice(0, -bundlesExt.length);

		if (!templates.hasOwnProperty(name)) {
			console.error('Unused bundle: ' + path.relative(bundlesPath, filename));
			return;
		}

		templates[name].locales[locale] = getBundleKeys(fs.readFileSync(filename, 'utf8'));
	}

	return locale;
}

function getTemplateKeys(file) {
	var raw = {};
	var paired = {};

	var match;
	while ((match = templateKeyPattern.exec(file))) {
		((match[2] === 'paired') ? paired : raw)[match[1]] = true;
	}

	return {
		raw: Object.keys(raw),
		paired: Object.keys(paired)
	};
}

function getBundleKeys(file) {
	var keys = {};

	var match;
	while ((match = bundleKeyPattern.exec(file))) {
		keys[match[1]] = true;
	}

	return Object.keys(keys);
}

function checkTemplate(name) {
	var template = templates[name];

	locales.forEach(checkLocale);

	function checkLocale(locale) {
		if (!template.locales.hasOwnProperty(locale)) {
			if (template.keys.length > 0) {
				console.error('Missing bundle: ' + path.join(locale, template.name + bundlesExt));
			}
			return;
		}

		var requiredKeys = buildHash(template.keys.raw);
		var pairedKeys = template.keys.paired;
		var unusedKeys = [];

		template.locales[locale].forEach(checkKey);

		var missingKeys = Object.keys(requiredKeys);

		var missing = (missingKeys.length > 0);
		var unused = (unusedKeys.length > 0);

		if (missing || unused) {
			console.error('Invalid bundle: ' + path.join(locale, template.name + bundlesExt));
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
			} else if (!isPaired(key)) {
				unusedKeys.push(key);
			}
		}

		function isPaired(key) {
			for (var index = 0, count = pairedKeys.length; index < count; index++) {
				if (matchesPrefix(pairedKeys[index], key)) {
					return true;
				}
			}

			return false;
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

function matchesPrefix(prefix, key) {
	var length = prefix.length;

	if (key.substr(0, length) !== prefix) {
		return false;
	}

	var nextChar = key.charAt(length);
	return (nextChar === '.') || (nextChar === '[') || (nextChar === '');
}
