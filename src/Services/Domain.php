<?php
declare(strict_types=1);
namespace Relaydesk\Services;
use Relaydesk\Http\AppError;
final class Domain
{
    public static function defaults(): array { return ['platforms'=>[['id'=>'chatgpt','name'=>'ChatGPT','color'=>'#8DD8BE','logo'=>'/logos/openai.svg','rank'=>0],['id'=>'claude','name'=>'Claude AI','color'=>'#DEA98B','logo'=>'/logos/claude.svg','rank'=>1]],'groups'=>[['id'=>'admin','name'=>'Admin','color'=>'#B8A6FF','logo'=>'','rank'=>0],['id'=>'staff','name'=>'Staff','color'=>'#83C9ED','logo'=>'','rank'=>1],['id'=>'member','name'=>'Member','color'=>'#9FD4B6','logo'=>'','rank'=>2]],'priorities'=>[['id'=>'high','name'=>'สูง','color'=>'#FFB0B8','logo'=>'','rank'=>0],['id'=>'normal','name'=>'ปกติ','color'=>'#E1CE9B','logo'=>'','rank'=>50],['id'=>'low','name'=>'ต่ำ','color'=>'#91C9D9','logo'=>'','rank'=>100]]]; }
    public static function text(mixed $value,int $min,int $max,string $field,bool $trim=true): string { if(!is_string($value)) throw new AppError(422,$field.': ต้องเป็นข้อความ'); $value=$trim?trim($value):$value; if(mb_strlen($value)<$min||mb_strlen($value)>$max) throw new AppError(422,$field.': ความยาวไม่ถูกต้อง'); return $value; }
    public static function integer(mixed $value,int $min,int $max,string $field): int { if(!is_int($value)||$value<$min||$value>$max) throw new AppError(422,$field.': ต้องเป็นจำนวนเต็มในช่วงที่กำหนด'); return $value; }
    public static function boolean(mixed $value,string $field): bool { if(!is_bool($value)) throw new AppError(422,$field.': ต้องเป็น boolean'); return $value; }
    public static function id(mixed $value,bool $local=false): string { if(!is_string($value)||!preg_match($local?'/^[a-zA-Z0-9_-]{1,80}$/D':'/^[a-f0-9]{32}$/iD',$value)) throw new AppError(422,'ID ไม่ถูกต้อง'); return $local?$value:strtolower($value); }
    public static function email(mixed $value): string { $v=self::text($value,1,90,'email'); if(!filter_var($v,FILTER_VALIDATE_EMAIL)) throw new AppError(422,'อีเมลไม่ถูกต้อง'); return $v; }
    public static function choice(mixed $v,array $values,string $field): string { if(!in_array($v,$values,true)) throw new AppError(422,$field.': ค่าไม่ถูกต้อง'); return $v; }
    public static function list(mixed $v,int $min,int $max,string $field): array { if(!is_array($v)||!array_is_list($v)||count($v)<$min||count($v)>$max) throw new AppError(422,$field.': รายการไม่ถูกต้อง'); return $v; }
    public static function logo(string $logo): void
    {
        if($logo==='' || preg_match('~^/logos/[a-z0-9-]+\.svg$~D',$logo)) return;
        if(!preg_match('~^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$~D',$logo,$m)) throw new AppError(422,'โลโก้ต้องเป็น PNG, JPEG, WebP หรือโลโก้ในระบบ');
        $bytes=base64_decode($m[2],true); $info=$bytes===false?false:@getimagesizefromstring($bytes);
        if(!$info || $info['mime']!=='image/'.$m[1]) throw new AppError(422,'ไฟล์โลโก้ไม่ถูกต้อง');
    }
    public static function catalog(mixed $input): array
    {
        if(!is_array($input)) throw new AppError(422,'catalog ไม่ถูกต้อง'); $out=[];
        foreach(['platforms'=>100,'groups'=>100,'priorities'=>30] as $kind=>$max) {
            $list=self::list($input[$kind]??null,0,$max,$kind); $out[$kind]=[]; $ids=[]; $names=[];
            foreach($list as $item) {
                if(!is_array($item)) throw new AppError(422,'รายการไม่ถูกต้อง');
                $id=self::id($item['id']??null,true); $name=self::text($item['name']??null,1,50,'name'); $color=$item['color']??'';
                if(!is_string($color)||!preg_match('/^#[a-f0-9]{6}$/iD',$color)) throw new AppError(422,'color ไม่ถูกต้อง');
                $logo=self::text($item['logo']??'',0,60000,'logo',false); self::logo($logo);
                $rank=self::integer($item['rank']??50,0,999,'rank'); $fold=mb_strtolower($name);
                if(isset($ids[$id])||isset($names[$fold])) throw new AppError(422,'ชื่อและ ID ในหมวดเดียวกันต้องไม่ซ้ำ'); $ids[$id]=true; $names[$fold]=true;
                $out[$kind][]=['id'=>$id,'name'=>$name,'color'=>$color,'logo'=>$logo,'rank'=>$rank];
            }
        }
        return $out;
    }
    public static function annotation(mixed $input,array $catalog): array
    {
        if(!is_array($input)) throw new AppError(422,'annotation ไม่ถูกต้อง'); $out=[];
        foreach(['platforms','groups'] as $kind) { $ids=self::list($input[$kind]??null,0,100,$kind); foreach($ids as $id) { self::id($id,true); if(!in_array($id,array_column($catalog[$kind],'id'),true)) throw new AppError(422,'หมวดหมู่ถูกเปลี่ยนแล้ว กรุณาโหลดใหม่'); } $out[$kind]=array_values(array_unique($ids)); }
        $priority=$input['priority']??null; if($priority!=='') { self::id($priority,true); if(!in_array($priority,array_column($catalog['priorities'],'id'),true)) throw new AppError(422,'Priority ไม่พร้อมใช้งาน'); }
        $out['priority']=$priority; $out['note']=self::text($input['note']??null,0,2000,'note',false); return $out;
    }
    public static function action(mixed $input,string $domain,array $destinations,bool $catchAll=false): array
    {
        if(!is_array($input)) throw new AppError(422,'กรอกข้อมูลกฎ');
        $name=self::text($input['name']??null,1,256,'name'); $type=self::choice($input['type']??null,['forward','drop','worker'],'type'); $email=$input['email']??null;
        if($email!=='') $email=self::email($email); $target=self::text($input['target']??null,0,255,'target'); $enabled=self::boolean($input['enabled']??null,'enabled'); $priority=self::integer($input['priority']??null,0,2147483647,'priority');
        if(!$catchAll && (!$email||strcasecmp(substr($email,strrpos($email,'@')+1),$domain)!==0)) throw new AppError(422,'อีเมลต้นทางต้องอยู่ในโดเมนที่เลือก');
        if($type==='forward') { $verified=false; foreach($destinations as $d) if(strcasecmp($d['email'],$target)===0&&!empty($d['verified'])) $verified=true; if(!$verified) throw new AppError(422,'เลือกอีเมลปลายทางที่ยืนยันแล้ว'); }
        if($type==='worker'&&!preg_match('/^[a-z0-9][a-z0-9_-]{0,62}$/D',$target)) throw new AppError(422,'ชื่อ Worker ไม่ถูกต้อง');
        $result=['name'=>$name,'enabled'=>$enabled]; if(!$catchAll) $result['priority']=$priority;
        $result['matchers']=$catchAll?[['type'=>'all']]:[['type'=>'literal','field'=>'to','value'=>$email]];
        $result['actions']=[['type'=>$type]+($type==='drop'?[]:['value'=>[$target]])]; return $result;
    }
}
