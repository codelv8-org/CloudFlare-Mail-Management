<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/bootstrap.php';
use Relaydesk\{Config,Controllers\Api,Http\AppError,Http\Response,Repositories\Database,Repositories\Workspace,Services\Auth,Services\Cloudflare};

$path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH) ?: '/';
$method=$_SERVER['REQUEST_METHOD']??'GET';
Response::headers();
try {
    // Only public/ is exposed. Unknown paths never fall back to serving source files.
    $pages=['/','/login','/logout','/signin-with-chatgpt','/signout-with-chatgpt'];
    if(!str_starts_with($path,'/api/')&&!in_array($path,$pages,true)) throw new AppError(404,'ไม่พบหน้า');
    $config=new Config(); $config->validate(); $db=new Database($config); $auth=new Auth($config,$db);
    if($path==='/api/health') {
        if($method!=='GET') throw new AppError(405,'Method ไม่รองรับ');
        $schema=$db->row('SELECT checksum FROM schema_migrations WHERE version=?',['001']);
        if(($schema['checksum']??'')!==hash_file('sha256',dirname(__DIR__).'/database/001_initial.sql')) throw new AppError(503,'ฐานข้อมูลยังไม่พร้อม กรุณาตรวจ schema setup');
        Response::json(['status'=>'ok']);
    }
    if($path==='/api/auth/login') {
        if($method!=='POST') throw new AppError(405,'Method ไม่รองรับ'); Response::sameOrigin($config->origin());
        if(!str_starts_with(strtolower($_SERVER['CONTENT_TYPE']??''),'application/x-www-form-urlencoded')) throw new AppError(415,'ต้องส่งข้อมูล form');
        if((int)($_SERVER['CONTENT_LENGTH']??0)>4096) throw new AppError(413,'ข้อมูลใหญ่เกินไป');
        $raw=file_get_contents('php://input',false,null,0,4097); if(strlen($raw)>4096) throw new AppError(413,'ข้อมูลใหญ่เกินไป'); parse_str($raw,$form);
        if(!is_string($form['email']??null)||!is_string($form['password']??null)) throw new AppError(422,'ข้อมูลเข้าสู่ระบบไม่ถูกต้อง');
        $error=$auth->login($form['email'],$form['password']); if($error==='rate_limit') header('Retry-After: 900');
        Response::redirect($config->origin().($error?'/login?error='.$error:'/'));
    }
    if($path==='/api/auth/logout') { if($method!=='POST') throw new AppError(405,'Method ไม่รองรับ'); Response::sameOrigin($config->origin()); $auth->logout(); Response::redirect($config->origin().'/login'); }
    if(str_starts_with($path,'/api/')) {
        $owner=$auth->requireOwner(); if(!in_array($method,['GET','POST'],true)) throw new AppError(405,'Method ไม่รองรับ');
        if($method==='POST') { Response::sameOrigin($config->origin()); if(($_SERVER['HTTP_X_RELAYDESK_REQUEST']??'')!=='1') throw new AppError(403,'ไม่อนุญาตคำขอข้ามเว็บไซต์'); }
        $api=new Api($config,new Workspace($db),new Cloudflare()); Response::json($api->handle(substr($path,5),$method,$owner,$method==='POST'?Response::body():[],$_GET));
    }
    if($method!=='GET') throw new AppError(405,'Method ไม่รองรับ');
    if($path==='/signin-with-chatgpt') Response::redirect('/login');
    if($path==='/signout-with-chatgpt') Response::redirect('/logout');
    if($path==='/login') { if($auth->owner()) Response::redirect('/'); $error=($_GET['error']??'')==='rate_limit'?'เข้าสู่ระบบถี่เกินไป กรุณารอ 15 นาที':(isset($_GET['error'])?'อีเมลหรือรหัสผ่านไม่ถูกต้อง':''); require dirname(__DIR__).'/templates/login.php'; exit; }
    $owner=$auth->owner(); if(!$owner) Response::redirect('/login',307);
    if($path==='/logout') { require dirname(__DIR__).'/templates/logout.php'; exit; }
    $email=$config->get('ADMIN_EMAIL'); require dirname(__DIR__).'/templates/workspace.php';
} catch(AppError $e) { if($e->status===405) header('Allow: GET, POST'); Response::json(['error'=>$e->getMessage()],$e->status); }
catch(Throwable $e) { error_log('[relaydesk] Request failed type='.get_class($e)); Response::json(['error'=>'ระบบจัดเก็บหรือประมวลผลไม่พร้อม กรุณารีเฟรชตรวจสอบก่อนทำรายการซ้ำ'],503); }
