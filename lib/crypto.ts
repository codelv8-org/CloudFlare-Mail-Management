const encode=new TextEncoder();
function bytes(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
function base64(value:Uint8Array){return btoa(String.fromCharCode(...value));}
async function key(secret:string){const raw=bytes(secret);if(raw.length!==32)throw new Error('Invalid encryption key');return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);}
export async function encrypt(token:string,secret:string,owner:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode.encode(owner)},await key(secret),encode.encode(token));return base64(iv)+'.'+base64(new Uint8Array(data));}
export async function decrypt(value:string,secret:string,owner:string){const [iv,data]=value.split('.');return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(iv),additionalData:encode.encode(owner)},await key(secret),bytes(data)));}
export async function fingerprint(value:unknown){const raw=await crypto.subtle.digest('SHA-256',encode.encode(JSON.stringify(value)));return Array.from(new Uint8Array(raw),v=>v.toString(16).padStart(2,'0')).join('');}
