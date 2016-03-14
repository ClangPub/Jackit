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

import Source from '../src/source/Source.js';
import TransformedSource from '../src/source/TransformedSource.js';
import IndexMap from '../src/source/IndexMap.js';
import {
	assert,
	fail
}
from './Test.js';

let src = new Source('testcase', 'A\nBB\nCCC\n\nD\n');

let imap = new IndexMap();
imap.addMapping(1, 2);
imap.addMapping(3, 5);
imap.addMapping(6, 10);

let tsrc = new TransformedSource(src, 'ABBCCCD', imap);
let range = tsrc.range(1, 6);

assert('testcase', tsrc.filename(), "tsrc.filename() === 'testcase'");
assert(src, range.source(), 'range.source() === src');
assert(2, range.caret(), 'range.caret() === 2');
assert(2, range.start(), 'range.start() === 2');
assert(10, range.end(), 'range.end() === 10');

range = tsrc.range(4);
assert(6, range.caret(), 'range.caret() === 6');
assert(6, range.start(), 'range.start() === 6');
assert(6, range.end(), 'range.end() === 6');

range = tsrc.range(1, 4, 6);
assert(2, range.start(), 'range.start() === 2');
assert(6, range.caret(), 'range.caret() === 6');
assert(10, range.end(), 'range.end() === 10');