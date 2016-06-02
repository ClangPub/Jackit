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

import IndexMap from '../source/IndexMap.js';
import TransformedSource from '../source/TransformedSource.js';
import DiagnosticMessage from '../diagnostics/DiagnosticMessage.js';

export default class CommentParser {

	static process(context, source) {
		let content = source.content();

		if (content === '') {
			return source;
		}

		// No lazy IndexMap creation is performed here
		// As comments are extremely common
		let startIndex = 0;
		let builder = '';
		let mapping = new IndexMap();

		for (let i = 0; i < content.length - 1; i++) {
			// Do not parse comments within string
			if (content[i] === '"' || content[i] === '\'') {
				const ch = content[i];
				for (i++; i < content.length; i++) {
					if (content[i] === ch) {
						break;
					}
					if (content[i] === '\\') {
						// skip next char
						i++;
					}
				}
				continue;
			}

			// Line comments
			if (content[i] === '/' && content[i + 1] === '/') {
				builder += content.substring(startIndex, i);
				mapping.addMapping(builder.length, i);
				for (i += 2; i < content.length; i++) {
					if (content[i] === '\n') {
						break;
					}
				}
				builder += ' ';
				startIndex = i;
				mapping.addMapping(builder.length, startIndex);
				continue;
			}

			// Block comments
			if (content[i] === '/' && content[i + 1] === '*') {
				builder += content.substring(startIndex, i);
				mapping.addMapping(builder.length, i);
				let startOfComment = i;

				for (i += 2; i < content.length - 1; i++) {
					if (content[i] === '/' && content[i + 1] === '*') {
						// emit a warning for nested comment
						context.emitDiagnostics(
							new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, '\'/*\' within block comment',
								source.range(i, i + 2)));
					}

					if (content[i] === '*' && content[i + 1] === '/') {
						break;
					}
				}
				// EOF encountered
				if (content[i] !== '*' || content[i + 1] !== '/') {
					context.emitDiagnostics(
						new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'unterminated /* comment',
							source.range(startOfComment, startOfComment + 2)));
					// Error-recovery, after i-- and i += 2, i will points to EOF
					i--;
				}
				builder += ' ';
				startIndex = i += 2;
				mapping.addMapping(builder.length, startIndex);

				// Counter i++ in next iteration
				i--;
				continue;
			}
		}

		builder += content.substring(startIndex);
		return new TransformedSource(source, builder, mapping);
	}

}