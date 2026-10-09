import {useEffect,useImperativeHandle,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {Button, Dropdown, Input, Tooltip} from 'antd';
import {BoldOutlined,ItalicOutlined,LinkOutlined,DownOutlined} from '@ant-design/icons';
import {EditorContent,useEditor,type Editor} from '@tiptap/react';
import {generateJSON} from '@tiptap/core';
import {Slice} from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import {Markdown} from '@tiptap/markdown';
import {TableKit} from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import {clipboardMarkdown} from '../../services/assistantComposer';
import {ComposerBudget,COMPOSER_LIMIT,safeComposerHtml} from '../../services/richComposer';

export interface AssistantComposerHandle {focus:()=>void}
export default function AssistantComposerInput({input,value,onChange,disabled,onSend,onFile,onLargePaste}:{input:RefObject<AssistantComposerHandle|null>;value:string;onChange:(value:string)=>void;disabled:boolean;onSend:()=>void;onFile:(file:File)=>void;onLargePaste:(text:string)=>void}) {
 const root=useRef<HTMLDivElement>(null),editorRef=useRef<Editor|null>(null),published=useRef(value);
 const callbacks=useRef({onChange,onSend,onFile,onLargePaste,disabled});
 useLayoutEffect(()=>{callbacks.current={onChange,onSend,onFile,onLargePaste,disabled};},[onChange,onSend,onFile,onLargePaste,disabled]);
 const [bubble,setBubble]=useState<{left:number;top:number}>(),[linkOpen,setLinkOpen]=useState(false),[link,setLink]=useState(''),[linkError,setLinkError]=useState('');
 const positionBubble=(current:Editor)=>{
   if(!root.current||current.state.selection.empty||!current.isEditable){setBubble(undefined);return;}
   const rect=root.current.getBoundingClientRect(),caret=current.view.coordsAtPos(current.state.selection.from);
   setBubble({left:Math.max(0,Math.min(caret.left-rect.left,rect.width-300)),top:Math.max(-44,caret.top-rect.top-44)});
 };
 const editor=useEditor({
   extensions:[StarterKit.configure({heading:{levels:[1,2,3]},link:{openOnClick:false,autolink:false,isAllowedUri:url=>/^(https?:|mailto:)/i.test(url)}}),Markdown,TableKit.configure({table:{resizable:false,renderWrapper:true}}),TaskList,TaskItem.configure({nested:true}),ComposerBudget],
   content:value,contentType:'markdown',editable:!disabled,
   onCreate:({editor:current})=>{editorRef.current=current;},
   onTransaction:({editor:current})=>{editorRef.current=current;},
   onUpdate:({editor:current})=>{editorRef.current=current;const markdown=current.getMarkdown();published.current=markdown;callbacks.current.onChange(markdown);},
   onSelectionUpdate:({editor:current})=>positionBubble(current),
   editorProps:{
     attributes:{role:'textbox','aria-label':'Message QuantForge assistant','aria-multiline':'true','data-placeholder':'Describe your idea, or ask me to improve your saved rules...'},
     handleKeyDown:(view,event)=>{
       const current=editorRef.current;if(!current||callbacks.current.disabled||event.isComposing)return false;
       if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a')requestAnimationFrame(()=>{if(editorRef.current)positionBubble(editorRef.current);});
       if(event.key==='Escape'){setBubble(undefined);setLinkOpen(false);return true;}
       // A new paragraph enables list input rules after Shift+Enter. Keep soft breaks inside structured content.
       if(event.key==='Enter'&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&view.state.selection.$from.depth===1&&view.state.selection.$from.parent.type.name==='paragraph'){
         event.preventDefault();return current.commands.splitBlock();
       }
       if(event.key==='Enter'&&!event.shiftKey){
         const position=view.state.selection.$from;
         const structured=Array.from({length:position.depth},(_,i)=>position.node(i+1).type.name).some(name=>['listItem','taskItem','codeBlock','table','blockquote'].includes(name));
         if(event.ctrlKey||event.metaKey||!structured){event.preventDefault();callbacks.current.onSend();return true;}
       }
       return false;
     },
     handlePaste:(_view,event)=>{
       const current=editorRef.current;if(!current||callbacks.current.disabled)return false;
       const data=event.clipboardData;if(!data)return false;
       const image=Array.from(data.files).find(file=>file.type.startsWith('image/'));if(image){callbacks.current.onFile(image);return true;}
       const plain=data.getData('text/plain'),html=data.getData('text/html');
       if(!plain&&!html)return false;
       // Parse into editor nodes, never mount arbitrary clipboard HTML in React.
       const content=html?generateJSON(safeComposerHtml(html),current.extensionManager.extensions):current.markdown!.parse(clipboardMarkdown(plain,''));
       const markdown=current.markdown!.serialize(content);
       if(!markdown.trim())return true;
       const pastedNode=current.schema.nodeFromJSON(content);
       const preview=current.state.tr.replaceSelection(new Slice(pastedNode.content,0,0));
       const fits=current.markdown!.serialize(preview.doc.toJSON()).length<=COMPOSER_LIMIT;
       if(!fits){callbacks.current.onLargePaste(html?markdown:plain);return true;}
       current.chain().focus().insertContent(content).run();return true;
     },
     handleDOMEvents:{blur:(_view,event)=>{if(!root.current?.contains(event.relatedTarget as Node|null)){setBubble(undefined);setLinkOpen(false);}return false;},scroll:()=>{setBubble(undefined);return false;}},
   },
 });
 useLayoutEffect(()=>{editorRef.current=editor;},[editor]);
 useImperativeHandle(input,()=>({focus:()=>{editor?.commands.focus('end');}}),[editor]);
 useEffect(()=>{if(editor)editor.setEditable(!disabled,false);},[editor,disabled]);
 useEffect(()=>{if(editor&&value!==published.current){published.current=value;editor.chain().setMeta('allowExternalContent',true).setContent(value,{contentType:'markdown',emitUpdate:false}).run();}},[editor,value]);
 const format=(kind:string)=>{
   if(!editor)return;const chain=editor.chain().focus();
   if(kind==='bold')chain.toggleBold().run();else if(kind==='italic')chain.toggleItalic().run();
   else if(kind==='plain')chain.clearNodes().unsetAllMarks().run();
   else if(kind==='bullet')chain.toggleBulletList().run();else if(kind==='number')chain.toggleOrderedList().run();else if(kind==='check')chain.toggleTaskList().run();
   else if(kind==='quote')chain.toggleBlockquote().run();else if(kind==='code')chain.toggleCodeBlock().run();
   else if(kind==='table')chain.insertTable({rows:3,cols:2,withHeaderRow:true}).run();
   else if(kind==='row')chain.addRowAfter().run();else if(kind==='column')chain.addColumnAfter().run();else if(kind==='deleteRow')chain.deleteRow().run();else if(kind==='deleteColumn')chain.deleteColumn().run();else if(kind==='deleteTable')chain.deleteTable().run();
   else if(['h1','h2','h3'].includes(kind))chain.toggleHeading({level:Number(kind[1]) as 1|2|3}).run();
   setBubble(undefined);setLinkOpen(false);
 };
 const addLink=()=>{try{const url=new URL(link.trim());if(!['http:','https:','mailto:'].includes(url.protocol))throw new Error();editor?.chain().focus().extendMarkRange('link').setLink({href:url.href}).run();setLinkOpen(false);setBubble(undefined);}catch{setLinkError('Enter an https://, http:// or mailto: link.');}};
 const styleLabel=editor?.isActive('orderedList')?'Numbered list':editor?.isActive('bulletList')?'Bulleted list':editor?.isActive('taskList')?'Checklist':editor?.isActive('table')?'Table':editor?.isActive('heading')?'Heading':'Text';
 return <div ref={root} className="assistant-editor assistant-rich-composer">
 {bubble&&!disabled&&<div className="assistant-selection-bubble" style={bubble} role="toolbar" aria-label="Text formatting" onMouseDown={event=>{if(!(event.target instanceof HTMLInputElement))event.preventDefault();}}>
 <Tooltip title="Bold (Ctrl+B)"><Button type="text" aria-label="Bold" aria-pressed={editor?.isActive('bold')} icon={<BoldOutlined/>} onClick={()=>format('bold')}/></Tooltip>
 <Tooltip title="Italic (Ctrl+I)"><Button type="text" aria-label="Italic" aria-pressed={editor?.isActive('italic')} icon={<ItalicOutlined/>} onClick={()=>format('italic')}/></Tooltip>
 <Tooltip title="Add link"><Button type="text" aria-label="Add link" icon={<LinkOutlined/>} onClick={()=>{setLinkOpen(!linkOpen);setLink(editor?.getAttributes('link').href??'');setLinkError('');}}/></Tooltip>
 <Dropdown trigger={['click']} getPopupContainer={()=>root.current!} menu={{items:[{key:'plain',label:'Normal text'},{key:'h1',label:'Heading 1'},{key:'h2',label:'Heading 2'},{key:'h3',label:'Heading 3'},{type:'divider'},{key:'bullet',label:'Bulleted list'},{key:'number',label:'Numbered list'},{key:'check',label:'Checklist'},{key:'quote',label:'Quote'},{key:'code',label:'Code block'},{key:'table',label:'Insert table'},...(editor?.isActive('table')?[{key:'row',label:'Add row below'},{key:'column',label:'Add column after'},{key:'deleteRow',label:'Delete row'},{key:'deleteColumn',label:'Delete column'},{key:'deleteTable',label:'Remove table'}]:[])],onClick:({key})=>format(key)}}><Button type="text" aria-label="Text style">{styleLabel} <DownOutlined/></Button></Dropdown>
 {linkOpen&&<div className="assistant-link-entry"><Input autoFocus aria-label="Link address" placeholder="https://example.com" value={link} onChange={e=>setLink(e.target.value)} onPressEnter={addLink}/><Button size="small" type="primary" onClick={addLink}>Apply link</Button>{linkError&&<small role="alert">{linkError}</small>}</div>}
 </div>}
 <EditorContent editor={editor}/>
 </div>;
}
