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

import PPToken from '../ast/PPToken.js';
import DiagnosticMessage from '../diagnostics/DiagnosticMessage.js';

export default class PPTokenizer {

	constructor(context, source) {
		this._context = context;
		this._source = source;
		this._index = 0;
		this._begin = 0;

		/*
		 * This helps to distinguish <header> and <, pp-tokens, and >
		 * 0 - Not in include directive line
		 * 1 - A new line
		 * 2 - A line starts with #
		 * 3 - A line starts with #include
		 */
		this._includeStage = 1;
	}

	_parseHexDigit() {
		let c = this._source.at(this._index++);
		if (c >= '0' && c <= '9')
			return true;
		if (c >= 'a' && c <= 'z')
			return true;
		if (c >= 'Z' && c <= 'Z')
			return true;
		--this._index;
		return false;
	}

	_parseUniversalCharacterName() {
		let start = this._index;
		if (this._source.at(this._index++) != '\\') {
			this._index = start;
			return false;
		}
		let c = this._source.at(this._index++);
		if (c == 'u') {
			if (this._parseHexDigit() && this._parseHexDigit() && this._parseHexDigit() && this._parseHexDigit()) {
				return true;
			} else {
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'incomplete universal character name; treating as \'\\\' followed by identifier',
						this._source.range(start, this._index)));
				this._index = start;
				return false;
			}
		} else if (c == 'U') {
			if (this._parseHexDigit() && this._parseHexDigit() && this._parseHexDigit() && this._parseHexDigit() && this._parseHexDigit() && this._parseHexDigit() && this._parseHexDigit() && this._parseHexDigit()) {
				this._index = start;
				return true;
			} else {
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'incomplete universal character name; treating as \'\\\' followed by identifier',
						this._source.range(start, this._index)));
				if (this._index - start === 6) {
					this._context.emitDiagnostics(
						new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'did you mean to use \'\\u\'?',
							this._source.range(start + 1)));
				}
				this._index = start;
				return false;
			}
		} else {
			this._index = start;
			return false;
		}
	}

	_start() {
		this._begin = this._index;
	}

	_buildToken(type) {
		this._includeStage = 0;
		return new PPToken(this._source.range(this._begin, this._index), type, this._source.substring(this._begin, this._index));
	}

	_buildTokenOnly(type) {
		return new PPToken(this._source.range(this._begin, this._index), type, this._source.substring(this._begin, this._index));
	}

	_parseNumber() {
		this._start();
		let c = this._source.at(this._index);
		if (!PPTokenizer.isDigit(c)) {
			if (c == '.' && PPTokenizer.isDigit(this._source.at(this._index + 1))) {
				this._index++;
			} else {
				throw new Error('Unexpected state');
			}
		}
		while (true) {
			c = this._source.at(++this._index);
			if (!(c == '.' || c == '\\' && this._parseUniversalCharacterName() || PPTokenizer.isIdentiferPart(c))) {
				if (c == '+' || c == '-') {
					let prev = this._source.at(this._index - 1);
					if (prev == 'e' || prev == 'E' || prev == 'p' || prev == 'P') {
						continue;
					}
				}
				break;
			}
		}
		return this._buildToken('number');
	}

	_parseHeaderName(term) {
		while (true) {
			let c = this._source.at(this._index++);
			if (c === term) {
				return true;
			} else if (c === '\n' || c === '') {
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'missing terminating ' + term + ' character',
						this._source.range(this._begin, this._index - 1, this._index)));

				// Error recovery, unread the line terminating character
				// Further correction of returned token is done in next()
				--this._index;
				return true;
			}
		}
	}

	_parseString(term) {
		while (true) {
			let c = this._source.at(this._index++);
			if (c === term) {
				return true;
			} else if (c == '\\') {
				let c2 = this._source.at(this._index++);
				if (c2 === '\n') {
					this._context.emitDiagnostics(
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'missing terminating ' + term + ' character',
							this._source.range(this._begin, this._index - 1, this._index)));

					// Error recovery
					--this.index;
					return true;
				}
			} else if (c === '\n' || c === '') {
				this._context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'missing terminating ' + term + ' character',
						this._source.range(this._begin, this._index - 1, this._index)));

				// Error recovery
				--this._index;
				return true;
			}
		}
	}

	_errorRecovery(token) {
		switch (token.type()) {
			case 'string':
			case 'character':
				{
					const term = token.type() === 'string' ? '"' : '\'';
					let val = token.value();
					// Unexpected termination, start error recovery
					if (val[val.length - 1] !== term) {
						// Special error recovery case for escape sequence
						let escapeCount = 0;
						for (let i = val.length - 1; i > 0; i--, escapeCount++) {
							if (val[i] !== '\\') {
								break;
							}
						}
						if (escapeCount % 2 === 1) {
							val += '\\';
						}
						val += term;
						token._value = val;
					}
					return token;
				}
			default:
				return token;
		}
	}

	_checkHeaderName(token) {
		let value = token.value();
		value = value.substring(1, value.length - 1);
		let match = /['\\"]|\/[\/*]/.exec(value);
		if (match) {
			let index = token.range().start() + match.index + 1;
			this._context.emitDiagnostics(
				new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'invalid sequence in header names',
					this._source.range(index, index + match[0].length)));
		}
	}

	_parseIdentifier() {
		let c = this._source.at(this._index);
		if (c == '\\' && this._parseUniversalCharacterName()) {
			// Cursor is already moved to next character,
			// but we will increase it further in the loop
			// so decrement is needed here
			--this._index;
		} else if (!PPTokenizer.isIdentiferStart(c)) {
			return false;
		}
		while (true) {
			c = this._source.at(++this._index);
			if (!(c === '\\' && this._parseUniversalCharacterName() || PPTokenizer.isIdentiferPart(c))) {
				return true;
			}
		}
	}

	/*
	 * Process all continuous whitespace (exclude line break) and return a
	 * single whitespace token
	 * Note that whitespace is not really a pp-token in
	 * C standard, but we keep it for convenience.
	 */
	_parseWhitespace() {
		let start = this._index;
		let builder = '';
		loop: while (true) {
			let c = this._source.at(this._index++);
			switch (c) {
				case ' ':
				case '\t':
				case '\v':
				case '\f':
					/*
					 * According to standard, we need space, horizontal tab,
					 * vertical tab and form feed
					 */
					builder += c;
					break;
				case '/':
					{
						c = this._source.at(this._index);
						if (c == '/') {
							/* Line comment */
							while (true) {
								c = this._source.at(++this._index);
								if (c == '\n' || c == '') {
									builder += ' ';
									break loop;
								}
							}
						} else if (c == '*') {
							/* Block comment */
							let startOfComment = this._index - 1;
							++this._index;
							while (true) {
								c = this._source.at(this._index++);
								if (c === '') {
									this._context.emitDiagnostics(
										new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'unterminated /* comment',
											this._source.range(startOfComment, startOfComment + 2)));
									// Remove back cursor, so next read is the same EOF
									// Basic error recovery, treat as if it is terminated
									--this._index;
									builder += ' ';
									break;
								} else if (c == '*') {
									if (this._source.at(this._index) == '/') {
										++this._index;
										builder += ' ';
										break;
									} else if (this._source.at(this._index - 2) == '/') {
										// Nested comment, emit a warning

										this._context.emitDiagnostics(
											new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, '\'/*\' within block comment',
												this._source.range(this._index - 2, this._index)));
									}
								}
							}
							break;
						} else {
							// Just division
							--this._index;
							break loop;
						}
					}
				default:
					this._index--;
					break loop;
			}
		}
		return new PPToken(this._source.range(start, this._index), 'whitespace', builder);
	}

	next() {
		this._start();
		let start = this._index;
		let src = this._source;
		let c = src.at(this._index++);
		switch (c) {
			case '':
				/* End of file */
				--this._index;
				return this._buildToken('eof');
			case ' ':
			case '\t':
			case '\v':
			case '\f':
				/* Whitespace are dealt specially in processWhitespace */
				--this._index;
				return this._parseWhitespace();
			case '\n':
				/* See how includeStage works in javadoc of includeStage */
				this._includeStage = 1;
				// Manually build token to avoid clearing the stage flag (we've just set it!)
				return this._buildTokenOnly('linebreak');
			case '.':
				if (PPTokenizer.isDigit(src.at(this._index))) {
					/* .digit starts number */
					--this._index;
					return this._parseNumber();
				} else {
					if (src.at(this._index) === '.' && src.at(this._index + 1) === '.') {
						this._index += 2;
						return this._buildToken('...');
					} else {
						return this._buildToken('.');
					}
				}
			case '[':
			case ']':
			case '(':
			case ')':
			case '{':
			case '}':
			case '?':
			case ';':
			case ',':
				return this._buildToken(c);
			case '-':
				{
					c = src.at(this._index);
					if (c === '>' || c === '-' || c === '=') {
						++this._index;
						return this._buildToken('-' + c);
					}
					return this._buildToken('-');
				}
			case '+':
			case '&':
			case '|':
				{
					/* Operators like @, @=, @@ */
					let c2 = src.at(this._index);
					if (c === c2 || c2 === '=') {
						++this._index;
						return this._buildToken(c + c2);
					}
					return this._buildToken(c);
				}
			case '*':
			case '~':
			case '!':
			case '^':
			case '=':
				{
					/* Operators like @, @= */
					let c2 = src.at(this._index);
					if (c2 === '=') {
						++this._index;
						if ((c === '!' || c === '=') && src.at(this._index) === '=') {
							this._context.emitDiagnostics(
								new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'you wrote too much JavaScript',
									src.range(start, start + 2, start + 3)));
						}
						return this._buildToken(c + '=');
					}
					return this._buildToken(c);
				}
			case '/':
				/* Since / also starts comment, we specialize here */
				switch (src.at(this._index++)) {
					case '/':
					case '*':
						this._index -= 2;
						return this._parseWhitespace();
					case '=':
						return this._buildToken('/=');
					default:
						--this._index;
						return this._buildToken('/');
				}
			case '%':
				/*
				 * Deal with %:, %:%:, %> and common % and %=. The first three
				 * are stupid
				 */
				switch (src.at(this._index++)) {
					case ':':
						if (src.at(this._index) === '%' && src.at(this._index + 1) === ':') {
							this._index += 2;
							this._context.emitDiagnostics(
								new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'alternative spelling for ## is discouraged',
									src.range(start, start + 4)));
							return this._buildToken('##');
						}
						this._context.emitDiagnostics(
							new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'alternative spelling for # is discouraged',
								src.range(start, start + 2)));
						return this._buildToken('#');
					case '>':
						this._context.emitDiagnostics(
							new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'alternative spelling for } is discouraged',
								src.range(start, start + 2)));
						return this._buildToken('}');
					case '=':
						return this._buildToken('%=');
					default:
						--this._index;
						return this._buildToken('%');
				}
			case '<':
				{
					/*
					 * Despite commmon <, <=, <<, <<=, we have some stupid alias of
					 * other punctuator, which are <:, <%. We also need to notice
					 * that if < preceeds #include, it will be a header instead a
					 * punctuator
					 */
					if (this._includeStage == 3) {
						this._parseHeaderName('>');
						let token = this._buildToken('header');
						let value = token.value();
						if (value[value.length - 1] !== '>') {
							value += '>';
							token._value = value; // A tweak
						}
						this._checkHeaderName(token);
						return token;
					}
					switch (src.at(this._index++)) {
						case ':':
							this._context.emitDiagnostics(
								new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'alternative spelling for [ is discouraged',
									src.range(start, start + 2)));
							return this._buildToken('[');
						case '%':
							this._context.emitDiagnostics(
								new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'alternative spelling for { is discouraged',
									src.range(start, start + 2)));
							return this._buildToken('{');
						case '=':
							return this._buildToken('<=');
						case '<':
							if (src.at(this._index) === '=') {
								++this._index;
								return this._buildToken('<<=');
							} else {
								return this._buildToken('<<');
							}
						default:
							--this._index;
							return this._buildToken('<');
					}
				}
			case '>':
				{
					/* >, >=, >>, >>= */
					c = src.at(this._index);
					if (c === '=') {
						this._index++;
						return this._buildToken('>=');
					} else if (c === '>') {
						c = src.at(++this._index);
						if (c === '=') {
							this._index++;
							return this._buildToken('>>=');
						} else {
							if (c === '>') {
								if (src.at(this._index + 1) === '=') {
									this._context.emitDiagnostics(
										new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'there is no unsigned shift assignment operator',
											src.range(start, start + 3, start + 4)));
								} else {
									this._context.emitDiagnostics(
										new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'there is no unsigned shift operator',
											src.range(start, start + 2, start + 3)));
								}
							}
							return this._buildToken('>>');
						}
					}
					return this._buildToken('>');
				}
			case ':':
				/* : and :> */
				if (src.at(this._index) === '>') {
					++this._index;
					this._context.emitDiagnostics(
						new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'alternative spelling for ] is discouraged',
							src.range(start, start + 2)));
					return this._buildToken(']');
				}
				return this._buildToken(':');
			case '#':
				if (src.at(this._index) === '#') {
					/* Double ## */
					++this._index;
					return this._buildToken('##');
				} else {
					/*
					 * If includeStage=1 (first token in line), we are starting
					 * a directive
					 */
					if (this._includeStage === 1) {
						this._includeStage = 2;
						// Build and return token manually so the includeStage flag is not cleared
						return this._buildTokenOnly('#');
					} else {
						return this._buildToken('#');
					}
				}
			case '0':
			case '1':
			case '2':
			case '3':
			case '4':
			case '5':
			case '6':
			case '7':
			case '8':
			case '9':
				--this._index;
				return this._parseNumber();
			case '\'':
				this._parseString('\'');
				return this._errorRecovery(this._buildToken('character'));
			case '"':
				if (this._includeStage === 3) {
					this._parseHeaderName('"');
					let token = this._buildToken('header');
					let value = token.value();
					if (value[value.length - 1] !== '"') {
						value += '"';
						token._value = value; // A tweak
					}
					this._checkHeaderName(token);
					return token;
				}
				this._parseString('"');
				return this._errorRecovery(this._buildToken('string'));
			case 'u':
				/* u'c-char-seq' u"s-char-seq" u8"s-char-seq" */
				switch (src.at(this._index)) {
					case '\'':
						++this._index;
						this._parseString('\'');
						return this._errorRecovery(this._buildToken('character'));
					case '"':
						++this._index;
						this._parseString('"');
						return this._errorRecovery(this._buildToken('string'));
					case '8':
						if (src.at(this._index + 1) === '"') {
							this._index += 2;
							this._parseString('"');
							return this._errorRecovery(this._buildToken('string'));
						}
					default:
						break;
				}
			case 'U':
			case 'L':
				/* @'c-char-seq' @"s-char-seq", @=U or @=L */
				switch (src.at(this._index)) {
					case '\'':
						++this._index;
						this._parseString('\'');
						return this._errorRecovery(this._buildToken('character'));
					case '"':
						++this._index;
						this._parseString('"');
						return this._errorRecovery(this._buildToken('string'));
					default:
						break;
				}
		}
		--this._index;
		if (this._parseIdentifier()) {
			let token = this._buildTokenOnly('identifier');
			if (this._includeStage == 2) {
				/*
				 * if the line looks like #include, the next time we encounter <
				 * or ", we will parse it as header
				 */
				if (token.value() === 'include') {
					this._includeStage = 3;
				}
				return token;
			} else {
				this._includeStage = 0;
				return token;
			}
		}
		++this._index;
		return this._buildToken('unknown');
	}

	static isIdentiferStart(c) {
		if (c >= 'A' && c <= 'Z')
			return true;
		if (c >= 'a' && c <= 'z')
			return true;
		if (c === '_')
			return true;
		// if (c >= 0x80)
		// 	return true;
		return false;
	}

	static isIdentiferPart(c) {
		return PPTokenizer.isIdentiferStart(c) || (c >= '0' && c <= '9');
	}

	static isDigit(c) {
		return c >= '0' && c <= '9';
	}

	static tokenize(context, source) {
		let tokenizer = new PPTokenizer(context, source);
		let tokens = [];
		let token;
		do {
			token = tokenizer.next();
			tokens.push(token);
		} while (token.type() !== 'eof');
		return tokens;
	}

}
