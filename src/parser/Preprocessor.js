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
		this._macros = Object.create(null);
	}

	_peekTokenNoWS() {
		if (this._input[0].type() === 'whitespace') {
			return this._input[1];
		} else {
			return this._input[0];
		}
	}

	_readTokenNoWS() {
		this._dropWS();
		return this._input.shift();
	}

	_dropWS() {
		if (this._input[0].type() === 'whitespace') {
			this._input.shift();
		}
	}

	_consume() {
		return this._input.shift();
	}

	_consumeIfNoWS(type) {
		if (this._peekTokenNoWS().type() === type) {
			return this._readTokenNoWS();
		}
		return null;
	}

	_skipLine() {
		while (this._input[0].type() !== 'linebreak') {
			this._input.shift();
		}
		this._input.shift();
		return;
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

	_processErrorDirective(directive) {
		let type = DiagnosticMessage.LEVEL_ERROR;
		if (directive.value() === 'warning') {
			type = DiagnosticMessage.LEVEL_WARNING;
		}
		this._dropWS();
		let text = '';
		while (this._input[0].type() !== 'linebreak') {
			text += this._consume().value();
		}
		this._consume(); // Line break
		this._context.emitDiagnostics(new DiagnosticMessage(type, text, directive.range()));
	}

	_processDefineDirective() {
		let name = this._readTokenNoWS();
		if (name.type() !== 'identifier') {
			if (name.type() === 'linebreak') {
				this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'macro name missing', name.range()));
				return;
			} else {
				this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'macro name must be identifier', name.range()));
				this._skipLine(); // Error recovery
				return;
			}
		}
		if (this._input[0].type() === '(') {
			// Function-like
			this._consume();

			let parameters = [];
			let vaarg = false;

			let param = this._peekTokenNoWS();
			switch (param.type()) {
				case 'identifier':
					this._readTokenNoWS();
					parameters.push(param);
					while (this._consumeIfNoWS(',')) {
						param = this._readTokenNoWS();
						if (param.type() === '...') {
							vaarg = true;
							break;
						} else if (param.type() !== 'identifier') {
							this._context.emitDiagnostics(
								new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'invalid token in macro parameter list', param.range()));
							this._skipLine();
							return;
						}
						parameters.push(param);
					}
					break;
				case '...':
					this._readTokenNoWS();
					vaarg = true;
					break;
					// Treate linebreak as missing ) instead of invalid token
				case 'linebreak':
				case ')':
					break;
				default:
					this._context.emitDiagnostics(
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'invalid token in macro parameter list', param.range()));
					this._skipLine();
					return;
			}

			if (!this._consumeIfNoWS(')')) {
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'missing \')\' in macro parameter list', this._peekTokenNoWS().range()));
				this._skipLine();
				return;
			}

			this._dropWS();

			// Get the replacement list
			let line = [];
			while (this._input[0].type() !== 'linebreak') {
				line.push(this._consume());
			}
			this._consume();

			// Trim trailing whitespace
			if (line.length && line[line.length - 1].type() === 'whitespace') {
				line.pop();
			}

			if (name.value() in this._macros) {
				let old = this._macros[name.value()];
				let same = false;
				if (old.isFunctionLike && old.varadic === vaarg &&
					old.parameters.length == parameters.length &&
					old.replacementList.length === line.length) {
					same = true;
					let oldParam = old.parameters;
					for (let i = 0; i < parameters.length; i++) {
						if (oldParam[i].value() !== parameters[i].value()) {
							same = false;
							break;
						}
					}
					if (same) {
						let oldLine = old.replacementList;
						for (let i = 0; i < line.length; i++) {
							if (oldLine[i].value() !== line[i].value()) {
								same = false;
								break;
							}
						}
					}
				}
				if (!same) {
					this._context.emitDiagnostics(
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '\'' + name.value() + '\' macro redefined', name.range()));
					this._context.emitDiagnostics(
						new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous definition is here', old.nameToken.range()));
				}
			} else {
				this._macros[name.value()] = {
					isFunctionLike: true,
					nameToken: name,
					varadic: vaarg,
					parameters: parameters,
					replacementList: line
				};
			}
			return;
		} else if (this._input[0].type() !== 'whitespace' && this._input[0].type() !== 'linebreak') {
			this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'whitespace is required after the macro name', this._input[0].range()));
		}

		this._dropWS();

		// Get the replacement list
		let line = [];
		while (this._input[0].type() !== 'linebreak') {
			line.push(this._consume());
		}
		this._consume();

		// Trim trailing whitespace
		if (line.length && line[line.length - 1].type() === 'whitespace') {
			line.pop();
		}

		if (name.value() in this._macros) {
			let old = this._macros[name.value()];
			let same = false;
			if (!old.isFunctionLike) {
				let oldLine = old.replacementList;
				if (oldLine.length === line.length) {
					same = true;
					for (let i = 0; i < line.length; i++) {
						if (oldLine[i].value() !== line[i].value()) {
							same = false;
							break;
						}
					}
				}
			}
			if (!same) {
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '\'' + name.value() + '\' macro redefined', name.range()));
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous definition is here', old.nameToken.range()));
			}
		} else {
			this._macros[name.value()] = {
				isFunctionLike: false,
				nameToken: name,
				replacementList: line
			};
		}
	}

	_processUndefDirective() {
		let name = this._readTokenNoWS();
		if (name.type() !== 'identifier') {
			if (name.type() === 'linebreak') {
				this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'macro name missing', name.range()));
				return;
			} else {
				this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'macro name must be identifier', name.range()));
				this._skipLine(); // Error recovery
				return;
			}
		}
		delete this._macros[name.value()];
		let token = this._peekTokenNoWS();
		if (token.type() !== 'linebreak') {
			this._context.emitDiagnostics(
				new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, ' extra tokens at end of #undef directive', token.range()));
		}
		this._skipLine();
	}

	processTextLine() {
		// TODO
		while (true) {
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
				case 'if':
				case 'ifdef':
				case 'ifndef':
				case 'elif':
				case 'else':
				case 'endif':
				case 'include':
					break;
				case 'define':
					this._processDefineDirective();
					break;
				case 'undef':
					this._processUndefDirective();
					break;
				case 'line':
					this._processLineDirective();
					break;
				case 'warning':
					this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '#warning is a language extension', directive.range()));
					this._processErrorDirective(directive);
					break;
				case 'error':
					this._processErrorDirective(directive);
					break;
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
