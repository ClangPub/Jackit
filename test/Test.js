/*
 * Copyright (c) 2016, Gary Guo
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * * Redistributions of source code must retain the above copyright notice, this
 *   list of conditions and the following disclaimer.
 *
 * * Redistributions in binary form must reproduce the above copyright notice,
 *   this list of conditions and the following disclaimer in the documentation
 *   and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import fs from 'fs';
import path from 'path';
import Color from '../src/diagnostics/Color.js';
import equal from '../util/Equal.js';

const filename = path.basename(__filename);
const tests = fs.readdirSync(__dirname);
let currentTest;
let failed;
let totalPass = 0;
let totalFail = 0;

export function assert(expect, actual, description = '') {
	if (!equal(expect, actual)) {
		failed = true;
		console.error(`${Color.wrap('fail: ', Color.LIGHT_RED)}${currentTest}: ${description}: expected ${expect}, but have ${actual} instead.`);
	}
}

export function fail(reason, description = '') {
	failed = true;
	console.error(`${Color.wrap('fail: ', Color.LIGHT_RED)}${currentTest}: ${description}: ${reason}.`);
}

for (currentTest of fs.readdirSync(__dirname)) {
	failed = false;
	if (currentTest === filename) {
		continue;
	}
	try {
		require('./' + currentTest);
	} catch (e) {
		totalFail++;
		console.error(`${Color.wrap('fail: ', Color.LIGHT_RED)}${currentTest} failed: ${e.stack}.`);
		continue;
	}
	if (failed) {
		totalFail++;
		console.error(`${Color.wrap('fail: ', Color.LIGHT_RED)}${currentTest} failed.`);
	} else {
		totalPass++;
		console.error(`${Color.wrap('pass: ', Color.GREEN)}${currentTest} passed.`);
	}
}

if (totalFail !== 0) {
	console.error(`${Color.wrap('fail: ', Color.LIGHT_RED)}${totalPass} out of ${totalPass + totalFail} tests passed. Coverage ${Math.round(totalPass / (totalPass + totalFail) * 100)}%.`);
} else {
	console.error(`${Color.wrap('pass: ', Color.GREEN)}all tests passed.`);
}
