import Source from './source/Source.js';
import Context from './context/Context.js';
import TrigraphParser from './parser/TrigraphParser.js';
import LogicLineParser from './parser/LogicLineParser.js';
import TrailingSpacePass from './pass/TrailingSpacePass.js';
import PPTokenizer from './parser/PPTokenizer.js';

import fs from 'fs';

let ctx = new Context();
let src = new Source(process.argv[2], fs.readFileSync(process.argv[2], 'utf-8'));
src = TrigraphParser.process(ctx, src);
src = TrailingSpacePass.process(ctx, src);
src = LogicLineParser.process(ctx, src);

let tokens = PPTokenizer.tokenize(ctx, src);

// for (let t of tokens) {
// 	console.log('<' + t.type() + ',' + t.value() + '>');
// }
console.log(ctx.generateDiagnostics());