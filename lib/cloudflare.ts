export class AppError extends Error { constructor(public status:number,message:string){super(message);} }
type Envelope<T>={success:boolean;result:T;errors?:{code:number;message:string}[];result_info?:{total_pages?:number;total_count?:number;page?:number;per_page?:number}};
const API_ORIGIN='https://api.cloudflare.com';
const API_ROOT=`${API_ORIGIN}/client/v4`;
function safeNetworkDiagnostic(error:unknown){
 const record=(value:unknown):Record<string,unknown>|undefined=>typeof value==='object'&&value!==null?value as Record<string,unknown>:undefined;
 const safeCode=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,40}$/.test(value)?value:typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=9999?value:undefined;
 const source=record(error);const cause=record(source?.cause);const message=typeof source?.message==='string'?source.message.toLowerCase():'';
 const failureClass=/timeout|timed out/.test(message)?'timeout':/dns|resolve|hostname|name or service/.test(message)?'dns':/tls|ssl|certificate/.test(message)?'tls':/redirect/.test(message)?'redirect':/abort/.test(message)?'aborted':/disallowed|cloudflare-owned ip|1024/.test(message)?'blocked':/network|connection|socket|econn/.test(message)?'connection':/fetch failed/.test(message)?'fetch_failure':/invalid url|unsupported protocol/.test(message)?'request':'other';
 return {errorType:typeof source?.name==='string'?source.name:'UnknownError',failureClass,errorCode:safeCode(source?.code),causeType:typeof cause?.name==='string'?cause.name:undefined,causeCode:safeCode(cause?.code)};
}
function safeEndpoint(path:string){
 let pathname='';try{pathname=new URL(API_ROOT+path).pathname;}catch{return 'other';}
 if(pathname==='/client/v4/user/tokens/verify')return 'user_token_verify';
 if(/^\/client\/v4\/accounts\/[^/]+\/tokens\/verify$/.test(pathname))return 'account_token_verify';
 if(pathname==='/client/v4/zones')return 'zone_list';
 if(/^\/client\/v4\/accounts\/[^/]+\/email\/routing\/addresses(?:\/[^/]+)?$/.test(pathname))return 'account_addresses';
 return 'other';
}
function redirectTarget(location:string|null,requestUrl:string){
 if(!location)return {url:undefined,targetClass:'missing'};
 try{
  const target=new URL(location,requestUrl);
  if(target.origin===API_ORIGIN)return {url:target,targetClass:target.pathname.startsWith('/client/v4/')?'same_api':'same_origin'};
  if(target.protocol==='https:'&&(target.hostname==='cloudflare.com'||target.hostname.endsWith('.cloudflare.com')))return {url:target,targetClass:'cloudflare_domain'};
  return {url:target,targetClass:'external'};
 }catch{return {url:undefined,targetClass:'invalid'};}
}
export async function cf<T=unknown>(token:string,path:string,method='GET',body?:unknown):Promise<Envelope<T>>{
 const requestUrl=API_ROOT+path,endpoint=safeEndpoint(path),init={method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)};
 let response:Response;
 try{response=await fetch(requestUrl,{...init,redirect:'manual'});}catch(error){console.error('[relaydesk] Cloudflare API transport failure',{endpoint,...safeNetworkDiagnostic(error)});throw new AppError(502,method==='GET'?'ติดต่อ Cloudflare ไม่สำเร็จ กรุณาลองใหม่':'ยังยืนยันผลการเปลี่ยนแปลงไม่ได้ กรุณารีเฟรชตรวจสอบก่อนทำซ้ำ');}
 if(response.status>=300&&response.status<400){const redirect=redirectTarget(response.headers.get('Location'),requestUrl);console.error('[relaydesk] Cloudflare API redirect',{endpoint,failureClass:'redirect',httpStatus:response.status,targetClass:redirect.targetClass});if(method!=='GET'||redirect.targetClass!=='same_api'||!redirect.url)throw new AppError(502,'Cloudflare เปลี่ยนเส้นทางคำขอไปยังปลายทางที่ไม่รองรับ ระบบไม่ได้ส่ง Token ต่อไป');try{response=await fetch(redirect.url.toString(),{...init,redirect:'error'});}catch(error){console.error('[relaydesk] Cloudflare API redirected request failure',{endpoint,...safeNetworkDiagnostic(error)});throw new AppError(502,'ติดต่อ Cloudflare ไม่สำเร็จ กรุณาลองใหม่');}}
 let data:Envelope<T>;try{data=await response.json();}catch{throw new AppError(502,'Cloudflare ส่งข้อมูลที่อ่านไม่ได้ กรุณารีเฟรชตรวจสอบ');}
 if(!response.ok||!data.success){const errorCodes=(data.errors??[]).map(e=>e.code).filter(code=>Number.isSafeInteger(code)&&code>=1000&&code<=9999);const codes=errorCodes.join(',');console.error('[relaydesk] Cloudflare API rejected request',{endpoint,httpStatus:response.status,errorCodes});throw new AppError(response.status>=400&&response.status<500?response.status:502,`Cloudflare ปฏิเสธคำขอ (HTTP ${response.status}${codes?`, code ${codes}`:''}) กรุณาตรวจสอบสิทธิ์ Token และข้อมูลที่กรอก`);}
 return data;
}
export async function listAll<T>(token:string,path:string):Promise<T[]>{const items:T[]=[];for(let page=1;page<=100;page++){const data=await cf<T[]>(token,`${path}${path.includes('?')?'&':'?'}page=${page}&per_page=50`);if(!Array.isArray(data.result))throw new AppError(502,'รูปแบบรายการ Cloudflare ไม่ถูกต้อง');items.push(...data.result);const info=data.result_info;if(info?.total_pages!==undefined?page>=info.total_pages:info?.total_count!==undefined?items.length>=info.total_count:data.result.length<50)return items;}throw new AppError(422,'รายการเกินขอบเขตที่โหลดได้ กรุณาจำกัดโดเมนใน Token');}
