<?php
declare(strict_types=1);
// Project-specific gate: lint real files, then exercise PHP + isolated MySQL + browser.
if(PHP_SAPI!=='cli')exit(1);
$root=dirname(__DIR__);$count=0;
foreach(['src','templates','public','scripts','tests'] as $directory) {
    $iterator=new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root.'/'.$directory,FilesystemIterator::SKIP_DOTS));
    foreach($iterator as $file) if($file->getExtension()==='php') {
        $p=proc_open([PHP_BINARY,'-l',$file->getPathname()],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes,$root);fclose($pipes[0]);$out=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($p)!==0){fwrite(STDERR,$out.$err);exit(1);}$count++;
    }
}
echo 'PHP syntax passed: '.$count.' files'.PHP_EOL;
if(in_array('--lint',$argv,true))exit(0);
$p=proc_open([PHP_BINARY,'tests/php-suite.php',...(in_array('--ui',$argv,true)?['--ui']:[])],[0=>STDIN,1=>STDOUT,2=>STDERR],$pipes,$root);exit(proc_close($p));
