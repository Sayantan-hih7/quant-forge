import {Extension} from '@tiptap/core';
import {Plugin} from '@tiptap/pm/state';
export const COMPOSER_LIMIT=1200;
export const ComposerBudget=Extension.create({
 name:'composerBudget',
 addProseMirrorPlugins(){const editor=this.editor;return [new Plugin({filterTransaction(transaction,state){
   if(!transaction.docChanged||transaction.getMeta('allowExternalContent'))return true;
   const next=editor.markdown?.serialize(transaction.doc.toJSON()).length??0;
   const previous=editor.markdown?.serialize(state.doc.toJSON()).length??0;
   return next<=COMPOSER_LIMIT||next<previous;
 }})];},
});
export function safeComposerHtml(html:string){
 const doc=new DOMParser().parseFromString(html,'text/html');
 doc.querySelectorAll('script,style,iframe,object,embed,svg,math,link,meta,form,noscript').forEach(node=>node.remove());
 const tags=new Set(['P','DIV','BR','STRONG','B','EM','I','U','S','DEL','H1','H2','H3','BLOCKQUOTE','PRE','CODE','UL','OL','LI','TABLE','THEAD','TBODY','TFOOT','TR','TH','TD','A','HR']);
 for(const node of Array.from(doc.body.querySelectorAll('*'))){
   if(node.tagName==='IMG'||node.tagName==='INPUT'){node.remove();continue;}
   if(!tags.has(node.tagName)){node.replaceWith(...node.childNodes);continue;}
   const href=node.getAttribute('href'),start=node.getAttribute('start');
   for(const attr of Array.from(node.attributes))node.removeAttribute(attr.name);
   if(node.tagName==='A'&&href&&/^(https?:|mailto:)/i.test(href.trim()))node.setAttribute('href',href.trim());
   if(node.tagName==='OL'&&start&&/^\d+$/.test(start))node.setAttribute('start',start);
 }
 return doc.body.innerHTML;
}
