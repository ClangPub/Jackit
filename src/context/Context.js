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

import DiagnosticMessage from '../diagnostics/DiagnosticMessage.js';

export default class Context {

	constructor() {
		this._diagnostics = [];
	}

	emitDiagnostics(...msgs) {
		if (msgs.length === 1 && msgs[0] instanceof Array) {
			this.emitDiagnostics(...msgs[0]);
		} else {
			this._diagnostics.push(...msgs);
			let fatal = msgs.filter(msg => msg.level() === DiagnosticMessage.LEVEL_FATAL);
			if (fatal.length !== 0) {
				throw fatal[0];
			}
		}
	}

	generateDiagnostics() {
		let builder = '';
		for (let d of this._diagnostics) {
			builder += d.generateSummaryLine() + '\n';
			builder += d.generateLookupText() + '\n';
		}
		return builder;
	}

	diagnostics() {
		return this._diagnostics;
	}

}
