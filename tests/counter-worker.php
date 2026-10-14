<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/bootstrap.php';
$config=new Relaydesk\Config(); $config->validate();
if($config->get('APP_ENV')!=='test'||!str_starts_with($config->get('DB_NAME'),'relaydesk_test_')) exit(2);
$db=new Relaydesk\Repositories\Database($config);
if(($argv[1]??'')==='catalog') {
    $workspace=new Relaydesk\Repositories\Workspace($db);
    try { $workspace->saveCatalog('race-owner',Relaydesk\Services\Domain::defaults(),0); echo 'saved'; }
    catch(Relaydesk\Http\AppError $e) { echo $e->status; }
} else for($i=0;$i<10;$i++) $db->increment('limits','concurrent-owner',123);
