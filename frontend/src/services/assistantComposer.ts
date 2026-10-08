// Convert clipboard tables without inserting clipboard HTML into the document.
export function clipboardMarkdown(plain:string, html:string):string {
  const doc=html ? new DOMParser().parseFromString(html,'text/html') : undefined;
  doc?.querySelectorAll('script,style,iframe,object').forEach(node=>node.remove());
  const table=doc?.querySelector('table');
  const rows=table ? Array.from(table.rows).map(row=>Array.from(row.cells).map(cell=>cell.textContent?.trim()??'')) : plain.includes('\t') ? plain.trimEnd().split(/\r?\n/).map(row=>row.split('\t')) : [];
  if(rows.length>1 && rows[0].length>1 && rows.every(row=>row.length===rows[0].length)){
    const line=(row:string[])=>'| '+row.map(cell=>cell.replace(/\|/g,'\\|').replace(/\r?\n/g,' ')).join(' | ')+' |';
    return [line(rows[0]),line(rows[0].map(()=> '---')),...rows.slice(1).map(line)].join('\n');
  }
  if(doc?.querySelector('ul,ol')) {
    const render=(node:Node,depth=0):string=>{
      if(node.nodeType===Node.TEXT_NODE)return node.textContent??'';
      if(!(node instanceof Element))return '';
      const children=()=>Array.from(node.childNodes).map(child=>render(child,depth)).join('');
      if(node.tagName==='UL'||node.tagName==='OL')return '\n'+Array.from(node.children).filter(child=>child.tagName==='LI').map((li,i)=>'  '.repeat(depth)+(node.tagName==='OL'?`${i+1}. `:'- ')+Array.from(li.childNodes).map(child=>render(child,depth+1)).join('').trim()).join('\n')+'\n';
      if(node.tagName==='BR')return '\n';
      if(['P','DIV'].includes(node.tagName))return children()+'\n';
      if(['STRONG','B'].includes(node.tagName))return '**'+children()+'**';
      if(['EM','I'].includes(node.tagName))return '*'+children()+'*';
      return children();
    };
    return render(doc.body).trim();
  }
  return plain;
}
export function continueList(value:string, start:number, end:number){
  const lineStart=value.lastIndexOf('\n',start-1)+1;
  const line=value.slice(lineStart,start);
  const match=/^(\s*)(?:(- |\* |\+ )(?:\[[ xX]\] )?|(\d+)([.)]) )(.*)$/.exec(line);
  if(!match||start!==end)return undefined;
  if(!match[5].trim())return {value:value.slice(0,lineStart)+value.slice(start),caret:lineStart};
  const marker=match[3]?`${Number(match[3])+1}${match[4]} `:match[2]+(/\[[ xX]\] /.test(line)?'[ ] ':'');
  const insert='\n'+match[1]+marker;
  return {value:value.slice(0,start)+insert+value.slice(end),caret:start+insert.length};
}
