#!/usr/bin/env node
'use strict';

var path = require('path');
var fs = require('fs');

var glob = require('glob');
var chalk = require('chalk');

if (process.argv.length < 3) {
	console.error('Usage: ' + process.argv[0] + ' ' + path.basename(__filename) + ' <project path>');
	process.exit(2);
}

var root = path.resolve(process.argv[2]);

var templateKeyPattern = /\{@pre\s+type="content"\s+key="([a-zA-Z0-9.\[\]]+)"(?:\s+mode="([^"]+)")?\s*\/\}/gm;
var templatesPath = path.join(root, 'public/templates');
var templatesExt = '.dust';

var bundleKeyPattern = /^\s*([a-zA-Z0-9.\[\]]+)\s*=.*$/gm;
var bundlesPath = path.join(root, 'locales');
var bundlesExt = '.properties';

var hasErrors = false;

var templates = {};
glob.sync(path.join(templatesPath, '**', '*' + templatesExt)).forEach(loadTemplate);

var locales = glob.sync(path.join(bundlesPath, '*', '*')).map(loadLocale);

Object.keys(templates).forEach(checkTemplate);

if (hasErrors) {
	process.exit(1);
}

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
			onError('unused', path.relative(bundlesPath, filename));
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
				onError('missing', path.join(locale, template.name + bundlesExt));
			}
			return;
		}

		var requiredKeys = buildHash(template.keys.raw);
		var pairedKeys = template.keys.paired;
		var unusedKeys = [];

		template.locales[locale].forEach(checkKey);

		var missingKeys = Object.keys(requiredKeys);

		if ((missingKeys.length > 0) || (unusedKeys.length > 0)) {
			onError('invalid', path.join(locale, template.name + bundlesExt), {
				unusedKeys: unusedKeys,
				missingKeys: missingKeys
			});
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

function onError(error, bundle, data) {
	hasErrors = true;

	switch (error) {
	case 'missing':
		console.log(chalk.red('Missing bundle: ' + bundle));
		break;

	case 'unused':
		console.log(chalk.yellow('Unused bundle: ' + bundle));
		break;

	case 'invalid':
		var unused = (data.unusedKeys.length > 0);
		var missing = (data.missingKeys.length > 0);
		var color = (missing ? chalk.red : chalk.yellow);

		console.log(color('Invalid bundle: ' + bundle));
		if (missing) {
			console.log('\tMissing keys: ' + data.missingKeys.join(', '));
		}
		if (unused) {
			console.log('\tUnused keys: ' + data.unusedKeys.join(', '));
		}
		break;

	default:
		console.error(chalk.red('Invalid bundle (unknown error: ' + error + '): ' + bundle));
	}
}
