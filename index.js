'use strict';

var path = require('path');
var fs = require('fs');

var async = require('async');
var glob = require('glob');
var chalk = require('chalk');

module.exports = exports = checkLocales;

var templateKeyPattern = /\{@pre\s+type="content"\s+key="([a-zA-Z0-9.\[\]]+)"(?:\s+mode="([^"]+)")?\s*\/\}/gm;
var templatesExt = '.dust';

var bundleKeyPattern = /^\s*([a-zA-Z0-9.\[\]]+)\s*=.*$/gm;
var bundlesExt = '.properties';

function checkLocales(root, options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};

	} else if (!(options instanceof Object)) {
		options = {};
	}

	var templatesPath = path.join(root, 'public', 'templates');
	var bundlesPath = path.join(root, 'locales');

	var globOptions = {
		ignore: options.ignore || []
	};

	var templates = {};
	var locales = [];
	var badBundles = [];

	glob(path.join(templatesPath, '**', '*' + templatesExt), globOptions, loadTemplates);

	function loadTemplates(error, filenames) {
		if (error) {
			callback(error);
			return;
		}

		async.each(filenames, loadTemplate, onTemplatesLoaded);
	}

	function loadTemplate(filename, callback) {
		fs.readFile(filename, 'utf8', parseTemplate);

		function parseTemplate(error, file) {
			if (error) {
				callback(error);
				return;
			}

			var name = path.relative(templatesPath, filename).slice(0, -templatesExt.length);

			templates[name] = {
				name: name,
				keys: getTemplateKeys(file),
				locales: {}
			};

			callback(null);
		}
	}

	function onTemplatesLoaded(error) {
		if (error) {
			callback(error);
			return;
		}

		glob(path.join(bundlesPath, '*', '*'), globOptions, loadLocales);
	}

	function loadLocales(error, dirnames) {
		if (error) {
			callback(error);
			return;
		}

		async.each(dirnames, loadLocale, onLocalesLoaded);
	}

	function loadLocale(dirname, callback) {
		var locale = path.relative(bundlesPath, dirname);
		locales.push(locale);

		glob(path.join(dirname, '**', '*' + bundlesExt), globOptions, loadBundles);

		function loadBundles(error, filenames) {
			if (error) {
				callback(error);
				return;
			}

			async.each(filenames, loadBundle, callback);
		}

		function loadBundle(filename, callback) {
			fs.readFile(filename, 'utf8', parseBundle);

			function parseBundle(error, file) {
				if (error) {
					callback(error);
					return;
				}

				var name = path.relative(dirname, filename).slice(0, -bundlesExt.length);

				if (!templates.hasOwnProperty(name)) {
					onBadBundle('unused', path.relative(bundlesPath, filename));
				} else {
					templates[name].locales[locale] = getBundleKeys(file);
				}

				callback(null);
			}
		}
	}

	function onLocalesLoaded(error) {
		if (error) {
			callback(error);
			return;
		}

		Object.keys(templates).forEach(checkTemplate);

		callback(null, badBundles);
	}

	function checkTemplate(name) {
		var template = templates[name];

		locales.forEach(checkLocale);

		function checkLocale(locale) {
			if (!template.locales.hasOwnProperty(locale)) {
				if (template.keys.length > 0) {
					onBadBundle('missing', path.join(locale, template.name + bundlesExt));
				}
				return;
			}

			var requiredKeys = buildHash(template.keys.raw);
			var pairedKeys = template.keys.paired;
			var unusedKeys = [];

			template.locales[locale].forEach(checkKey);

			var missingKeys = Object.keys(requiredKeys);

			if ((missingKeys.length > 0) || (unusedKeys.length > 0)) {
				onBadBundle('invalid', path.join(locale, template.name + bundlesExt), {
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

	function onBadBundle(error, bundlePath, data) {
		badBundles.push({
			bundlePath: bundlePath,
			error: error,
			data: data
		});

		switch (error) {
		case 'missing':
			console.log(chalk.red('Missing bundle: ' + bundlePath));
			break;

		case 'unused':
			console.log(chalk.yellow('Unused bundle: ' + bundlePath));
			break;

		case 'invalid':
			var unused = (data.unusedKeys.length > 0);
			var missing = (data.missingKeys.length > 0);
			var color = (missing ? chalk.red : chalk.yellow);

			console.log(color('Invalid bundle: ' + bundlePath));
			if (missing) {
				console.log('\tMissing keys: ' + data.missingKeys.join(', '));
			}
			if (unused) {
				console.log('\tUnused keys: ' + data.unusedKeys.join(', '));
			}
			break;

		default:
			console.error(chalk.red('Invalid bundle (unknown error: ' + error + '): ' + bundlePath));
		}
	}
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
