/*
 * Copyright (c) 2016, Sunchy321
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

import Context from '../context/Context.js';
import Source from '../source/Source.js';
import PPToken from './PPToken.js';
import PPTokenizer from '../parser/PPTokenizer.js';
import MacroReplacedPPToken from './MacroReplacedPPToken.js';
import DiagnosticMessage from '../diagnostics/DiagnosticMessage.js';

function makePPToken(value) {
  let pseudoCtx = new Context();
  let pseudoSrc = new Source('', value);

  let pptokens = PPTokenizer.tokenize(pseudoCtx, pseudoSrc);

  if (pseudoCtx.diagnostics().length !== 0 || pptokens.length !== 1)
    return null;
  else
    return pptokens[0];
}

export class Macro {
  constructor(arg) {
    this._context = arg.context;
    this._nameToken = arg.nameToken;
    this._repList = arg.repList;
  }

  isFunctionLike() {
    return this instanceof FunctionMacro;
  }

  nameToken() {
    return this._nameToken;
  }

  repList() {
    return this._repList;
  }

  static repListIsIdentical(lhs, rhs) {
    if (lhs.length !== rhs.length)
      return false;

    for (let i = 0, len = lhs.length; i < len; ++i) {
      let ltok = lhs[i];
      let rtok = rhs[i];

      if (ltok.type() === 'whitespace') {
        if (rtok.type() !== 'whitespace')
          return false;
      } else {
        if (rtok.value() !== ltok.value())
          return false;
      }
    }

    return true;
  }
}

export class ObjectMacro extends Macro {
  constructor(arg) {
    super({
      context: arg.context,
      nameToken: arg.nameToken,
      repList: null
    });

    this._repList = this._processHashHash(arg.repList);
  }

  // UNSPECIFIED the order of evaluation of ## operator; choice is left-to-right
  _processHashHash(pptoken) {
    let result = [];

    for (let i = 0, len = pptoken.length; i < len; ++i) {
      let currTok = pptoken[i];

      if (currTok.value() === '##') {
        let prev = result.pop();

        let next = pptoken[++i];

        // There won't be a placemarker token
        let token = makePPToken(prev + next);

        if (token === null) {
          this._context.emitDiagnostics(
            new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'operator ## result in a invalid pp-token', this._nameToken.range().source().range(prev.range().start(), next.range().end())),
            new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'in expansion: ', this._expandCtx.macroTok.range().source().range(this._expandCtx.macroTok.range().start(), this._expandCtx.rparen.range().end()))
          );
        } else {
          result.push(token);
        }
      } else {
        result.push(currTok);
      }
    }

    return result;
  }

  replace(pptoken) {
    return this._repList.map(t => new MacroReplacedPPToken(t, this._nameToken, { macroTok: pptoken }));
  }
}

export class FunctionMacro extends Macro {
  constructor(arg) {
    super(arg);
    this._param = arg.param;
    this._isvar = arg.isvar;
  }

  isVariadic() {
    return this._isvar;
  }

  countOfParam() {
    return this._param.length;
  }

  parameter() {
    return this._param;
  }

  checkArg(args, rparen) {
    if (this.isVariadic() && args.length <= this.countOfParam()) {
      return [
        new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the number pf arguments shall more than the number of parameters in a function-like macro with ellipsis notation', rparen.range()),
        new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'macro definition is here', this._nameToken.range()),
      ];
    } else if (args.length !== this.countOfParam()) {
      return [
        new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'the number pf arguments shall equal to the number of parameters in a function-like macro with ellipsis notation', rparen.range()),
        new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'macro definition is here', this._nameToken.range()),
      ];
    }

    return null;
  }

  _paramIndex(str) {
    if (str === '__VA_ARGS__')
      return this.isVariadic() ? this.countOfParam() : -1;
    else
      return this._param.indexOf(str);
  }

  _insertBackSlash(tok) {
    if (tok.type() === 'character' || tok.type() === 'string') {
      let result = '';

      for (let ch of tok.value()) {
        switch (ch) {
          case '"':
            result += '\\"';
            break;
          /// IMPLDEF insert a backslash before a backslash which
          /// starts a universal character name or not; choice is true
          case '\\':
            result += '\\\\';
            break;
          default:
            result += ch;
        }
      }
    } else {
      return tok.value();
    }
  }

  _makeHashString(arg) {
    let deleteWS = [];

    for (let tok of arg) {
      if (tok.isWhitespace()) {
        if (deleteWS.length !== 0 && !deleteWS[deleteWS.length - 1].isWhitespace())
          deleteWS.push(tok);
      } else {
        deleteWS.push(tok);
      }
    }

    while (deleteWS.length !== 0 && deleteWS[deleteWS.length - 1].isWhitespace()) {
      deleteWS.pop();
    }

    return '"' + deleteWS.map(tok => tok.isWhitespace() ? ' ' : this._insertBackSlash(tok)) + '"';
  }

  _processHash(pptoken, args) {
    let result = [];

    for (let i = 0, len = pptoken.length; i < len; ++i) {
      let currTok = pptoken[i];

      if (currTok.value() === '#') {
        ++i;

        while (pptoken[i] && pptoken[i].isWhitespace())
          ++i;

        let index = this._paramIndex(pptoken[i].value());

        result.push(new PPToken(
          currTok.source().range(currTok.range().start(), pptoken[i].range().end()),
          'string',
          this._makeHashString(args[index])
        ));
      } else {
        result.push(currTok);
      }
    }

    return result;
  }

  _processHashHash(pptoken) {
    let result = [];

    for (let i = 0, len = pptoken.length; i < len; ++i) {
      let currTok = pptoken[i];

      if (currTok.value() === '##') {
        let prev = result.pop();

        let next = pptoken[++i];

        if (prev.type() === 'placemarker') {
          result.push(next);
        } else {
          if (next.type() === 'placemarker') {
            result.push(prev);
          } else {
            let token = makePPToken(prev + next);

            if (token === null) {
              this._context.emitDiagnostics(
                new DiagnosticMessage(DiagnosticMessage.LEVEL_ERROR, 'operator ## result in a invalid pp-token', this._nameToken.range().source().range(prev.range().start(), next.range().end())),
                new DiagnosticMessage(DiagnosticMessage.LEVEL_NOTE, 'in expansion: ', this._expandCtx.macroTok.range().source().range(this._expandCtx.macroTok.range().start(), this._expandCtx.rparen.range().end()))
              );
            } else {
              result.push(token);
            }
          }
        }
      } else {
        result.push(currTok);
      }
    }

    return result;
  }

  // Assumption: all macro in arguments are expanded.
  replace(macroTok, lparen, args, rparen) {
    this._expandCtx = { macroTok, lparen, rparen };

    console.assert(this.checkArg(args, undefined) === null);

    let replaced = [];
    let prevHash = '';

    for (let i = 0, len = this._repList.length; i < len; ++i) {
      let currTok = this._repList[i];
      let index = this._paramIndex(currTok.value());

      if (currTok.type() === 'identifier' && index !== -1) {
        // parameter

        if (prevHash === '#') {
          replaced.push(currTok);
        } else if (prevHash === '##') {
          if (args[index].length === 0) {
            replaced.push(new PPToken(currTok.range(), 'placemarker', ''));
          } else {
            replaced = replaced.concat(args[index]);
          }
        } else {
          let j = i + 1;

          while (this._repList[j] && this._repList[j].type() === 'whitespace')
            ++j;

          let next = this._repList[j];

          if (next && next.value() === '##') {
            if (args[index].length === 0) {
              replaced.push(new PPToken(currTok.range(), 'placemarker', ''));
            } else {
              replaced = replaced.concat(args[index]);
            }
          } else {
            replaced = replaced.concat(args[index]);
          }
        }
      } else {
        // non-parameter

        if (currTok.value() === '#' || currTok.value() === '##')
          prevHash = currTok.value();

        replaced.push(currTok);
      }
    }

    return this._processHashHash(this._processHash(replaced, args)).map(tok => new MacroReplacedPPToken(tok, this._nameToken, { macroTok, lparen, args, rparen }));
  }
}
