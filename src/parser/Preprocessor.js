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
import MacroReplacedPPToken from '../ast/MacroReplacedPPToken.js';
import PPToken from '../ast/PPToken.js';

export default class Preprocessor {
	constructor(context, pptokens) {
		this._context = context;
		this._input = pptokens;
		this._output = [];
		this._source = pptokens[0].range().source();
		this._macros = Object.create(null);
		this._macros['__FILE__'] = null;
		this._macros['__LINE__'] = null;
		this._paren = 0;
		this._waitlparen = false;
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

	_getMacroNameAndSkipLine(directiveName) {
		let name = this._readTokenNoWS();
		if (name.type() !== 'identifier') {
			if (name.type() === 'linebreak') {
				this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'macro name missing', name.range()));
				return null;
			} else {
				this._context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'macro name must be identifier', name.range()));
				this._skipLine(); // Error recovery
				return null;
			}
		}
		this._scanExtraToken(directiveName);
		return name;
	}

	_scanExtraToken(directiveName) {
		let token = this._peekTokenNoWS();
		if (token.type() !== 'linebreak') {
			this._context.emitDiagnostics(
				new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'extra tokens at end of ' + directiveName + ' directive', token.range()));
		}
		this._skipLine();
	}

	_processUndefDirective() {
		let name = this._getMacroNameAndSkipLine('#undef');
		if (name) {
			delete this._macros[name.value()];
		}
	}

	_processIfdefDirective() {
		let name = this._getMacroNameAndSkipLine('#ifdef');
		let defined = false;
		if (name) {
			if (name.value() in this._macros) {
				defined = true;
			}
		}
		this._processIf(defined);
	}

	_processIfndefDirective() {
		let name = this._getMacroNameAndSkipLine('#ifndef');
		let notDefined = false;
		if (name) {
			if (!(name.value() in this._macros)) {
				notDefined = true;
			}
		}
		this._processIf(notDefined);
	}

	_processIfRetain() {
		while (true) {
			if (this._input[0].type() === 'eof') {
				console.log('TODO: EOF Warning');
				return null;
			}

			if (this._peekTokenNoWS().type() !== '#') {
				this.processTextLine();
			} else {
				let hashToken = this._readTokenNoWS();
				let directive = this._readTokenNoWS();

				switch (directive.value()) {
					case 'endif':
					case 'elif':
					case 'else':
						return directive;
				}
				this._processDirective(directive);
			}
		}
	}

	_processIfDiscard() {
		while (true) {
			if (this._input[0].type() === 'eof') {
				console.log('TODO: EOF Warning');
				return null;
			}

			if (this._peekTokenNoWS().type() !== '#') {
				this._skipLine();
			} else {
				let hashToken = this._readTokenNoWS();
				let directive = this._readTokenNoWS();

				switch (directive.value()) {
					case 'endif':
					case 'elif':
					case 'else':
						return directive;
				}
				this._skipLine();
			}
		}
	}

	_processIfDirective() {
		this._context.emitDiagnostics(
			new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, '#if is not implemented yet, treat as true', this._peekTokenNoWS().range()));
		this._skipLine();
		this._processIf(true);
	}

	_processIf(value) {
		if (value) {
			let directive = this._processIfRetain();
			let elseAppeared = false;
			switch (directive.value()) {
				case 'endif':
					this._scanExtraToken('#endif');
					return;
				case 'else':
					elseAppeared = true;
				case 'elif':
					this._skipLine();
					while (true) {
						let directive = this._processIfDiscard();
						switch (directive.value()) {
							case 'endif':
								this._scanExtraToken('#endif');
								return;
							case 'elif':
							case 'else':
								if (elseAppeared) {
									this._context.emitDiagnostics(
										new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '#' + directive.value() + ' after #else', directive.range()));
								}
								if (directive.value() === 'else') {
									elseAppeared = true;
								}
								this._skipLine();
								break;
						}
					}
			}
		} else {
			let directive = this._processIfDiscard();
			switch (directive.value()) {
				case 'endif':
					this._scanExtraToken('#endif');
					return;
				case 'elif':
					this._processIfDirective();
					return;
				case 'else':
					this._scanExtraToken('#else');
					while (true) {
						let directive = this._processIfRetain();
						switch (directive.value()) {
							case 'endif':
								this._scanExtraToken('#endif');
								return;
							case 'else':
							case 'elif':
								this._context.emitDiagnostics(
									new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '#' + directive.value() + ' after #else', directive.range()));
								this._skipLine();
								break;
						}
					}
			}
		}
	}

	_processMacro(token) {
		let macro = this._macros[token.value()];

		// Check eligibility to replace
		let cause = token;
		while (cause instanceof MacroReplacedPPToken) {
			cause = cause.cause();
			if (cause.value() === token.value()) {
				// Previous expanded, abort
				this._output.push(token);
				return;
			}
		}

		if (!macro.isFunctionLike) {
			this._input.unshift(...macro.replacementList.map(tok => new MacroReplacedPPToken(tok, token)));
		} else {
			this._waitlparen = true;
			this._output.push(new MacroReplacedPPToken(
				new PPToken(null, 'macro', null), token));
		}
	}

	_processMacroNoArgList() {
		let i, tok;
		for (i = this._output.length - 2; i >= 0; i--) {
			tok = this._output[i];
			if (tok.type() === 'macro') {
				break;
			}
		}
		if (i < 0) {
			throw new Error('Internal Error');
		}
		this._output[i] = tok.cause();
	}

	_stripSpaceAndLine(tokens) {
		while (tokens.length && (tokens[0].type() === 'whitespace' || tokens[0].type() === 'linebreak')) {
			tokens.shift();
		}
		while (tokens.length && (tokens[tokens.length - 1].type() === 'whitespace' || tokens[tokens.length - 1].type() === 'linebreak')) {
			tokens.pop();
		}
		return tokens;
	}

	_lastEffectiveElement(tokens, index = tokens.length - 1) {
		while (index >= 0 && (tokens[index].type() === 'whitespace' || tokens[index].type() === 'linebreak')) {
			index--;
		}
		return index;
	}

	_escapeString(string) {
		let ret = '"';
		for (let i = 0; i < string.length; i++) {
			if (string[i] === '"') {
				ret += '\\"';
			} else if (string[i] === '\\') {
				ret += '\\\\';
			} else if (string[i] === '\n') {
				ret += '\\\n';
			} else {
				ret += string[i];
			}
		}
		ret += '"';
		return ret;
	}

	_rangeConcat(a, b) {
		if (a.source() !== b.source()) {
			throw new Error('Internal Error');
		}
		return a.source.range(Math.min(a.start(), b.start()), a.caret(), Math.max(a.end(), b.end()));
	}

	_macroExpand(tokens) {
		let output = [];
		loop: while (tokens.length) {
			let macroNameToken = tokens.shift();
			if (macroNameToken.type() !== 'identifier' || !(macroNameToken.value() in this._macros)) {
				output.push(macroNameToken);
				continue;
			}

			let macroName = macroNameToken.value();
			if (macroName === '__FILE__') {
				tokens.unshift(
					new MacroReplacedPPToken(
						new PPToken(macroNameToken.range(), 'string', this._escapeString(macroNameToken.range().source().filename())), macroNameToken));
				continue;
			} else if (macroName === '__LINE__') {
				tokens.unshift(
					new MacroReplacedPPToken(
						new PPToken(macroNameToken.range(), 'number',
							macroNameToken.range().source().linemap().getLineNumber(macroNameToken.range().start()) + 1 + ''), macroNameToken));
				continue;
			}

			// Check eligibility to replace
			let cause = macroNameToken;
			while (cause instanceof MacroReplacedPPToken) {
				cause = cause.cause();
				if (cause.value() === macroName) {
					output.push(macroNameToken);
					continue loop;
				}
			}

			let macro = this._macros[macroName];
			if (!macro.isFunctionLike) {
				tokens.unshift(...macro.replacementList.map(tok => new MacroReplacedPPToken(tok, macroNameToken)));
				continue;
			}

			// Check if the macro is actually invoked
			let lparenPos = -1;
			for (let i = 0; i < tokens.length; i++) {
				let t = tokens[i];
				if (t.type() === '(') {
					lparenPos = i;
					break;
				}
				if (t.type() !== 'whitespace' && t.type() !== 'linebreak') {
					break;
				}
			}
			if (lparenPos === -1) {
				output.push(macroNameToken);
				continue;
			}

			// let debugBeforeExpansion = '';
			// for (let t of output) {
			// 	debugBeforeExpansion += t.value();
			// }
			// debugBeforeExpansion += macroName;
			// for (let t of tokens) {
			// 	debugBeforeExpansion += t.value();
			// }

			// Drop left parenthesis
			tokens.splice(0, lparenPos + 1);

			let argList = [];
			let delimiters = [];

			let lparen = 0;
			for (let i = 0; i < tokens.length; i++) {
				let tok = tokens[i];
				if (lparen === 0) {
					if (tok.type() === ',' || tok.type() === ')') {
						argList.push(tokens.splice(0, i));
						delimiters.push(tok);
						tokens.splice(0, 1);
						i = -1; // Start from 0 again
					}
					if (tok.type() === ')') {
						break;
					}
				}
				if (tok.type() === '(') {
					lparen++;
				} else if (tok.type() === ')') {
					lparen--;
				}
			}

			let result = [];
			loop2: for (let token of macro.replacementList) {
				if (token.type() === 'identifier') {
					for (let i = 0; i < macro.parameters.length; i++) {
						if (macro.parameters[i].value() === token.value()) {
							let lastTokIndex = this._lastEffectiveElement(result);
							if (lastTokIndex >= 0 && result[lastTokIndex].type() === '#') {
								// Stringify
								let str = '';
								let range = null;
								for (let t of argList[i]) {
									str += t.value();
									if (range) {
										range = this._rangeConcat(range, t.range());
									} else {
										range = t.range();
									}
								}
								result.splice(lastTokIndex);
								result.push(new PPToken(range, 'string', this._escapeString(str)));
								continue loop2;
							} else {
								let replaceArg = this._macroExpand(argList[i].slice());
								this._stripSpaceAndLine(replaceArg);
								if (replaceArg.length === 0) {
									result.push(null);
								}
								// Replace with argument
								for (let t of replaceArg) {
									result.push(t);
								}
								continue loop2;
							}
						}
					}
				}

				result.push(new MacroReplacedPPToken(token, macroNameToken));
			}

			for (let i = 1; i < result.length - 1; i++) {
				if (result[i] && result[i].type() === '##') {
					let prevIndex = i - 1;
					while (result[prevIndex] && (result[prevIndex].type() === 'whitespace' || result[prevIndex].type() === 'linebreak')) {
						prevIndex--;
					}

					let nextIndex = i + 1;
					while (result[nextIndex] && (result[nextIndex].type() === 'whitespace' || result[nextIndex].type() === 'linebreak')) {
						nextIndex++;
					}
					let prev = result[prevIndex];
					let next = result[nextIndex];
					let concat;
					if (prev && next) {
						concat = new PPToken(prev.range(), prev.type(), prev.value() + next.value());
					} else if (prev) {
						concat = prev;
					} else if (next) {
						concat = next;
					}
					result.splice(prevIndex, nextIndex - prevIndex + 1, concat);
					i = prevIndex;
				}
			}

			for (let i = 0; i < result.length; i++) {
				if (!result[i]) {
					result.splice(i, 1);
					i--;
				}
			}

			tokens.unshift(...result);

			// let debugAfterExpansion = '';
			// for (let t of output) {
			// 	debugAfterExpansion += t.value();
			// }
			// for (let t of tokens) {
			// 	debugAfterExpansion += t.value();
			// }

			// console.log('Before Expansion:');
			// console.log(debugBeforeExpansion);
			// console.log('After  Expansion:');
			// console.log(debugAfterExpansion);
		}

		return output;
	}

	_processMacroFinsihArgList() {
		let i, tok;
		for (i = this._output.length - 2; i >= 0; i--) {
			tok = this._output[i];
			if (tok.type() === 'macro') {
				break;
			}
		}
		if (i < 0) {
			throw new Error('Internal Error');
		}
		let args = this._output.splice(i, this._output.length - i + 1);
		args[0] = args[0].cause();

		this._input.unshift(...this._macroExpand(args));
	}

	processTextLine() {
		while (true) {
			let token = this._input.shift();
			if (token.type() === 'linebreak') {
				this._output.push(token);
				break;
			}
			if (token.type() === 'whitespace') {
				this._output.push(token);
				continue;
			}
			if (this._waitlparen) {
				if (token.type() !== '(') {
					this._waitlparen = false;
					this._processMacroNoArgList();
				} else {
					// Start macro replacement
					this._waitlparen = false;
					this._paren++;
					this._output.push(token);
					continue;
				}
			}
			if (this._paren !== 0) {
				if (token.type() === '(') {
					this._paren++;
					this._output.push(token);
				} else if (token.type() === ')') {
					this._paren--;
					this._output.push(token);
					if (this._paren === 0) {
						this._processMacroFinsihArgList();
					}
				} else {
					this._output.push(token);
				}
				continue;
			}
			if (token.type() === 'identifier' && token.value() in this._macros) {
				this._processMacro(token);
			} else {
				this._output.push(token);
			}
		}
	}

	_processDirective(directive) {
		// Empty directive is allowed
		if (directive.type() === 'linebreak') {
			return;
		}

		switch (directive.value()) {
			case 'if':
				this._processIfDirective();
				break;
			case 'ifdef':
				this._processIfdefDirective();
				break;
			case 'ifndef':
				this._processIfndefDirective();
				break;
			case 'elif':
			case 'else':
			case 'endif':
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '#' + directive.value() + ' without #if', directive.range()));
				this._skipLine();
				break;
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

			this._processDirective(directive);
			return true;
		}
	}

	static process(context, pptokens) {
		let preprocessor = new Preprocessor(context, pptokens);
		while (preprocessor.processLine());
		return preprocessor._output;
	}

}
