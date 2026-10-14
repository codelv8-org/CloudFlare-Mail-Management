<?php
declare(strict_types=1);
namespace Relaydesk\Services;
use Relaydesk\Http\AppError;
final class Cloudflare
{
    private const ROOT='https://api.cloudflare.com/client/v4';
    private ?\Closure $transport;
    public function __construct(?callable $transport=null) { $this->transport=$transport===null?null:\Closure::fromCallable($transport); }
    private function request(string $url,string $token,string $method,?array $body,int $timeout): array
    {
        if($this->transport) return ($this->transport)($url,$token,$method,$body);
        $curl=curl_init($url); $raw=''; $location=null;
        curl_setopt_array($curl,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT_MS=>min(5000,$timeout),CURLOPT_TIMEOUT_MS=>$timeout,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_CUSTOMREQUEST=>$method,CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$token,'Content-Type: application/json'],CURLOPT_WRITEFUNCTION=>static function($handle,string $chunk) use (&$raw): int { if(strlen($raw)+strlen($chunk)>2000000) return 0; $raw.=$chunk; return strlen($chunk); },CURLOPT_HEADERFUNCTION=>static function($handle,string $line) use (&$location): int { if(str_starts_with(strtolower($line),'location:')) $location=trim(substr($line,9)); return strlen($line); }]);
        if($body!==null) curl_setopt($curl,CURLOPT_POSTFIELDS,json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
        $ok=curl_exec($curl); $status=curl_getinfo($curl,CURLINFO_RESPONSE_CODE); $code=curl_errno($curl); curl_close($curl);
        if($ok===false) { error_log('[relaydesk] Cloudflare transport failure code='.$code); throw new AppError(502,$method==='GET'?'ติดต่อ Cloudflare ไม่สำเร็จ กรุณาลองใหม่':'ยังยืนยันผลการเปลี่ยนแปลงไม่ได้ กรุณารีเฟรชตรวจสอบก่อนทำซ้ำ'); }
        return ['status'=>$status,'body'=>$raw,'location'=>$location];
    }
    public function call(string $token,string $path,string $method='GET',?array $body=null): array
    {
        if(!str_starts_with($path,'/')||str_starts_with($path,'//')||str_contains($path,'\\')||preg_match('/[\x00-\x20]/',$path)) throw new \LogicException('Invalid Cloudflare path');
        $start=microtime(true); $response=$this->request(self::ROOT.$path,$token,$method,$body,15000);
        if($response['status']>=300&&$response['status']<400) {
            $location=$response['location']??''; $target=str_starts_with($location,'/')&&!str_starts_with($location,'//')?'https://api.cloudflare.com'.$location:$location;
            $u=parse_url($target); $safe=$u && ($u['scheme']??'')==='https' && ($u['host']??'')==='api.cloudflare.com' && !isset($u['user']) && !isset($u['pass']) && !isset($u['fragment']) && (!isset($u['port'])||$u['port']===443) && str_starts_with($u['path']??'','/client/v4/') && !preg_match('/[\\\\\x00-\x20]/',$target);
            if($method!=='GET'||!$safe) throw new AppError(502,'Cloudflare เปลี่ยนเส้นทางคำขอไปยังปลายทางที่ไม่รองรับ ระบบไม่ได้ส่ง Token ต่อไป');
            $response=$this->request($target,$token,$method,$body,max(1,15000-(int)((microtime(true)-$start)*1000)));
            if($response['status']>=300&&$response['status']<400) throw new AppError(502,'Cloudflare เปลี่ยนเส้นทางคำขอซ้ำ ระบบไม่ได้ส่ง Token ต่อไป');
        }
        try { $data=json_decode($response['body'],true,64,JSON_THROW_ON_ERROR); } catch(\JsonException) { throw new AppError(502,'Cloudflare ส่งข้อมูลที่อ่านไม่ได้ กรุณารีเฟรชตรวจสอบ'); }
        if(!is_array($data)||!array_key_exists('success',$data)) throw new AppError(502,'รูปแบบข้อมูล Cloudflare ไม่ถูกต้อง');
        if($response['status']<200||$response['status']>=300||$data['success']!==true) {
            $codes=array_values(array_filter(array_column(is_array($data['errors']??null)?$data['errors']:[],'code'),static fn($code)=>is_int($code)&&$code>=1000&&$code<=9999));
            $status=$response['status']; error_log('[relaydesk] Cloudflare rejected status='.$status.' codes='.implode(',',$codes));
            throw new AppError($status>=400&&$status<500?$status:502,'Cloudflare ปฏิเสธคำขอ (HTTP '.$status.($codes?', code '.implode(',',$codes):'').') กรุณาตรวจสอบสิทธิ์ Token และข้อมูลที่กรอก',$codes);
        }
        if(!array_key_exists('result',$data)) throw new AppError(502,'รูปแบบข้อมูล Cloudflare ไม่ถูกต้อง'); return $data;
    }
    public function listAll(string $token,string $path): array
    {
        $items=[]; for($page=1;$page<=100;$page++) { $data=$this->call($token,$path.(str_contains($path,'?')?'&':'?').'page='.$page.'&per_page=50'); if(!is_array($data['result'])||!array_is_list($data['result'])) throw new AppError(502,'รูปแบบรายการ Cloudflare ไม่ถูกต้อง'); $items=array_merge($items,$data['result']); $info=$data['result_info']??[]; if(isset($info['total_pages'])?$page>=$info['total_pages']:(isset($info['total_count'])?count($items)>=$info['total_count']:count($data['result'])<50)) return $items; }
        throw new AppError(422,'รายการเกินขอบเขตที่โหลดได้ กรุณาจำกัดโดเมนใน Token');
    }
    public function verify(string $token,string $account): string
    {
        try { return (string)($this->call($token,'/user/tokens/verify')['result']['status']??''); } catch(AppError $e) { if(!in_array($e->status,[401,403],true)) throw $e; }
        try { return (string)($this->call($token,'/accounts/'.$account.'/tokens/verify')['result']['status']??''); } catch(AppError $e) { if(in_array($e->status,[401,403],true)) throw new AppError($e->status,'Cloudflare ปฏิเสธ Token ทั้งแบบ User และ Account ตรวจสอบชนิด Token สถานะ Active และ Account ที่ Token ผูกอยู่'); throw $e; }
    }
}
