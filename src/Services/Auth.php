<?php
declare(strict_types=1);
namespace Relaydesk\Services;
use Relaydesk\Config;
use Relaydesk\Repositories\Database;
use Relaydesk\Http\AppError;
final class Auth
{
    public const COOKIE='relaydesk_session';
    public const SECONDS=28800;
    public function __construct(private Config $config, private Database $db) {}
    public function encode(string $id): string { return $id.'.'.rtrim(strtr(base64_encode(hash_hmac('sha256',$id,$this->config->get('SESSION_SECRET'),true)),'+/','-_'),'='); }
    public function decode(?string $cookie): ?string { if(!is_string($cookie)||!preg_match('/^([a-f0-9]{64})\.([A-Za-z0-9_-]{43})$/D',$cookie,$m)) return null; return hash_equals($this->encode($m[1]),$cookie)?$m[1]:null; }
    public function owner(): ?string
    {
        $id=$this->decode($_COOKIE[self::COOKIE]??null); if(!$id) return null;
        $row=$this->db->row('SELECT owner FROM sessions WHERE id=? AND expires>?',[$id,time()*1000]);
        return ($row['owner']??null)===$this->config->owner()?$row['owner']:null;
    }
    private function cookie(string $value, int $expires): void { setcookie(self::COOKIE,$value,['expires'=>$expires,'path'=>'/','secure'=>str_starts_with($this->config->origin(),'https:'),'httponly'=>true,'samesite'=>'Lax']); }
    public function login(string $email, string $password): string
    {
        if($this->db->increment('auth_attempts','admin',(int)floor(time()/900))>10) return 'rate_limit';
        $valid=mb_strlen($password)<=256 && password_verify($password,$this->config->get('ADMIN_PASSWORD_HASH'));
        if(!$valid || strtolower(trim($email))!==strtolower(trim($this->config->get('ADMIN_EMAIL')))) return '1';
        $id=bin2hex(random_bytes(32));
        $this->db->transaction(function () use ($id) {
            $this->db->query('DELETE FROM sessions WHERE expires<=?',[time()*1000]);
            $old=$this->decode($_COOKIE[self::COOKIE]??null); if($old) $this->db->query('DELETE FROM sessions WHERE id=?',[$old]);
            $this->db->query('INSERT INTO sessions(id,owner,expires) VALUES(?,?,?)',[$id,$this->config->owner(),(time()+self::SECONDS)*1000]);
        });
        $this->cookie($this->encode($id),time()+self::SECONDS); return '';
    }
    public function logout(): void { $id=$this->decode($_COOKIE[self::COOKIE]??null); if($id) $this->db->query('DELETE FROM sessions WHERE id=?',[$id]); $this->cookie('',time()-3600); }
    public function requireOwner(): string { return $this->owner()??throw new AppError(401,'กรุณาเข้าสู่ระบบ Relaydesk'); }
}
