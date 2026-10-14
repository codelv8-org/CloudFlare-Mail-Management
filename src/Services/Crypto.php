<?php
declare(strict_types=1);
namespace Relaydesk\Services;
final class Crypto
{
    private static function key(string $secret): string { $key=base64_decode($secret,true); if ($key===false || strlen($key)!==32) throw new \RuntimeException('Invalid encryption key'); return $key; }
    public static function encrypt(string $token, string $secret, string $owner): string { $iv=random_bytes(12); $tag=''; $data=openssl_encrypt($token,'aes-256-gcm',self::key($secret),OPENSSL_RAW_DATA,$iv,$tag,$owner,16); if ($data===false) throw new \RuntimeException('Encryption failed'); return base64_encode($iv).'.'.base64_encode($data.$tag); }
    public static function decrypt(string $value, string $secret, string $owner): string
    {
        $parts=explode('.',$value); if(count($parts)!==2) throw new \RuntimeException('Invalid ciphertext');
        $iv=base64_decode($parts[0],true); $data=base64_decode($parts[1],true);
        if($iv===false || strlen($iv)!==12 || $data===false || strlen($data)<16) throw new \RuntimeException('Invalid ciphertext');
        $plain=openssl_decrypt(substr($data,0,-16),'aes-256-gcm',self::key($secret),OPENSSL_RAW_DATA,$iv,substr($data,-16),$owner);
        if($plain===false) throw new \RuntimeException('Decryption failed'); return $plain;
    }
    public static function fingerprint(mixed $value): string { return hash('sha256',json_encode($value,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_PRESERVE_ZERO_FRACTION|JSON_THROW_ON_ERROR)); }
}
