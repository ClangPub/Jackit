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
import Context from '../context/Context.js';
import PPTokenizer from './PPTokenizer.js';

function repListIsIdentical(lhs, rhs) {
	if (lhs.length !== rhs.length)
		return false;

	for (let i = 0, len = lhs.length; i < len; ++i) {
		let ltok = lhs[i];
		let rtok = rhs[i];

		if (ltok.type() === 'whitespace') {
			if (rtok.type() !== 'whitespace')
				return false;
		} else {
			if (rtok.value() !== ltok.value())
				return false;
		}
	}

	return true;
}

function escapeString(string) {
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

function insertBackSlash(tok) {
	if (tok.type() === 'character' || tok.type() === 'string') {
		let result = '';

		for (let ch of tok.value()) {
			switch (ch) {
				case '"':
					result += '\\"';
					break;
				/// IMPLDEF insert a backslash before a backslash which
				/// starts a universal character name or not; the choice is true
				case '\\':
					result += '\\\\';
					break;
				default:
					result += ch;
			}
		}

		return result;
	} else {
		return tok.value();
	}
}

function makeHashString(arg) {
	let deleteWS = [];

	for (let tok of arg) {
		if (tok.isWhitespace()) {
			if (deleteWS.length !== 0 && !deleteWS[deleteWS.length - 1].isWhitespace()) {
				deleteWS.push(tok);
			}
		} else {
			deleteWS.push(tok);
		}
	}

	while (deleteWS.length !== 0 && deleteWS[deleteWS.length - 1].isWhitespace()) {
		deleteWS.pop();
	}

	return '"' + deleteWS.map(tok => tok.isWhitespace() ? ' ' : insertBackSlash(tok)).join('') + '"';
}

function countOfPPTok(pptokens) {
	let result = 0;

	for (let tok of pptokens) {
		if (!tok.isWhitespace()) {
			++result;
		}
	}

	return result;
}

function makePPToken(value, nameToken, expansion) {
	let pseudoCtx = new Context();
	let pseudoSrc = new Source('', value);

	let pptokens = PPTokenizer.tokenize(pseudoCtx, pseudoSrc);

	// the pptokens contains the additional linebreak and the EOF so that length is 3
	if (pseudoCtx.diagnostics().length !== 0 || pptokens.length !== 3)
		return null;
	else
		return new MacroReplacedPPToken(pptokens[0], nameToken, expansion);
}

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
	}

	_consumeLine() {
		let line = [];
		while (this._input[0].type() !== 'linebreak') {
			line.push(this._input.shift());
		}
		line.push(this._input.shift());
		return line;
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
		// Parse rest of line
		let tokens = this._macroExpand(this._consumeLine());
		let linebreak = tokens[tokens.length - 1];
		let lineNumPos = this._firstEffectiveElement(tokens);
		if (lineNumPos === -1) {
			this._context.emitDiagnostics(
				new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '#line directive requires a positive integer argument', linebreak.range()));
			return;
		}

		let line = tokens[lineNumPos];
		if (line.type() !== 'number') {
			this._context.emitDiagnostics(
				new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '#line directive requires a positive integer argument', line.range()));
			return;
		} else if (!/^[0-9]+$/.test(line.value())) {
			this._context.emitDiagnostics(
				new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'line number must only consist of digits', line.range()));
			return;
		}

		// TODO Proper parse of digital sequence and file name
		let lineNum = line.value();

		let filePos = this._firstEffectiveElement(tokens, lineNumPos + 1);
		let fileName;
		if (filePos === -1) {
			fileName = this._source.filename();
		} else {
			let file = tokens[filePos];
			if (file.type() !== 'string') {
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'invalid filename for #line directive', file.range()));
				return;
			} else if (!file.value().startsWith('"') || !file.value().endsWith('"')) {
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'filename must be a character string literal (without encoding prefix)', file.range())
				);
			}
			fileName = file.value();
			fileName = fileName.substring(1, fileName.length - 1);
		}

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

		if (name.type() !== 'identifier')
			if (name.type() === 'linebreak')
				return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'macro name missing', name.range());
			else
				return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'macro name must be identifier', name.range());

		if (name.value() === '__VA_ARGS__')
			return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '__VA_ARGS__ cannot be used as a macro name', name.range());

		let isFunc;

		let parameters = [];
		let paramListTok = [];
		let isvar = false;
		let rparen;

		if (this._input[0].type() === '(') {
			// Function-like
			isFunc = true;

			this._consume();

			parseParam: while (true) {
				let nextTok = this._peekTokenNoWS();

				switch (nextTok.type()) {
				case 'identifier':
				case ',':
				case '...':
					// valid pp-token, analyse later
					break;
				case ')':
					rparen = this._consume();
					break parseParam;
				case 'linebreak':
					return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'missing ) in function-like macro parameter list', nextTok.range());
				default:
					return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'invalid token in macro parameter list', nextTok.range());
				}

				paramListTok.push(this._consume());
			}

			let prevIsComma = true;

			// Analyse the parameter list
			while (paramListTok.length !== 0) {
				let currTok = paramListTok[0];

				switch (currTok.type()) {
				case '...':
					if (prevIsComma) {
						if (paramListTok.length !== 1) {
							return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the ... notation must appear at the end of parameter list', currTok.range());
						} else {
							isvar = true;
						}
					} else {
						return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'no comma before ellipsis', currTok.range());
					}
					break;
				case ',':
					if (prevIsComma) {
						return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'parameter name missing', currTok.range());
					} else {
						prevIsComma = true;
					}
					break;
				case 'identifier':
					if (prevIsComma) {
						if (currTok.value() === '__VA_ARGS__')
							return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '__VA_ARGS__ cannot be used as a macro parameter', currTok.range());

						for (let param of parameters) {
							if (param.value() === currTok.value()) {
								return [
									new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'parameter must be unique in a function-like macro', currTok.range()),
									new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous is here', param.range())
								];
							}
						}


						parameters.push(currTok);
						prevIsComma = false;
					} else {
						return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'no comma between parameters', currTok.range());
					}
					break;
				}

				paramListTok.shift();
			}
		} else {
			// Object-like
			isFunc = false;

			if (!this._input[0].isWhitespace()) {
				return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'there shall be white space between identifier and replacement list of an object-like macro', this._input[0].range());
			}
		}

		this._dropWS();

		// Get the replacement list
		let repList = [];

		while (this._input[0].type() !== 'linebreak') {
			if (this._input[0].type() === 'identifier' && this._input[0].value() === '__VA_ARGS__') {
				if (!isFunc) {
					return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '__VA_ARGS__ cannot appear in the replacement list of object-like macro', this._input[0].range());
				} else if (!isvar) {
					return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, '__VA_ARGS__ cannot appear in the replacement list of function-like macro without ellipsis notation', this._input[0].range());
				}
			}


			repList.push(this._consume());
		}

		// Trim trailing whitespace
		while (repList.length && repList[repList.length - 1].type() === 'whitespace') {
			repList.pop();
		}

		// Check if the replacement list is valid
		for (let i = 0, len = repList.length; i < len; ++i) {
			let currTok = repList[i];

			// __VA_ARGS__ has been processed
			if (currTok.value() === '#') {
				if (isFunc) {
					let j = i + 1;

					while (repList[j] && repList[j].isWhitespace())
						++j;

					let nextTok = repList[j];

					if (nextTok === undefined)
						return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the # operator cannot appear at the end of replacement list', currTok.range());

					let isParam = this._paramIndex(parameters.map(p => p.value()), isvar, nextTok.value()) !== -1;

					if (!isParam)
						return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the # operator shall be followed by a parameter', currTok.range());
				}
			} else if (currTok.value() === '##') {
				if (i === 0)
					return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the ## operator cannot appear at the beginning of replacement list', currTok.range());

				if (i === len - 1)
					return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the ## operator cannot appear at the end of replacement list', currTok.range());
			}
		}

		// Check if the macro is valid
		if (name.value() in this._macros) {
			let prev = this._macros[name.value()];

			if (prev === null)
				return new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, `try to redefine built-in macro ${name.value()}`, name.range());

			if (prev.isFunc !== isFunc)
				return [
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, `macro ${name.value()} was defined both object-like and function-like`, name.range()),
					new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous definition is here', prev.nameToken().range())
				];

			if (isFunc) {
				if (parameters.length !== prev.countOfParam())
					return [
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, `macro ${name.value()} has different number of parameters with previous definition`, name.range()),
						new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous definition is here', prev.nameToken().range())
					];

				for (let i = 0, len = parameters.length; i < len; ++i) {
					if (parameters[i].value() !== prev.parameter()[i])
						return [
							new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'parameter name mismatch', parameters[i].range()),
							new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous definition is here', prev.nameToken().range())
						];
				}

				if (isvar !== prev.isvariadic())
					return [
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, `the variability of macro ${name.value()} conflicts with previous definition`, name.range()),
						new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous definition is here', prev.nameToken().range())
					];

				if (!repListIsIdentical(repList, prev.repList))
					return [
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, `the replacement list of macro ${name.value()} is not identical to that of previous`, name.range()),
						new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous definition is here', prev.nameToken().range())
					];
			} else {
				if (!repListIsIdentical(repList, prev.repList))
					return [
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, `the replacement list of macro ${name.value()} is not identical to that of previous`, name.range()),
						new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'previous definition is here', prev.nameToken().range())
					];
			}
		}

		if (isFunc) {
			this._macros[name.value()] = {
				isFunc: true,
				context: this._context,
				nameToken: name,
				repList,
				param: parameters.map(tok => tok.value()),
				isvar
			};
		} else {
			this._macros[name.value()] = {
				isFunc: false,
				context: this._context,
				nameToken: name,
				repList: this._processHashHash(repList),
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
				this._readTokenNoWS(); // #
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
				this._readTokenNoWS();
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
					/* falls through */
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

	_firstEffectiveElement(tokens, index = 0) {
		while (index < tokens.length && (tokens[index].type() === 'whitespace' || tokens[index].type() === 'linebreak')) {
			index++;
		}
		return index === tokens.length ? -1 : index;
	}

	_rangeConcat(a, b) {
		if (a.source() !== b.source()) {
			throw new Error('Internal Error');
		}
		return a.source().range(Math.min(a.start(), b.start()), a.caret(), Math.max(a.end(), b.end()));
	}

	_initialCause(pptoken) {
		let cause = pptoken;
		while (cause instanceof MacroReplacedPPToken) {
			cause = cause.expansion().macroTok;
		}
		return cause;
	}

	_paramIndex(param, isvar, name) {
		if (name === '__VA_ARGS__')
			return isvar ? param.length : -1;
		else
			return param.indexOf(name);
	}

	_processHash(macro, tokens, expansion) {
		let result = [];

		for (let i = 0, len = tokens.length; i < len; ++i) {
			let currTok = tokens[i];

			if (currTok.value() === '#') {
				++i;

				while (tokens[i] !== undefined && tokens[i].isWhitespace())
					++i;

				let index = this._paramIndex(macro.param, macro.isvar, tokens[i].value());

				result.push(new PPToken(
					currTok.range().source().range(currTok.range().start(), tokens[i].range().end()),
					'string', makeHashString(expansion.args[index])
				));
			} else {
				result.push(currTok);
			}
		}

		return result;
	}

	// UNSPECIFIED the evaluation order of ##; the choice is left-to-right
	_processHashHash(macro, tokens, expansion) {
		let result = [];

		for (let i = 0, len = tokens.length; i < len; ++i) {
			let currTok = tokens[i];

			if (currTok.value() === '##') {
				let prev;

				do
					prev = result.pop();
				while (prev.isWhitespace());

				let next;

				do
					next = tokens[++i];
				while (next.isWhitespace());

				if (prev.type() === 'placemarker') {
					result.push(next);
				} else {
					if (next.type() === 'placemarker') {
						result.push(prev);
					} else {
						let token = makePPToken(prev.value() + next.value(), macro.nameToken, expansion);

						if (token === null) {
							this._context.emitDiagnostics(
								new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, `operator ## result in a invalid pp-token ${prev.value() + next.value()}`, currTok.range()),
								new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'in expansion: ', expansion.macroTok.range().source().range(expansion.macroTok.range().start(), expansion.rparen.range().end()))
							);
						} else {
							result.push(token);
						}
					}
				}
			} else {
				result.push(currTok);
			}
		}

		return result;
	}

	_addReplaceMark(tokens, macro, expansion) {
		return tokens.map(tok => new MacroReplacedPPToken(tok, macro.nameTok, expansion));
	}

	_adjustArg(macro, expansion, commas) {
		if (macro.isvar) {
			if (expansion.args.length <= macro.param.length) {
				throw [
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the number pf arguments shall more than the number of parameters in a function-like macro with ellipsis notation', expansion.rparen.range()),
					new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'macro definition is here', macro.nameToken.range()),
				];
			} else {
				let length = macro.param.length;
				let args   = expansion.args;

				let restArg = args.slice(length);
				let restComma = commas.slice(length);

				let varArg = [];

				for (let arg of restArg) {
					varArg.push(...arg);

					if (restComma.length !== 0)
						varArg.push(restComma.shift());
				}

				return args.slice(0, length).concat([varArg]);
			}
		} else {
			if (expansion.args.length !== macro.param.length)
				throw [
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the number pf arguments shall equal to the number of parameters in a function-like macro with ellipsis notation', expansion.rparen.range()),
					new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'macro definition is here', macro.nameToken.range()),
				];
			else
				return expansion.args;
		}
	}

	_funcReplace(macro, expansion) {
		let replaced = [];
		let prevHash = '';

		for (let i = 0, len = macro.repList.length; i < len; ++i) {
			let currTok = macro.repList[i];
			let index = this._paramIndex(macro.param, macro.isvar, currTok.value());

			if (currTok.type() === 'identifier' && index !== -1) {
				if (prevHash === '#') {
					replaced.push(currTok);
				} else if (prevHash === '##') {
					if (countOfPPTok(expansion.args[index]) === 0) {
						replaced.push(new PPToken(currTok.range(), 'placemarker', ''));
					} else {
						replaced.push(...expansion.args[index]);
					}
				} else {
					let j = i + 1;

					while (macro.repList[j] !== undefined && macro.repList[j].isWhitespace())
						++j;

					let next = macro.repList[j];

					if (next !== undefined && next.value() === '##') {
						if (countOfPPTok(expansion.args[index]) === 0) {
							replaced.push(new PPToken(currTok.range(), 'placemarker', ''));
						} else {
							replaced.push(...expansion.args[index]);
						}
					} else {
						replaced.push(...this._macroExpand(expansion.args[index], false));
					}
				}
			} else {
				// non-parameter

				if (currTok.value() === '#' || currTok.value() === '##') {
					prevHash = currTok.value();
				} else if (!currTok.isWhitespace()) {
					prevHash = '';
				}

				replaced.push(currTok);
			}
		}

		// UNSPECIFIED the order of evaluation of # and ##; the choice is # first
		return this._addReplaceMark(
			this._processHashHash(
				macro, this._processHash(macro, replaced, expansion).filter(tok => tok.type() !== 'placemarker'), expansion
			), macro, expansion
		);
	}

	_macroExpand(tokens, isFromInput) {
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
						new PPToken(macroNameToken.range(), 'string', escapeString(this._initialCause(macroNameToken).range().source().filename())),
						null, macroNameToken));
				continue;
			} else if (macroName === '__LINE__') {
				let range = this._initialCause(macroNameToken).range().resolve();
				tokens.unshift(
					new MacroReplacedPPToken(
						new PPToken(macroNameToken.range(), 'number',
							range.source().linemap().getLineNumber(range.start()) + 1 + ''), null, macroNameToken));
				continue;
			}

			// Check eligibility to replace
			let cause = macroNameToken;

			while (cause instanceof MacroReplacedPPToken) {
				cause = cause.expansion().macroTok;
				if (cause.value() === macroName) {
					output.push(macroNameToken);
					continue loop;
				}
			}

			let macro = this._macros[macroName];

			if (!macro.isFunc) {
				tokens.unshift(this._addReplaceMark(macroNameToken));
				continue;
			}

			// Check if the macro is actually invoked
			let lparenPos = -1;

			for (let i = 0; i < tokens.length; i++) {
				let t = tokens[i];
				if (t.type() === '(') {
					lparenPos = i;
					break;
				} else if (!t.isWhitespace()) {
					break;
				}
			}

			if (lparenPos === -1) {
				output.push(macroNameToken);
				continue;
			}

			let lparen = tokens[lparenPos];

			// Drop left parenthesis
			tokens.splice(0, lparenPos + 1);

			let argList = [];
			let commas = [];
			let rparen;
			let temp = [];

			let parens = 0;

			while (true) {
				let currTok = tokens.shift();

				if (currTok === undefined && isFromInput)
					currTok = this._input.shift();

				// Assuming next won't be undefined or null
				if (currTok.type() === 'eof') {
					// EOF only can be read from this._input
					this._input.unshift(currTok);

					let lastTok;

					if (argList.length === 0) {
						lastTok = lparen;
					} else {
						let lastArg = argList[argList.length - 1];
						lastTok = lastArg[lastArg.length - 1];
					}

					throw [
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'missing right parenthesis of macro invocation', lastTok.range()),
						new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'invocation starts here:', macroNameToken.range())
					];
				}

				if (currTok.value() === '(') {
					++parens;
					temp.push(currTok);
				} else if (currTok.value() === ')') {
					if (parens === 0) {
						argList.push(temp);
						rparen = currTok;
						break;
					} else {
						--parens;
						temp.push(currTok);
					}
				} else if (currTok.value() === ',') {
					if (parens === 0) {
						argList.push(temp);
						commas.push(currTok);
						temp = [];
					} else {
						temp.push(currTok);
					}
				} else {
					temp.push(currTok);
				}
			}

			let expansion = {
				macroTok: macroNameToken,
				lparen,
				args: argList,
				rparen
			};

			// TODO Check preprocessing directive appear in argument list

			let adjustedArg = this._adjustArg(macro, expansion, commas);

			let result = this._funcReplace(macro, {
				macroTok: macroNameToken,
				lparen,
				args: adjustedArg,
				rparen
			});

			tokens.unshift(...result);
		}

		return output;
	}

	processTextLine() {
		let pptokens = [];

		while (this._input[0].type() !== 'linebreak') {
			pptokens.push(this._input.shift());
		}

		try {
			this._output = this._output.concat(this._macroExpand(pptokens, true));
		} catch (ex) {
			if (ex instanceof DiagnosticMessage || ex instanceof Array) {
				this._context.emitDiagnostics(ex);
			} else {
				throw ex;
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
				let diag = this._processDefineDirective();

				if (diag) {
					this._context.emitDiagnostics(diag);
				}

				this._skipLine();
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
			while (this._input[0] && this._input[0].type() !== 'linebreak' && this._input[0].type() !== 'eof')
				this.processTextLine();

			if (this._input[0].type() === 'linebreak')
				this._output.push(this._input.shift());

			return true;
		} else {
			// read the #
			this._readTokenNoWS();

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
