export type AssistantAttachment={kind:'image';name:string;mimeType:'image/png'|'image/jpeg'|'image/webp';data:string}|{kind:'text';name:string;text:string};
export async function readAssistantAttachment(file:File):Promise<AssistantAttachment>{
 if(file.size>2*1024*1024)throw new Error('Choose a file up to 2 MB.');
 const name=file.name.slice(0,120)||'Attachment';
 if(['image/png','image/jpeg','image/webp'].includes(file.type)){
  const url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('The file could not be read.'));reader.readAsDataURL(file);});
  return {kind:'image',name,mimeType:file.type as 'image/png'|'image/jpeg'|'image/webp',data:url.slice(url.indexOf(',')+1)};
 }
 if(!/\.(txt|md|csv)$/i.test(name))throw new Error('Upload PNG, JPEG, WebP, TXT, Markdown or CSV. PDF and spreadsheet files are not supported yet.');
 const text=await file.text();
 if(!text.trim()||text.length>20000||text.includes('\0'))throw new Error('Use a readable text file with 1-20,000 characters.');
 return {kind:'text',name,text};
}
export function attachmentBytes(file:AssistantAttachment){return file.kind==='image'?Math.floor(file.data.length*3/4):new TextEncoder().encode(file.text).length;}
