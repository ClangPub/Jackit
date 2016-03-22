/*
 * Copyright (c) 2016, Sunchy321 and Gary Guo
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

import DiagnosticMessage from '../diagnostics/DiagnosticMessage.js';
import Source from '../source/Source.js';
import TransformedSource from '../source/TransformedSource.js';
import LineMap from '../source/LineMap.js';

export default class Preprocessor {
	constructor(context, pptokens) {
		this._context = context;
		this._input = pptokens;
		this._output = [];
		this._source = pptokens[0].range().source();
	}

	_peekTokenNoWS() {
		// We know there is an EOF token, so do not care about terminate condition
		for (let i = 0;; i++) {
			if (this._input[i].type() !== 'whitespace') {
				return this._input[i];
			}
		}
	}

	_readTokenNoWS() {
		let token;
		while ((token = this._input.shift()).type() === 'whitespace');
		return token;
	}

	_skipLine() {
		while (true) {
			switch (this._input[0].type()) {
				case 'linebreak':
					this._input.shift();
				case 'eof':
					// Do not skip eof
					return;
			}
			this._input.shift();
		}
	}

	_calculateLineBias(range, nextLineNumber) {
		let curRange = range.resolve();
		let curLine = curRange.source().linemap().getLineNumber(curRange.end());
		return nextLineNumber - curLine - 1;
	}

	_createFakeSource(source, filename, bias) {
		if (source instanceof TransformedSource) {
			return new TransformedSource(this._createFakeSource(source._source, filename, bias), source.content(), source._indexMap);
		} else {
			// Fake a source with given filename
			let fakeSource = new Source(filename, source.content());
			// Nasty trick, access private field to fake the line map
			fakeSource._linemap = new LineMap(fakeSource, source.linemap()._bias + bias);
			return fakeSource;
		}
	}

	_processLineDirective() {
		// TODO, consider macro and other case
		let line = this._readTokenNoWS();
		let file = this._readTokenNoWS();
		let linebreak = this._readTokenNoWS();

		// TODO Proper parse of digital sequence and file name
		let lineNum = line.value();
		let fileName = file.value();
		fileName = fileName.substring(1, fileName.length - 1);

		let bias = this._calculateLineBias(linebreak.range(), lineNum);
		let fakeSource = this._createFakeSource(this._source, fileName, bias);
		let untransformedFakeSource = fakeSource.range(0).resolve().source();
		let untransformedSource = this._source.range(0).resolve().source();

		// Nasty trick again, access private field to get the diagonistics and fix line information
		for (let diag of this._context._diagnostics) {
			let origRange = diag.range().resolve();
			// If the diagnostic comes after the #line, we need to fix it
			if (origRange.source() === untransformedSource && origRange.start() >= line.range().resolve().start()) {
				origRange._source = untransformedFakeSource;
			}
			// Reassign, in case source is transformed
			diag._range = origRange;
		}

		// More Nasty tricks, now transform the range of every succeeding token
		for (let token of this._input) {
			let origRange = token.range();
			// No check needed
			origRange._source = fakeSource;
		}

		this._source = fakeSource;
	}

	processTextLine() {
		// TODO
		while (this._input[0].type() !== 'eof') {
			let token = this._input.shift();
			if (token.type() === 'identifier') {
				// TODO Macro
				this._output.push(token);
			} else {
				this._output.push(token);
				if (token.type() === 'linebreak') {
					break;
				}
			}
		}
	}

	processLine() {
		// End of file
		if (this._input[0].type() === 'eof') {
			this._output.push(this._input.shift());
			return false;
		}

		if (this._peekTokenNoWS().type() !== '#') {
			this.processTextLine();
			return true;
		} else {
			let hashToken = this._readTokenNoWS();
			let directive = this._readTokenNoWS();

			// Empty directive is allowed
			if (directive.type() === 'linebreak') {
				return true;
			}

			switch (directive.value()) {
				case 'line':
					this._processLineDirective();
					break;
				case 'if':
				case 'ifdef':
				case 'ifndef':
				case 'elif':
				case 'else':
				case 'endif':
				case 'include':
				case 'define':
				case 'undef':
				case 'error':
				case 'pragma':
					break;
				default:
					this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'invalid preprocessing directive', directive.range()));
					// Error recovery, skip line
					this._skipLine();
					break;
			}
			return true;
		}
	}

	static process(context, pptokens) {
		let preprocessor = new Preprocessor(context, pptokens);
		while (preprocessor.processLine());
		return preprocessor._output;
	}

}
