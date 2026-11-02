import {checkParserDependencies} from './runtime.mjs';
try{
 await checkParserDependencies();
 console.log('M1.3: pinned Tree-sitter runtime and grammar-asset package verified.');
}catch(e){console.error(`${e.message}\nNo grammar compatibility claims are made. npm install must succeed before npm run test:grammar.`);process.exitCode=1;}
