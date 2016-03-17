import Source from './source/Source.js';
import Context from './context/Context.js';
import TrigraphParser from './parser/TrigraphParser.js';
import LogicLineParser from './parser/LogicLineParser.js';
import TrailingSpacePass from './pass/TrailingSpacePass.js';
import PPTokenizer from './parser/PPTokenizer.js';
import PPDirExecutor from './ppdir/PPDirExecutor.js';

import fs from 'fs';

let ctx = new Context();
let src = new Source(process.argv[2], fs.readFileSync(process.argv[2], 'utf-8'));
src = TrigraphParser.process(ctx, src);
src = TrailingSpacePass.process(ctx, src);
src = LogicLineParser.process(ctx, src);

let tokens = PPTokenizer.tokenize(ctx, src);

for (let t of tokens) {
	if (/^\s+$/.test(t.value())) {
		console.log(`<${t.type()}(space):${t.value().length}`);
	} else {
		console.log(`<${t.type()}:${t.value()}>`);
	}
}

console.log(ctx.generateDiagnostics());

PPDirExecutor.process(ctx, tokens, src);
