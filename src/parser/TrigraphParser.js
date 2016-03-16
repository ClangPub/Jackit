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

const trigraphMap = {
	'=': '#',
	'(': '[',
	'/': '\\',
	')': ']',
	'\'': '^',
	'<': '{',
	'!': '|',
	'>': '}',
	'-': '~'
};

export default class TrigraphParser {

	static process(context, source) {
		let content = source.content();
		let startIndex = 0;
		let builder = '';
		let mapping = null;

		for (let i = 0; i < content.length - 2; i++) {
			if (content[i] === '?' && content[i + 1] === '?') {
				if (content[i + 2] in trigraphMap) {
					context.emitDiagnostics(new DiagnosticMessage(DiagnosticMessage.LEVEL_WARNING, 'Use of trigraph is discouraged', source.range(i, i + 2, i + 3)));
					
					if (!builder) {
						mapping = new IndexMap();
					}
					builder += content.substring(startIndex, i);
					builder += trigraphMap[content[i + 2]];
					i += 2;
					startIndex = i + 1;
					mapping.addMapping(builder.length, startIndex);
				}
			}
		}

		if (!builder) {
			return source;
		} else {
			builder += content.substring(startIndex);
			return new TransformedSource(source, builder, mapping);
		}
	}

}