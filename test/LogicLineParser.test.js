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
import LogicLineParser from '../src/parser/LogicLineParser.js';
import {
	assert,
	fail
}
from './Test.js';

let ctx = new Context();
let src = new Source('testcase', '');
let tsrc = LogicLineParser.process(ctx, src);

src = new Source('testcase', 'a');
tsrc = LogicLineParser.process(ctx, src);

assert(1, ctx.diagnostics().length, 'ctx.diagnostics().length === 1');

src = new Source('testcase', '\\\n');
tsrc = LogicLineParser.process(ctx, src);

assert(2, ctx.diagnostics().length, 'ctx.diagnostics().length === 2');

src = new Source('testcase', 'a\nb\n');
tsrc = LogicLineParser.process(ctx, src);

assert(tsrc, src, 'tsrc === src');
assert(2, ctx.diagnostics().length, 'ctx.diagnostics().length === 2');

src = new Source('testcase', 'a\\\nb\n');
tsrc = LogicLineParser.process(ctx, src);

assert('ab\n', tsrc.content(), "tsrc.content() === 'ab\\n'");
assert(3, tsrc.range(0, 1).resolve().end(), 'tsrc.range(0, 1).resolve().end() === 3');
assert(2, ctx.diagnostics().length, 'ctx.diagnostics().length === 2');
