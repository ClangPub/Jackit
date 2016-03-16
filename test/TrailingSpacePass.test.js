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
import Context from '../src/context/Context.js';
import TrailingSpacePass from '../src/pass/TrailingSpacePass.js';
import {
	assert,
	fail
}
from './Test.js';

let ctx = new Context();
let src = new Source('testcase', 'a\n');
let tsrc = TrailingSpacePass.process(ctx, src);

assert(src, tsrc, 'tsrc === src');
assert(0, ctx.diagnostics().length, 'ctx.diagnostics().length === 0');

src = new Source('testcase', 'a \n');
tsrc = TrailingSpacePass.process(ctx, src);

assert(src, tsrc, 'tsrc === src');
assert(1, ctx.diagnostics().length, 'ctx.diagnostics().length === 1');

src = new Source('testcase', 'one trailing space \ntwo trailing spaces  \n');
tsrc = TrailingSpacePass.process(ctx, src);

assert(src, tsrc, 'tsrc === src');
assert(3, ctx.diagnostics().length, 'ctx.diagnostics().length === 3');
