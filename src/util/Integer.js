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

export default class Integer {
	constructor() {
		switch (arguments.length) {
		case 0:
			this._values = [];
			this._ispos = false;
			break;
		case 1:
			let result = Integer.fromString(String(arguments[0]));
			this._ispos  = result._ispos;
			this._values = result._values;
			break;
		case 2:
			this._ispos  = arguments[0];
			this._values = arguments[1];
			break;
		}
	}

	static fromString(value) {
		let ispos;

		if (value.startsWith('-')) {
			value = value.substr(1);
			ispos = false;
		} else if (value.startsWith('+')) {
			value = value.substr(1);
			ispos = true;
		} else {
			ispos = true;
		}

		const len = value.length;
		const lob = Integer.LENGTH_OF_BASE;

		if (len % lob !== 0) {
			value = '0'.repeat(lob - (len % lob)) + value;
		}

		let values = [];

		for (let i = 0, len = value.length; i * lob < len; ++i) {
			let val = Number(value.substr(i * lob, lob));

			if (isNaN(val)) {
				return null;
			}

			values.unshift(val);
		}

		values = Integer._shrink(values);

		if (values.length === 0) {
			ispos = false;
		}

		return new Integer(ispos, values);
	}

	toString() {
		if (this._values.length === 0) {
			return '0';
		} else {
			const len = this._values.length;

			return (this._ispos ? '' : '-') + this._values.reverse().map(function (v, i) {
				if (i === 0) {
					return v.toString();
				} else {
					const str = v.toString();
					const lob = Integer.LENGTH_OF_BASE;

					return '0'.repeat(lob - str.length) + str;
				}
			}).join('');
		}
	}

	sign() {
		if (this._values.length === 0)
			return 0;
		else if (this._ispos)
			return 1;
		else
			return -1;
	}

	cmp(rhs) {
		if (this.sign() != rhs.sign())
			return this.sign() - rhs.sign();
		else if (this.sign() === 1)
			return Integer._rawCmp(this._values, rhs._values);
		else if (this.sign() === 0)
			return 0;
		else
			return -Integer._rawCmp(this._values, rhs._values);
	}

	add(rhs) {
		if (rhs.sign() === 0)
			return this;

		if (this.sign() === 0)
			return rhs;

		if (this.sign() === 1) {
			if (rhs.sign() === 1) {
				return new Integer(true, Integer._rawAdd(this._values, rhs._values));
			} else {
				let subRes = Integer._rawSub(this._values, rhs._values);
				return new Integer(subRes.ispos, subRes.values);
			}
		} else {
			if (rhs.sign() === 1) {
				let subRes = Integer._rawSub(rhs._values, this._values);
				return new Integer(subRes.ispos, subRes.values);
			} else {
				return new Integer(false, Integer._rawAdd(this._values, rhs._values));
			}
		}
	}

	sub(rhs) {
		if (rhs.sign() === 0)
			return this;

		if (this.sign() === 0)
			return new Integer(!rhs._ispos, rhs._values);

		if (this.sign() === 1) {
			if (rhs.sign() === 1) {
					let subRes = Integer._rawSub(this._values, rhs._values);
					return new Integer(subRes.ispos, subRes.values);
			} else {
					return new Integer(true, Integer._rawAdd(this._values, rhs._values));
			}
		} else {
			if (rhs.sign() === 1) {
				return new Integer(false, Integer._rawAdd(this._values, rhs._values));
			} else {
				let subRes = Integer._rawSub(rhs._values, this._values);
				return new Integer(subRes.ispos, subRes.values);
			}
		}
	}

	static _shrink(value) {
		let lastNonZero = -1;

		for (let i = value.length - 1; i >= 0; --i) {
			if (value[i] !== 0) {
				lastNonZero = i;
				break;
			}
		}

		return value.slice(0, lastNonZero + 1);
	}

	static _rawCmp(lhs, rhs) {
		if (lhs.length != rhs.length)
			return lhs.length - rhs.length;

		for (let i = 0, len = lhs.length; i < len; ++i)
			if (lhs[i] != rhs[i])
				return lhs[i] - rhs[i];

		return 0;
	}

	static _rawAdd(lhs, rhs) {
		let values = [];

		for (let i = 0, len = lhs.length > rhs.length ? lhs.length : rhs.length; i < len; ++i) {
			values[i] = (lhs[i] || 0) + (rhs[i] || 0);
		}

		for (let i = 0, len = values.length; i < len; ++i) {
			if (values[i] >= Integer.BASE) {
				values[i] -= Integer.BASE;
				values[i + 1] = (values[i + 1] || 0) + 1;
			}
		}

		return values;
	}

	static _rawSub(lhs, rhs) {
		let values = [];

		for (let i = 0, len = lhs.length > rhs.length ? lhs.length : rhs.length; i < len; ++i) {
			values[i] = (lhs[i] || 0) - (rhs[i] || 0);
		}

		// adjust all values[i] to positive except values[values.length - 1]
		for (let i = 0, len = values.length; i < len; ++i) {
			if (values[i] < 0) {
				values[i] += Integer.BASE;
				values[i + 1] = (values[i + 1] || 0) - 1;
			}
		}

		values = Integer._shrink(values);

		if (values.length === 0) {
			return { ispos: false, values: [] };
		} else if (values[values.length - 1] > 0) {
			return { ispos: true, values };
		} else {
			values = values.map(v => -v);

			for (let i = 0, len = values.length; i < len; ++i) {
				if (values[i] < 0) {
					values[i] += Integer.BASE;
					values[i + 1] = (values[i + 1] || 0) - 1;
				}
			}

			return { ispos: false, values: Integer._shrink(values) };
		}
	}


}

// BASE must be power of 10 so that toString() could be implemented easily.
Integer.BASE = 10000;
Integer.LENGTH_OF_BASE = 4;

Integer.ZERO = new Integer();
Integer.ONE = new Integer(1);
