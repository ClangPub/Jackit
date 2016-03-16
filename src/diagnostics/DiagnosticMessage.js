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

import "babel-polyfill";
import Color from '../diagnostics/Color.js';

let colorMap;

function translateOffset(line, offset) {
	let ret = 0;
	for (let i = 0; i < offset; i++) {
		if (line[i] !== '\t') ret++;
		else ret += 4 - ret % 4;
	}
	return ret;
}

function translateLine(line) {
	let ret = '';
	for (let i = 0; i < line.length; i++) {
		if (line[i] !== '\t') ret += line[i];
		else {
			for (let j = 4 - ret.length % 4; j > 0; j--) {
				ret += ' ';
			}
		}
	}
	return ret;
}

function getLineAndOffset(linemap, position) {
	let line = linemap.getLineNumber(position);
	let offset = position - linemap.getLineStartIndex(line);
	return [line, translateOffset(linemap.getLine(line), offset)];
}

function repeat(str, times) {
	let ret = '';
	for (; times > 0; times--) {
		ret += str;
	}
	return ret;
}

function colorLine(line, startOffset, endOffset, color) {
	return line.substring(0, startOffset) + Color.wrap(line.substring(startOffset, endOffset), color) + line.substring(endOffset);
}

function generateIndicator(line, startOffset, endOffset, caretLine, caretOffset, color) {
	if (line !== caretLine) {
		return repeat(' ', startOffset) + Color.wrap(repeat('~', endOffset - startOffset), color);
	}else{
		return repeat(' ', startOffset) + Color.wrap(repeat('~', caretOffset - startOffset) + '^' + repeat('~', endOffset - caretOffset - 1), color);
	}
}

function strWidth(n) {
	return n.toString().length;
}

function padLeft(n, l) {
	let str = n.toString();
	return repeat(' ', l - str.length) + str;
}

export default class DiagnosticMessage extends Error {
	constructor(level, message, range) {
		super(message);

		this._range = range;
		this._level = level;
	}

	level() {
		return this._level;
	}

	getMessage() {
		return this.message;
	}

	range() {
		return this._range;
	}

	generateSummaryLine() {
		let filename = this._range.source().filename();
		let linemap = this._range.source().linemap();
		let color = colorMap[this._level];
		let caretOrStart = this._range.caret() === -1 ? this._range.start() : this._range.caret();
		let [caretLine, caretOffset] = getLineAndOffset(linemap, caretOrStart);

		let src = filename + ':' + (caretLine + 1) + ':' + (caretOffset + 1);
		let msgLine = `${Color.wrap(src + ': ', Color.WHITE)}${Color.wrap(this._level + ': ', color)}${Color.wrap(this.message, Color.WHITE)}`;
		return msgLine;
	}

	generateLookupText() {
		let text = '';
		let linemap = this._range.source().linemap();
		let color = colorMap[this._level];

		let [startLine, startOffset] = getLineAndOffset(linemap, this._range.start());
		let [endLine, endOffset] = getLineAndOffset(linemap, this._range.end() - 1);
		endOffset++; // Edge case when end of line shall also be marked
		let [caretLine, caretOffset] = this._range.caret() === -1 ? [-1,-1] : getLineAndOffset(linemap, this._range.caret());

		if (startLine === endLine) {
			let lineText = translateLine(linemap.getLine(startLine));
			text += colorLine(lineText, startOffset, endOffset, color) + '\n';
			text += generateIndicator(startLine, startOffset, endOffset, caretLine, caretOffset, color);
		} else {
			let lineNumberWidth = Math.max(strWidth(startLine + 1), strWidth(endLine + 1));

			// First line
			let lineText = translateLine(linemap.getLine(startLine));
			text += Color.wrap(padLeft(startLine + 1, lineNumberWidth) + ': ', Color.WHITE) + colorLine(lineText, startOffset, lineText.length, color) + '\n';
			text += repeat(' ', lineNumberWidth + 2) + generateIndicator(startLine, startOffset, lineText.length, caretLine, caretOffset, color) + '\n';

			// Middle lines
			for (let line = startLine + 1; line < endLine; line++) {
				let lineText = translateLine(linemap.getLine(line));
				text += Color.wrap(padLeft(line + 1, lineNumberWidth) + ': ', Color.WHITE) + Color.wrap(lineText, color) + '\n';
				text += repeat(' ', lineNumberWidth + 2) + generateIndicator(line, 0, lineText.length, caretLine, caretOffset, color) + '\n';
			}

			// Last line
			lineText = translateLine(linemap.getLine(endLine));
			text += Color.wrap(padLeft(endLine + 1, lineNumberWidth) + ': ', Color.WHITE) + colorLine(lineText, 0, endOffset, color) + '\n';
			text += repeat(' ', lineNumberWidth + 2) + generateIndicator(endLine, 0, endOffset, caretLine, caretOffset, color);
		}
		return text;
	}
}

DiagnosticMessage.LEVEL_FATAL = 'fatal error';
DiagnosticMessage.LEVEL_ERROR = 'error';
DiagnosticMessage.LEVEL_WARNING = 'warning';
DiagnosticMessage.LEVEL_NOTE = 'note';

colorMap = {
	[DiagnosticMessage.LEVEL_FATAL]: Color.LIGHT_RED,
	[DiagnosticMessage.LEVEL_ERROR]: Color.LIGHT_RED,
	[DiagnosticMessage.LEVEL_WARNING]: Color.LIGHT_PURPLE,
	[DiagnosticMessage.LEVEL_NOTE]: Color.LIGHT_CYAN,
};