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

import Token from '../ast/Token.js';
import DiagnosticMessage from '../diagnostics/DiagnosticMessage.js';

const identifiers = {
	auto: true,
	break: true,
	case: true,
	char: true,
	const: true,
	continue: true,
	default: true,
	do: true,
	double: true,
	else: true,
	enum: true,
	extern: true,
	float: true,
	for: true,
	goto: true,
	if: true,
	inline: true,
	int: true,
	long: true,
	register: true,
	restrict: true,
	return: true,
	short: true,
	signed: true,
	sizeof: true,
	static: true,
	struct: true,
	switch: true,
	typedef: true,
	union: true,
	unsigned: true,
	void: true,
	volatile: true,
	while: true,
	_Alignas: true,
	_Alignof: true,
	_Atomic: true,
	_Bool: true,
	_Complex: true,
	_Generic: true,
	_Imaginary: true,
	_Noreturn: true,
	_Static_assert: true,
	_Thread_local: true
};

export default class Tokenizer {

	static isCharCodeAllowed(code) {
		// Group 1
		if (code < 0x100) {
			if (code === 0xA8 || code === 0xAA || code === 0xAD || code === 0xAF)
				return true;
			if (code >= 0xB2 && code !== 0xB6 && code != 0xBB && code !== 0xBF && code !== 0xD7 && code !== 0xF7)
				return true;
			return false;
		}
		// Group 2
		if (code < 0x2000) {
			if (code <= 0x167F || code >= 0x1681 && code <= 0x180D || code >= 0x180F)
				return true;
			return false;
		}
		// Group 3 & 4
		if (code < 0x3000) {
			if (code >= 0x200B && code <= 0x200D || code >= 0x202A && code <= 0x202E || code === 0x203F || code === 0x2040 || code === 0x2054 || code >= 0x2060 && code <= 0x206F)
				return true;
			if (code >= 0x2070 && code <= 0x218F || code >= 0x2460 && code <= 0x24FF || code >= 0x2776 && code <= 0x2793 || code >= 0x2C00 && code <= 0x2DFF || code >= 0x2E80)
				return true;
			return false;
		}
		// Group 5 & 6
		if (code < 0xD800) {
			if (code >= 0x3004 && code <= 0x3007 || code >= 0x3021 && code <= 0x302F || code >= 0x3031 && code <= 0x303F)
				return true;
			if (code >= 0x3040)
				return true;
			return false;
		}
		// Group 7
		if (code < 0x10000) {
			if (code >= 0xF900 && code <= 0xFD3D || code >= 0xFD40 && code <= 0xFDCF || code >= 0xFDF0 && code <= 0xFE44 || code >= 0xF4e7 && code <= 0xFFFD)
				return true;
			return false;
		}
		// Group 8
		if (code < 0xF0000 && (code & 0x10000) <= 0xFFFD)
			return true;
		return false;
	}

	static isCharCodeDisallowedInitially(code) {
		if (code >= 0x300 && code <= 0x36F || code >= 0x1DC0 && code <= 0x1DFF || code >= 0x20D0 && code <= 0x20FF || code >= 0xFE20 && code <= 0xFE2F)
			return true;
		return false;
	}

	static convert(context, pptoken) {
		switch (pptoken.type()) {
			case 'whitespace':
			case 'linebreak':
				return null;
			case 'identifier':
				{
					let val = pptoken.value();
					if (identifiers.hasOwnProperty(val)) {
						return new Token(pptoken.range(), val);
					}
					for (let i = 0; i < val.length - 5; i++) {
						if (val[i] === '\\') {
							let replace;
							let replaceLength = val[i + 1] === 'u' ? 6 : 10;
							let code = parseInt(val.substring(i + 2, i + replaceLength), 16);
							if (!Tokenizer.isCharCodeAllowed(code)) {
								let r = pptoken.range();
								context.emitDiagnostics(
									new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'universal character name outside allowed range in identifiers',
										r.source().range(r.start() + i, r.start() + i + replaceLength)));
								replace = '';
							} else if (i === 0 && Tokenizer.isCharCodeDisallowedInitially(code)) {
								let r = pptoken.range();
								context.emitDiagnostics(
									new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'universal character name outside allowed range as initial character of an identifier',
										r.source().range(r.start() + i, r.start() + i + replaceLength)));
								replace = '';
							} else {
								replace = String.fromCodePoint(code);
							}
							val = val.substring(0, i) + replace + val.substring(i + replaceLength);
							i += replace.length - 1;
						}
					}
					return new Token(pptoken.range(), 'identifier', val);
				}
			case 'number':
			case 'string':
			case 'character':
				// TODO
				return pptoken;
			case 'unknown':
				context.emitDiagnostics(
					new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'unrecognized character in source',
						pptoken.range()));
				return null;
			case 'header':
				throw new Error('Internal Error: Header names not expected');
			default:
				// Punctuators, we can now safely discard its value
				return new Token(pptoken.range(), pptoken.type());
		}
	}
}