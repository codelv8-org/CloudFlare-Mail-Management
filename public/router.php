<?php
declare(strict_types=1);
// Development only: php -S 127.0.0.1:8080 -t public public/router.php
$path=parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH) ?: '/';
$file=realpath(__DIR__.$path);
if($file && str_starts_with($file,__DIR__.DIRECTORY_SEPARATOR) && is_file($file) && preg_match('~^/(assets|fonts|logos)/[A-Za-z0-9_./-]+\.(css|js|woff2|svg|png|jpg|webp)$~D',$path)) return false;
if($path==='/favicon.svg') return false;
require __DIR__.'/index.php';
