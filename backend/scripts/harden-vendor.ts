import {readFileSync,writeFileSync} from 'node:fs';
import ts from 'typescript';

// Reapply after replacing the SDK with the same audited version. Never change
// broker protocols or disable TLS verification to make a connection succeed.
const path=new URL('../vendor/motilal-broadcast-sdk/MOFSLOPENAPI_V3.1.cjs',import.meta.url);
let source=readFileSync(path,'utf8');
source=source.replaceAll("'rejectUnauthorized':![]","'rejectUnauthorized':!![]");
const tree=ts.createSourceFile('sdk.cjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let logger:ts.FunctionExpression|undefined;
function visit(node:ts.Node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='_0x1176e7'&&node.initializer&&ts.isFunctionExpression(node.initializer))logger=node.initializer;
  ts.forEachChild(node,visit);
}
visit(tree);
if(!logger)throw new Error('SDK logging implementation changed; review before using the new vendor version');
source=source.slice(0,logger.getStart(tree))+'function(){}'+source.slice(logger.end);
writeFileSync(path,source,'utf8');
console.log('Vendor file logging disabled; TLS verification enabled.');
