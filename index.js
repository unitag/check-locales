'use strict';

var path = require('path');

var async = require('async');
var glob = require('glob');
var fse = require('fs-extra');
var chalk = require('chalk');

module.exports = exports = checkLocales;

var templateKeyPattern = /\{@pre\s+type="content"\s+key="([a-zA-Z0-9.\[\]]+)"(?:\s+mode="([^"]+)")?\s*\/\}/gm;
var templateExt = '.dust';

var bundleKeyPattern = /^\s*([a-zA-Z0-9.\[\]]+)\s*=.*$/gm;
var bundleExt = '.properties';

function checkLocales(root, options, callback) {
	if (typeof options === 'function') {
		callback = options;
		options = {};

	} else if (!(options instanceof Object)) {
		options = {};
	}

	var templatesRoot = path.join(root, 'public', 'templates');
	var bundlesRoot = path.join(root, 'locales');

	var globOptions = {
		ignore: options.ignore || []
	};

	var missingBundleHandling = options.missingBundle || 'allow';

	var templates = {};
	var locales = [];
	var badBundles = [];
	var createdBundles = [];

	glob(path.join(templatesRoot, '**', '*' + templateExt), globOptions, loadTemplates);

	function loadTemplates(error, filenames) {
		if (error) {
			callback(error);
			return;
		}

		async.each(filenames, loadTemplate, onTemplatesLoaded);
	}

	function loadTemplate(filename, callback) {
		fse.readFile(filename, 'utf8', parseTemplate);

		function parseTemplate(error, file) {
			if (error) {
				callback(error);
				return;
			}

			var name = path.relative(templatesRoot, filename).slice(0, -templateExt.length);

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

		glob(path.join(bundlesRoot, '*', '*'), globOptions, loadLocales);
	}

	function loadLocales(error, dirnames) {
		if (error) {
			callback(error);
			return;
		}

		async.each(dirnames, loadLocale, onLocalesLoaded);
	}

	function loadLocale(dirname, callback) {
		var locale = path.relative(bundlesRoot, dirname);
		locales.push(locale);

		var requiredBundles = buildHash(Object.keys(templates));

		glob(path.join(dirname, '**', '*' + bundleExt), globOptions, loadBundles);

		function loadBundles(error, filenames) {
			if (error) {
				callback(error);
				return;
			}

			async.each(filenames, loadBundle, onBundlesLoaded);
		}

		function loadBundle(filename, callback) {
			fse.readFile(filename, 'utf8', parseBundle);

			function parseBundle(error, file) {
				if (error) {
					callback(error);
					return;
				}

				var name = path.relative(dirname, filename).slice(0, -bundleExt.length);

				if (!templates.hasOwnProperty(name)) {
					onBadBundle('unused', path.relative(bundlesRoot, filename));
				} else {
					templates[name].locales[locale] = getBundleKeys(file);
					delete requiredBundles[name];
				}

				callback(null);
			}
		}

		function onBundlesLoaded(error) {
			if (error) {
				callback(error);
				return;
			}

			var missingBundles = Object.keys(requiredBundles);

			if ((missingBundles.length === 0) || (missingBundleHandling !== 'create')) {
				callback(null);
				return;
			}

			var missingPaths = missingBundles.map(function onMissingBundle(name) {
				var bundlePath = path.join(locale, name + bundleExt);
				createdBundles.push(bundlePath);
				return path.join(bundlesRoot, bundlePath);
			});

			async.each(missingPaths, fse.ensureFile, callback);
		}
	}

	function onLocalesLoaded(error) {
		if (error) {
			callback(error);
			return;
		}

		Object.keys(templates).forEach(checkTemplate);

		callback(null, badBundles, createdBundles);
	}

	function checkTemplate(name) {
		var template = templates[name];

		locales.forEach(checkLocale);

		function checkLocale(locale) {
			if (!template.locales.hasOwnProperty(locale)) {
				if ((missingBundleHandling === 'forbid') || (template.keys.length > 0)) {
					onBadBundle('missing', path.join(locale, template.name + bundleExt));
					return;
				}

				template.locales[locale] = [];
			}

			var requiredKeys = buildHash(template.keys.raw);
			var treeKeys = template.keys.tree;
			var unusedKeys = [];

			template.locales[locale].forEach(checkKey);

			var missingKeys = Object.keys(requiredKeys);

			if ((missingKeys.length > 0) || (unusedKeys.length > 0)) {
				onBadBundle('invalid', path.join(locale, template.name + bundleExt), {
					unusedKeys: unusedKeys,
					missingKeys: missingKeys
				});
			}

			function checkKey(key) {
				if (requiredKeys.hasOwnProperty(key)) {
					delete requiredKeys[key];
				} else if (!inTree(key)) {
					unusedKeys.push(key);
				}
			}

			function inTree(key) {
				for (var index = 0, count = treeKeys.length; index < count; index++) {
					if (matchesPrefix(treeKeys[index], key)) {
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
			console.log(chalk.red('Invalid bundle (unknown error: ' + error + '): ' + bundlePath));
		}
	}
}

function getTemplateKeys(file) {
	var raw = {};
	var tree = {};

	var match;
	while ((match = templateKeyPattern.exec(file))) {
		var mode = match[2];
		var isTree = (mode === 'paired') || (mode === 'json');
		(isTree ? tree : raw)[match[1]] = true;
	}

	return {
		raw: Object.keys(raw),
		tree: Object.keys(tree)
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
