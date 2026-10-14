<?php
declare(strict_types=1);
namespace Relaydesk\Repositories;
use Relaydesk\Services\Domain;
use Relaydesk\Http\AppError;
final class Workspace
{
    public function __construct(public readonly Database $db) {}
    public function catalog(string $owner,bool $lock=false): array
    {
        if($lock) $this->db->query('INSERT IGNORE INTO catalogs(owner,data,revision) VALUES(?,?,0)',[$owner,json_encode(Domain::defaults(),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
        $row=$this->db->row('SELECT data,revision FROM catalogs WHERE owner=?'.($lock?' FOR UPDATE':''),[$owner]);
        return ['data'=>$row?json_decode($row['data'],true,32,JSON_THROW_ON_ERROR):Domain::defaults(),'revision'=>(int)($row['revision']??0)];
    }
    public function saveCatalog(string $owner,array $catalog,int $revision): array
    {
        return $this->db->transaction(function() use ($owner,$catalog,$revision) {
            $old=$this->catalog($owner,true); if($old['revision']!==$revision) throw new AppError(409,'มีการแก้ไขจากหน้าอื่น กรุณารีเฟรช');
            foreach($this->db->query('SELECT data FROM annotations WHERE owner=?',[$owner])->fetchAll() as $row) Domain::annotation(json_decode($row['data'],true,32,JSON_THROW_ON_ERROR),$catalog);
            $this->db->query('UPDATE catalogs SET data=?,revision=revision+1 WHERE owner=? AND revision=?',[json_encode($catalog,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$owner,$revision]); return ['revision'=>$revision+1];
        });
    }
    public function annotations(string $owner,string $zone): array { return $this->db->query('SELECT rule,data FROM annotations WHERE owner=? AND zone=?',[$owner,$zone])->fetchAll(); }
    public function saveAnnotations(string $owner,string $zone,array $rules,array $data): array
    {
        return $this->db->transaction(function() use($owner,$zone,$rules,$data) {
            $catalog=$this->catalog($owner,true); $clean=Domain::annotation($data,$catalog['data']);
            foreach($rules as $rule) $this->db->query('INSERT INTO annotations(owner,zone,rule,data) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE data=?',[$owner,$zone,$rule,json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),json_encode($clean,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
            return ['updated'=>count($rules)];
        });
    }
    public function audited(string $owner,string $action,string $target,mixed $before,callable $run): array
    {
        $hex=bin2hex(random_bytes(16)); $id=substr($hex,0,8).'-'.substr($hex,8,4).'-4'.substr($hex,13,3).'-a'.substr($hex,17,3).'-'.substr($hex,20,12);
        $this->db->query('INSERT INTO audit(id,owner,action,target,`before`,outcome,created) VALUES(?,?,?,?,?,?,?)',[$id,$owner,$action,$target,json_encode($before,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),'pending',gmdate('Y-m-d\TH:i:s.000\Z')]);
        try { $value=$run(); } catch(\Throwable $e) { try { $this->db->query('UPDATE audit SET outcome=? WHERE id=? AND owner=?',[$e instanceof AppError && $e->status===502?'ตรวจสอบผลอีกครั้ง':'failed',$id,$owner]); } catch(\Throwable) {} throw $e; }
        try { $this->db->query('UPDATE audit SET outcome=? WHERE id=? AND owner=?',['succeeded',$id,$owner]); } catch(\Throwable) { return ['result'=>$value,'warning'=>'ดำเนินการแล้ว แต่บันทึกผล Audit ไม่สำเร็จ ห้ามทำรายการซ้ำ ให้รีเฟรชตรวจสอบ']; }
        return ['result'=>$value];
    }
}
