<?php
declare(strict_types=1);
namespace Relaydesk\Controllers;
use Relaydesk\Config;
use Relaydesk\Http\AppError;
use Relaydesk\Repositories\Workspace;
use Relaydesk\Services\{Cloudflare,Crypto,Domain};
final class Api
{
    public function __construct(private Config $config,private Workspace $workspace,private Cloudflare $cf) {}
    public function handle(string $route,string $method,string $owner,array $body=[],array $query=[]): mixed
    {
        $write=$method==='POST';
        $routes=['state'=>'GET','connection'=>'POST','disconnect'=>'POST','catalog'=>'POST','audit'=>'GET','zones'=>'GET','destinations'=>'GET','destination'=>'POST','zone'=>'GET','annotations'=>'POST','rule'=>'POST','settings'=>'POST'];
        if(!isset($routes[$route])) throw new AppError(404,'ไม่พบคำสั่ง');
        if($method!==$routes[$route]) throw new AppError(405,'Method ไม่รองรับ');
        $db=$this->workspace->db;
        if($db->increment('limits',$owner,(int)floor(time()/60))>60) throw new AppError(429,'คำขอถี่เกินไป กรุณารอหนึ่งนาที');
        if($route==='state') { $c=$this->workspace->catalog($owner); return ['connection'=>$db->row('SELECT account,updated FROM connections WHERE owner=?',[$owner]),'catalog'=>$c['data'],'revision'=>$c['revision'],'secureStorage'=>true]; }
        if($route==='connection') {
            $account=Domain::id($body['account']??null); $token=Domain::text($body['token']??null,20,500,'token');
            if(!preg_match('/^[A-Za-z0-9_-]+$/D',$token)) throw new AppError(422,'Token ไม่ถูกต้อง');
            if($this->cf->verify($token,$account)!=='active') throw new AppError(422,'Cloudflare Token นี้ไม่อยู่ในสถานะ Active กรุณาใช้ Token ที่ยังใช้งานได้');
            try { $zones=$this->cf->listAll($token,'/zones?account.id='.$account); } catch(AppError $e) { if($e->status===403 && in_array(9109,$e->codes,true)) throw new AppError(403,'Token ใช้งานได้ แต่ Cloudflare ปฏิเสธการอ่านโดเมน ตรวจสิทธิ์ Zone · Zone · Read และขอบเขต Account/Resources'); throw $e; }
            if(!$zones) throw new AppError(422,'ไม่พบโดเมนที่ Token เข้าถึงได้ใน Account นี้');
            try { $this->cf->call($token,'/accounts/'.$account.'/email/routing/addresses?per_page=1'); } catch(AppError $e) { if($e->status===403 && in_array(9109,$e->codes,true)) throw new AppError(403,'Token และโดเมนใช้งานได้ แต่ Cloudflare ปฏิเสธ Email Routing Addresses ตรวจสิทธิ์ Account · Email Routing Addresses · Read และ Account scope'); throw $e; }
            $ciphertext=Crypto::encrypt($token,$this->config->get('TOKEN_ENCRYPTION_KEY'),$owner);
            return $this->workspace->audited($owner,'connection.save',$account,null,function() use($db,$owner,$account,$ciphertext) { $updated=gmdate('Y-m-d\TH:i:s.000\Z'); $db->query('INSERT INTO connections(owner,account,ciphertext,updated) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE account=?,ciphertext=?,updated=?',[$owner,$account,$ciphertext,$updated,$account,$ciphertext,$updated]); return ['connected'=>true]; });
        }
        if($route==='disconnect') { if(($body['confirm']??null)!=='DISCONNECT') throw new AppError(422,'พิมพ์ DISCONNECT เพื่อยืนยัน'); return $this->workspace->audited($owner,'connection.remove','Cloudflare',null,function() use($db,$owner) { $db->query('DELETE FROM connections WHERE owner=?',[$owner]); return ['disconnected'=>true]; }); }
        if($route==='catalog') { $clean=Domain::catalog($body['catalog']??null); $revision=Domain::integer($body['revision']??null,0,2147483647,'revision'); $old=$this->workspace->catalog($owner); if($old['revision']!==$revision) throw new AppError(409,'มีการแก้ไขจากหน้าอื่น กรุณารีเฟรช'); return $this->workspace->audited($owner,'catalog.update','หมวดหมู่',$old['data'],fn()=>$this->workspace->saveCatalog($owner,$clean,$revision)); }
        if($route==='audit') return $db->query('SELECT id,action,target,`before`,outcome,created FROM audit WHERE owner=? ORDER BY created DESC,id DESC LIMIT 100',[$owner])->fetchAll();
        $conn=$db->row('SELECT account,ciphertext FROM connections WHERE owner=?',[$owner]); if(!$conn) throw new AppError(409,'กรุณาเชื่อมต่อ Cloudflare ก่อน');
        $account=$conn['account']; $token=Crypto::decrypt($conn['ciphertext'],$this->config->get('TOKEN_ENCRYPTION_KEY'),$owner); $addresses='/accounts/'.$account.'/email/routing/addresses';
        if($route==='zones') return $this->cf->listAll($token,'/zones?account.id='.$account);
        if($route==='destinations') return $this->cf->listAll($token,$addresses);
        if($route==='destination') {
            $action=Domain::choice($body['action']??null,['create','delete'],'action');
            if($action==='create') { $email=Domain::email($body['email']??null); return $this->workspace->audited($owner,'destination.create',$email,null,fn()=>$this->cf->call($token,$addresses,'POST',['email'=>$email])['result']); }
            $id=Domain::id($body['id']??null); $old=$this->cf->call($token,$addresses.'/'.$id)['result']; if(($body['confirm']??null)!==$old['email']) throw new AppError(422,'พิมพ์อีเมลปลายทางเพื่อยืนยัน'); return $this->workspace->audited($owner,'destination.delete',$old['email'],$old,fn()=>$this->cf->call($token,$addresses.'/'.$id,'DELETE')['result']);
        }
        $zone=Domain::id($write?($body['zone']??null):($query['zone']??null)); $zoneInfo=$this->cf->call($token,'/zones/'.$zone)['result'];
        if(($zoneInfo['account']['id']??null)!==$account) throw new AppError(403,'โดเมนไม่อยู่ในบัญชีที่เชื่อมต่อ'); $root='/zones/'.$zone.'/email/routing';
        if($route==='zone') {
            $part=static function(callable $fn): array { try { return ['data'=>$fn(),'error'=>null]; } catch(\Throwable $e) { return ['data'=>null,'error'=>$e instanceof AppError?$e->getMessage():'ข้อมูลไม่พร้อม']; } };
            $rules=$part(fn()=>array_map(static function(array $r): array { $r['fingerprint']=Crypto::fingerprint($r); return $r; },$this->cf->listAll($token,$root.'/rules')));
            $settings=$part(fn()=>$this->cf->call($token,$root)['result']); $dns=$part(fn()=>$this->cf->call($token,$root.'/dns')['result']);
            $dnsRecords=$part(fn()=>[$this->cf->listAll($token,'/zones/'.$zone.'/dns_records?type=MX'),$this->cf->listAll($token,'/zones/'.$zone.'/dns_records?type=TXT')]);
            $catchall=$part(function() use($token,$root) { $r=$this->cf->call($token,$root.'/rules/catch_all')['result']; $r['fingerprint']=Crypto::fingerprint($r); return $r; });
            $destinations=$part(fn()=>$this->cf->listAll($token,$addresses)); $meta=[];
            foreach($this->workspace->annotations($owner,$zone) as $r) $meta[$r['rule']]=json_decode($r['data'],true,32,JSON_THROW_ON_ERROR);
            return ['zone'=>$zoneInfo,'rules'=>$rules,'settings'=>$settings,'dns'=>$dns,'dnsRecords'=>$dnsRecords,'catchall'=>$catchall,'destinations'=>$destinations,'annotations'=>(object)$meta,'loadedAt'=>gmdate('Y-m-d\TH:i:s.000\Z')];
        }
        if($route==='annotations') {
            $rules=array_values(array_unique(array_map(static fn($id)=>Domain::id($id),Domain::list($body['rules']??null,1,100,'rules'))));
            $catalog=$this->workspace->catalog($owner); $data=Domain::annotation($body['data']??null,$catalog['data']);
            $known=array_column($this->cf->listAll($token,$root.'/rules'),'id'); foreach($rules as $id) if(!in_array($id,$known,true)) throw new AppError(422,'ไม่พบกฎในโดเมนนี้');
            return $this->workspace->audited($owner,'annotations.update',$zoneInfo['name'],$this->workspace->annotations($owner,$zone),fn()=>$this->workspace->saveAnnotations($owner,$zone,$rules,$data));
        }
        if($route==='rule') {
            $action=Domain::choice($body['action']??null,['create','update','delete','catchall'],'action'); $isCatch=$action==='catchall'; $previous=null; $path=$root.'/rules';
            if($action!=='create') { $path.='/'.($isCatch?'catch_all':Domain::id($body['id']??null)); $previous=$this->cf->call($token,$path)['result']; if(($previous['source']??'')==='wrangler') throw new AppError(409,'กฎนี้จัดการผ่าน Wrangler กรุณาแก้ไขที่ต้นทาง'); if(!is_string($body['fingerprint']??null)||!hash_equals(Crypto::fingerprint($previous),$body['fingerprint'])) throw new AppError(409,'กฎถูกเปลี่ยนแล้ว กรุณารีเฟรชก่อนบันทึก'); }
            if($action==='delete') { if(($body['confirm']??null)!==($previous['matchers'][0]['value']??null)) throw new AppError(422,'พิมพ์อีเมลต้นทางเพื่อยืนยัน'); return $this->workspace->audited($owner,'rule.delete',$zoneInfo['name'],$previous,fn()=>$this->cf->call($token,$path,'DELETE')['result']); }
            $dest=($body['rule']['type']??'')==='forward'?$this->cf->listAll($token,$addresses):[]; $payload=Domain::action($body['rule']??null,$zoneInfo['name'],$dest,$isCatch);
            return $this->workspace->audited($owner,'rule.'.$action,$zoneInfo['name'],$previous,fn()=>$this->cf->call($token,$path,$action==='create'?'POST':'PUT',$payload)['result']);
        }
        if($route==='settings') {
            $action=Domain::choice($body['action']??null,['enable','disable','unlock','subaddress'],'action'); if(($body['confirm']??null)!==$zoneInfo['name']) throw new AppError(422,'พิมพ์ชื่อโดเมนเพื่อยืนยัน');
            $payload=$action==='subaddress'?['support_subaddress'=>Domain::boolean($body['enabled']??null,'enabled')]:($action==='disable'?null:['name'=>$zoneInfo['name']]);
            $before=['settings'=>$this->cf->call($token,$root)['result'],'dns'=>$this->cf->call($token,$root.'/dns')['result']];
            return $this->workspace->audited($owner,'settings.'.$action,$zoneInfo['name'],$before,fn()=>$this->cf->call($token,$root.($action==='subaddress'?'':'/dns'),['enable'=>'POST','disable'=>'DELETE','unlock'=>'PATCH','subaddress'=>'PATCH'][$action],$payload)['result']);
        }
        throw new AppError(404,'ไม่พบคำสั่ง');
    }
}
