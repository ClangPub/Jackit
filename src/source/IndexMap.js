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

export default class IndexMap {
	constructor() {
		this._fromIndexes = [];
		this._toIndexes = [];
		this._lastQuery = 0;
		this._lastIndex = 0;

		this.addMapping(0, 0);
	}

	// addMapping must be called in increasing order
	addMapping(from, to) {
		if (from < this._fromIndexes[this._fromIndexes.length - 1]) {
			throw new Error('Precondition not satisified: addMapping must be called in increasing order');
		}
		if (from === this._fromIndexes[this._fromIndexes.length - 1]) {
			this._fromIndexes.pop();
			this._toIndexes.pop();
		}
		this._fromIndexes.push(from);
		this._toIndexes.push(to);
	}

	getMapping(from) {
		let initial = 0;
		if (from > this._lastQuery) {
			initial = this._lastIndex;
		}
		let fromIndex = this._toIndexes.length - 1;
		for (let i = initial; i <= fromIndex; i++) {
			let start = this._fromIndexes[i];
			if (start > from) {
				fromIndex = i - 1;
				break;
			}
		}
		this._lastQuery = from;
		this._lastIndex = fromIndex;
		return this._toIndexes[fromIndex] + from - this._fromIndexes[fromIndex];
	}
}
