import Source from './source/Source.js';
import Context from './context/Context.js';
import TrigraphParser from './parser/TrigraphParser.js';
import LogicLineParser from './parser/LogicLineParser.js';
import CommentParser from './parser/CommentParser.js';
import TrailingSpacePass from './pass/TrailingSpacePass.js';
import PPTokenizer from './parser/PPTokenizer.js';
import Preprocessor from './parser/Preprocessor.js';

import fs from 'fs';

let ctx = new Context();
let src = new Source(process.argv[2], fs.readFileSync(process.argv[2], 'utf-8'));
src = TrigraphParser.process(ctx, src);
src = TrailingSpacePass.process(ctx, src);
src = LogicLineParser.process(ctx, src);
src = CommentParser.process(ctx, src);

let tokens = PPTokenizer.tokenize(ctx, src);
tokens = Preprocessor.process(ctx, tokens);

for (let t of tokens) {
	let v = t.value().replace('\n', '\\n');
	process.stdout.write(t.value());
}


console.log(ctx.generateDiagnostics());
