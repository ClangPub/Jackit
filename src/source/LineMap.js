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

export default class LineMap {

	constructor(src) {
		this._source = src;
		let lines = [0];
		for (let i = 0;; i++) {
			let c = this._source.at(i);
			if (c === '') {
				break;
			} else if (c === '\n') {
				lines.push(i + 1);
			}
		}
		this._lines = lines;
	}

	getLineNumber(index) {
		let start = 0;
		let end = this._lines.length;

		while (start < end) {
			let mid = (start + end) >>> 1;
			let i = this._lines[mid];
			if (index === i) {
				return mid;
			} else if (index > i) {
				start = mid + 1;
			} else {
				end = mid;
			}
		}

		return start - 1;
	}

	getLine(line) {
		if (line == this._lines.length - 1) {
			return this._source.substring(this._lines[line]);
		} else {
			return this._source.substring(this._lines[line], this._lines[line + 1] - 1);
		}
	}

	getLineStartIndex(line) {
		return this._lines[line];
	}

}
