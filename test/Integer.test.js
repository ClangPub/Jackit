/*
 * Copyright (c) 2016, ClangPub
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

import Integer from '../src/util/Integer.js';
import { assert, fail } from './Test.js';
import equal from '../util/Equal.js';

const base = Integer.BASE;

// test _shrink
{
	assert([], Integer._shrink([]), 'Integer._shrink([]) == []');
	assert([], Integer._shrink([0]), 'Integer._shrink([0]) == []');
	assert([], Integer._shrink([0, 0]), 'Integer._shrink([0, 0]) == []');
	assert([0, 1], Integer._shrink([0, 1]), 'Integer._shrink([0, 1]) == [0, 1]');
	assert([0, 1], Integer._shrink([0, 1, 0]), 'Integer._shrink([0, 1, 0]) == [0, 1]');
}

// test _rawCmp
{
	assert(0, Integer._rawCmp([], []), 'Integer._rawCmp([], []) == 0');
	assert(1, Integer._rawCmp([1], []), 'Integer._rawCmp([1], []) == 1');
	assert(-1, Integer._rawCmp([], [1]), 'Integer._rawCmp([], [1]) == -1');
	assert(0, Integer._rawCmp([1], [1]), 'Integer._rawCmp([1], [1]) == 0');
	assert(1, Integer._rawCmp([2], [1]), 'Integer._rawCmp([2], [1]) == 1');
	assert(-1, Integer._rawCmp([1], [2]), 'Integer._rawCmp([1], [2]) == -1');
}

// test _rawAdd
{
	assert([], Integer._rawAdd([], []), 'Integer._rawAdd([], []) == []');
	assert([5, 1], Integer._rawAdd([2, 1], [3]), 'Integer._rawAdd([2, 1], [3]) == [5, 1]');
	assert([5, 1], Integer._rawAdd([3], [2, 1]), 'Integer._rawAdd([3], [2, 1]) == [5, 1]');
	assert([0, 1], Integer._rawAdd([base - 1], [1]), 'Integer._rawAdd([base - 1], [1]) == [0, 1]');
	assert([0, 0, 0, 1], Integer._rawAdd([base - 1, base - 1, base - 1], [1]), 'Integer._rawAdd([base - 1, base - 1, base - 1], [1]) == [0, 0, 0, 1]');
}

// test _rawSub
function testRawSub(ispos, values, actual, description = '') {
	assert(ispos, actual.ispos, description);
	assert(values, actual.values, description);
}

{
	testRawSub(false, [], Integer._rawSub([], []), 'Integer._rawSub([], []) == {ispos: false, values: []}');
	testRawSub(false, [], Integer._rawSub([1], [1]), 'Integer._rawSub([1], [1]) == {ispos: false, values: []}');
	testRawSub(false, [], Integer._rawSub([0, 0, 1], [0, 0, 1]), 'Integer._rawSub([0, 0, 1], [0, 0, 1]) == {ispos: false, values: []}');

	testRawSub(true, [1], Integer._rawSub([1], []), 'Integer._rawSub([1], []) == {ispos: false, values: []}');
	testRawSub(false, [1], Integer._rawSub([], [1]), 'Integer._rawSub([], [1]) == {ispos: true, values: []}');

	testRawSub(true, [base - 1], Integer._rawSub([0, 1], [1]), 'Integer._rawSub([0, 1], [1]) == {ispos: true, values: [base - 1]}');
	testRawSub(false, [base - 1], Integer._rawSub([1], [0, 1]), 'Integer._rawSub([1], [0, 1]) == {ispos: true, values: [base - 1]}');

	testRawSub(true, [base - 1, base - 1], Integer._rawSub([0, 0, 1], [1]), 'Integer._rawSub([0, 0, 1], [1]) == {ispos: false, values: [base - 1, base - 1]}');
	testRawSub(false, [base - 1, base - 1], Integer._rawSub([1], [0, 0, 1]), 'Integer._rawSub([1], [0, 0, 1]) == {ispos: true, values: [base - 1, base - 1]}');
}

// test fromString
{
	let i = Integer.fromString('');

	assert([], i._values, 'i._values == []');
	assert('0', i.toString(), 'i.toString() == \'0\'');

	i = Integer.fromString('12345678');

	assert([5678, 1234], i._values, 'i._values == [5678, 1234]');
	assert(true, i._ispos, 'i._ispos == true');
	assert('12345678', i.toString(), 'i.toString() == \'12345678\'');

	i = Integer.fromString('123456');

	assert([3456, 12], i._values, 'i._values == [3456, 12]');
	assert(true, i._ispos, 'i._ispos == true');
	assert('123456', i.toString(), 'i.toString() == \'123456\'');

	i = Integer.fromString('1000000001');

	assert([1, 0, 10], i._values, 'i._values == [1, 0, 10]');
	assert(true, i._ispos, 'i._ispos == true');
	assert('1000000001', i.toString(), 'i.toString() == \'1000000001\'');

	i = Integer.fromString('00000001000000001');

	assert([1, 0, 10], i._values, 'i._values == [1, 0, 10]');
	assert(true, i._ispos, 'i._ispos == true');
	assert('1000000001', i.toString(), 'i.toString() == \'1000000001\'');

	i = Integer.fromString('+12345678');

	assert([5678, 1234], i._values, 'i._values == [5678, 1234]');
	assert(true, i._ispos, 'i._ispos == true');
	assert('12345678', i.toString(), 'i.toString() == \'12345678\'');

	i = Integer.fromString('+123456');

	assert([3456, 12], i._values, 'i._values == [3456, 12]');
	assert(true, i._ispos, 'i._ispos == true');
	assert('123456', i.toString(), 'i.toString() == \'123456\'');

	i = Integer.fromString('-12345678');

	assert([5678, 1234], i._values, 'i._values == [5678, 1234]');
	assert(false, i._ispos, 'i._ispos == true');
	assert('-12345678', i.toString(), 'i.toString() == \'-12345678\'');

	i = Integer.fromString('-123456');

	assert([3456, 12], i._values, 'i._values == [3456, 12]');
	assert(false, i._ispos, 'i._ispos == true');
	assert('-123456', i.toString(), 'i.toString() == \'-123456\'');

	assert(null, Integer.fromString('#'), 'Integer.fromString\'#\' == null');
}

// test cmp
{
	let zero   = Integer.ZERO;
	let one    = Integer.ONE;
	let pnum   = new Integer('123456');
	let negone = new Integer('-1');
	let nnum   = new Integer('-123456');

	assert(0, zero.cmp(zero), 'zero.cmp(zero) == 0');
	assert(0, one.cmp(one), 'one.cmp(one) == 0');
	assert(0, pnum.cmp(pnum), 'pnum.cmp(pnum) == 0');
	assert(0, negone.cmp(negone), 'negone.cmp(negone) == 0');
	assert(0, nnum.cmp(nnum), 'nnum.cmp(nnum) == 0');

	assert(-1, nnum.cmp(negone), 'nnum.cmp(negone) == -1');
	assert(-1, negone.cmp(zero), 'negone.cmp(zero) == -1');
	assert(-1, zero.cmp(one), 'zero.cmp(one) == -1');
	assert(-1, one.cmp(pnum), 'one.cmp(pnum) == -1');

	assert(1, pnum.cmp(one), 'pnum.cmp(one) == -1');
	assert(1, one.cmp(zero), 'one.cmp(zero) == -1');
	assert(1, zero.cmp(negone), 'zero.cmp(negone) == -1');
	assert(1, negone.cmp(nnum), 'negone.cmp(nnumnnum) == -1');
}

// test add and sub
{
	const min = 234;
	const max = 91794629;
	const rand = () => Math.floor(Math.random() * (max - min + 1) + min);
	const toint = i => Number(i.toString());

	let a = rand();
	let b = rand();

	assert(a + b, toint(new Integer(a).add(new Integer(b))), 'toint(Integer(a).add(Integer(b))) == a + b');
	assert(-a + b, toint(new Integer('-' + a).add(new Integer(b))), 'toint(Integer(\'-\' + a).add(Integer(b))) == -a + b');
	assert(-a + -b, toint(new Integer('-' + a).add(new Integer('-' + b))), 'toint(Integer(\'-\' + a).add(Integer(\'-\' + b))) == -a + -b');
	assert(a + -b, toint(new Integer(a).add(new Integer('-' + b))), 'toint(Integer(a).add(Integer(\'-\' + b))) == a + -b');

	assert(a - b, toint(new Integer(a).sub(new Integer(b))), 'toint(Integer(a).sub(Integer(b))) == a - b');
	assert(-a - b, toint(new Integer('-' + a).sub(new Integer(b))), 'toint(Integer(\'-\' + a).sub(Integer(b))) == -a - b');
	assert(-a - (-b), toint(new Integer('-' + a).sub(new Integer('-' + b))), 'toint(Integer(\'-\' + a).sub(Integer(\'-\' + b))) == -a - -b');
	assert(a - (-b), toint(new Integer(a).sub(new Integer('-' + b))), 'toint(Integer(a).sub(Integer(\'-\' + b))) == a - -b');
}
