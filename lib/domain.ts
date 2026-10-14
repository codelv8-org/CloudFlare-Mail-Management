import { z } from 'zod';
export const cfId = z.string().regex(/^[a-f0-9]{32}$/i,'ID ต้องเป็นเลขฐานสิบหก 32 ตัว');
export const localId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const catalogItem = z.object({ id:localId, name:z.string().trim().min(1).max(50), color:z.string().regex(/^#[a-fA-F0-9]{6}$/), logo:z.string().max(60000).default(''), rank:z.number().int().min(0).max(999).default(50) });
export const catalogSchema = z.object({ platforms:z.array(catalogItem).max(100), groups:z.array(catalogItem).max(100), priorities:z.array(catalogItem).max(30) }).superRefine((v,ctx)=>{for(const list of Object.values(v)){if(new Set(list.map(i=>i.id)).size!==list.length||new Set(list.map(i=>i.name.toLowerCase())).size!==list.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:'ชื่อและ ID ในหมวดเดียวกันต้องไม่ซ้ำ'}); for(const i of list) if(i.logo&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(i.logo)&&!/^\/logos\/[a-z0-9-]+\.svg$/.test(i.logo))ctx.addIssue({code:z.ZodIssueCode.custom,message:'โลโก้ต้องเป็นไฟล์ PNG, JPEG, WebP หรือโลโก้ในระบบ'});}});
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogItem = z.infer<typeof catalogItem>;
export const defaults:Catalog={platforms:[{id:'chatgpt',name:'ChatGPT',color:'#8DD8BE',logo:'/logos/openai.svg',rank:0},{id:'claude',name:'Claude AI',color:'#DEA98B',logo:'/logos/claude.svg',rank:1}],groups:[{id:'admin',name:'Admin',color:'#B8A6FF',logo:'',rank:0},{id:'staff',name:'Staff',color:'#83C9ED',logo:'',rank:1},{id:'member',name:'Member',color:'#9FD4B6',logo:'',rank:2}],priorities:[{id:'high',name:'สูง',color:'#FFB0B8',logo:'',rank:0},{id:'normal',name:'ปกติ',color:'#E1CE9B',logo:'',rank:50},{id:'low',name:'ต่ำ',color:'#91C9D9',logo:'',rank:100}]};
export const annotationSchema=z.object({platforms:z.array(localId).max(100),groups:z.array(localId).max(100),priority:localId.or(z.literal('')),note:z.string().max(2000)});
export type Annotation=z.infer<typeof annotationSchema>;
export const blankAnnotation:Annotation={platforms:[],groups:[],priority:'',note:''};
export const ruleSchema=z.object({name:z.string().trim().min(1).max(256),email:z.string().email().max(90).or(z.literal('')),type:z.enum(['forward','drop','worker']),target:z.string().trim().max(255),enabled:z.boolean(),priority:z.number().int().min(0).max(2147483647)});
export type RuleForm=z.infer<typeof ruleSchema>;
export type Rule={id:string;name:string;enabled:boolean;priority?:number;source?:string;actions:{type:string;value?:string[]}[];matchers:{type:string;field?:string;value?:string}[];fingerprint?:string};
export type Destination={id:string;email:string;verified?:string|null;created?:string};
export function validateAction(form:RuleForm,domain:string,destinations:Destination[],catchAll=false){
 if(!catchAll&&(!form.email||form.email.split('@')[1]?.toLowerCase()!==domain.toLowerCase()))throw new Error('อีเมลต้นทางต้องอยู่ในโดเมนที่เลือก');
 if(form.type==='forward'&&!destinations.some(d=>d.email.toLowerCase()===form.target.toLowerCase()&&d.verified))throw new Error('เลือกอีเมลปลายทางที่ยืนยันแล้ว');
 if(form.type==='worker'&&!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(form.target))throw new Error('ชื่อ Worker ไม่ถูกต้อง');
 return {name:form.name,enabled:form.enabled,...(!catchAll?{priority:form.priority}:{}),matchers:catchAll?[{type:'all'}]:[{type:'literal',field:'to',value:form.email}],actions:[{type:form.type,...(form.type==='drop'?{}:{value:[form.target]})}]};
}
export function validateAnnotation(a:Annotation,c:Catalog){for(const kind of ['platforms','groups'] as const)if(a[kind].some(id=>!c[kind].some(i=>i.id===id)))throw new Error('หมวดหมู่ถูกเปลี่ยนแล้ว กรุณาโหลดใหม่');if(a.priority&&!c.priorities.some(i=>i.id===a.priority))throw new Error('Priority ไม่พร้อมใช้งาน');return a;}
