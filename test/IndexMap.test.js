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

import IndexMap from '../src/source/IndexMap.js';
import {
	assert,
	fail
}
from './Test.js';

let m = new IndexMap();
assert(7, m.getMapping(7), 'm.getMapping(7) == 7');
assert(0, m.getMapping(0), 'm.getMapping(0) == 0');
assert(10, m.getMapping(10), 'm.getMapping(10) == 10');

m.addMapping(1, 2);

assert(0, m.getMapping(0), 'm.getMapping(0) == 0');
assert(2, m.getMapping(1), 'm.getMapping(1) == 2');
assert(11, m.getMapping(10), 'm.getMapping(10) == 11');

m.addMapping(4, 1);
assert(0, m.getMapping(0), 'm.getMapping(0) == 0');
assert(4, m.getMapping(3), 'm.getMapping(3) == 4');
assert(1, m.getMapping(4), 'm.getMapping(4) == 1');
assert(7, m.getMapping(10), 'm.getMapping(10) == 7');

try {
	m.addMapping(3, 1);
	fail('not throwing given invalid input', 'm.addMapping(3, 1) throws');
} catch (_) {

}