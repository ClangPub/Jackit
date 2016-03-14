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

import Context from '../src/context/Context.js';
import Source from '../src/source/Source.js';
import DiagnosticMessage from '../src/diagnostics/DiagnosticMessage.js';
import {
	assert,
	fail
}
from './Test.js';

let src = new Source('testcase', 'The following phrases are not allowed\n\tQAQ\n\nQAQ\n');
let ctx = new Context();

let msg = new DiagnosticMessage(DiagnosticMessage.LEVEL_FATAL, 'Invalid phrases in document, ...', src.range(44, 47));
let msg2 = new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, '... because it is not allowed', src.range(0, 39, 43));
try {
	ctx.emitDiagnosticMessage(msg, msg2);
} catch (e) {
	if (e instanceof DiagnosticMessage) {
		ctx.generateDiagnostics();
	} else {
		throw e;
	}
}