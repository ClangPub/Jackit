/*
 * Copyright (c) 2016, ClangPub
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

export class PPDirOrTextLine {
	constructor(context, pptokens, source) {
		this._context = context;
		this._pptokens = pptokens;
		this._source = source;
	}

	context() {
		return this._context;
	}

	pptokens() {
		return this._pptokens;
	}

	source() {
		return this._source;
	}

	_parseLine() {
		let firstNonWhiteSpace;
		let secondNonWhiteSpace;

		for (let i = 0, length = this._pptokens.length; i < length; ++i) {
			let pptoken = this._pptokens[i];

			if (pptoken.type() != 'whitespace' && pptoken.type() != 'linebreak') {
				if (firstNonWhiteSpace === undefined) {
					firstNonWhiteSpace = pptoken;
				} else if (secondNonWhiteSpace === undefined) {
					secondNonWhiteSpace = pptoken;
				} else {
					break;
				}
			}

			if (firstNonWhiteSpace === undefined || firstNonWhiteSpace.value() !== '#') {
				// text line
				this._istextline = true;
				this._dirname = null;
			} else {
				// dir line
				this._istextline = false;
				if (secondNonWhiteSpace === undefined) {
					// empty-dir
					this._dirname = '';
				} else {
					this._dirname = secondNonWhiteSpace.value();
				}
			}
		}
	}

	isTextLine() {
		if (this._istextline === undefined)
			this._parseLine();

		return this._istextline;
	}

	dirName() {
		if (this._dirname === undefined)
			this._parseLine();

		return this._dirname;
	}
}

export default class PPDirExecutor {
	constructor(context, pptokens, source) {
		this._context = context;
		this._pptokens = pptokens;
		this._source = source;
	}

	next() {
		if (this._pptokens.length === 0 || this._pptokens[0].type() === 'eof')
			return null;

		const getLineNumber = (tok) => this._source.linemap().getLineNumber(tok.range().start());

		let pptokens = [];
		let line, i;
		const len = this._pptokens.length;

		for (i = 0; i < len; ++i) {
			let pptok = this._pptokens[i];

			if (line === undefined) {
				line = getLineNumber(pptok);
				pptokens.push(pptok);
			} else if (line === getLineNumber(pptok)) {
				pptokens.push(pptok);
			} else {
				break;
			}
		}

		this._pptokens.splice(0, i);
		return new PPDirOrTextLine(this._context, pptokens, this._source);
	}

	static process(context, pptokens, source) {
		const direxec = new PPDirExecutor(context, pptokens, source);
		let line;

		while ((line = direxec.next()) !== null) {
			console.log('~~~~');
			console.log(line.isTextLine());
			console.log(line.dirName());
		}
	}
}
