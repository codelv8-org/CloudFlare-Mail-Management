<?php
declare(strict_types=1);
namespace Relaydesk\Repositories;
use Relaydesk\Config;
final class Database
{
    public readonly \PDO $pdo;
    public function __construct(Config $config)
    {
        $this->pdo = new \PDO('mysql:host='.$config->get('DB_HOST', '127.0.0.1').';port='.$config->get('DB_PORT', '3306').';dbname='.$config->get('DB_NAME').';charset=utf8mb4', $config->get('DB_USER'), $config->get('DB_PASSWORD'), [\PDO::ATTR_ERRMODE=>\PDO::ERRMODE_EXCEPTION, \PDO::ATTR_EMULATE_PREPARES=>false, \PDO::ATTR_DEFAULT_FETCH_MODE=>\PDO::FETCH_ASSOC]);
        $this->pdo->exec("SET time_zone = '+00:00'");
    }
    public function query(string $sql, array $args = []): \PDOStatement { $stmt=$this->pdo->prepare($sql); $stmt->execute($args); return $stmt; }
    public function row(string $sql, array $args = []): ?array { return $this->query($sql,$args)->fetch() ?: null; }
    public function transaction(callable $run): mixed
    {
        $this->pdo->beginTransaction();
        try { $result=$run(); $this->pdo->commit(); return $result; } catch (\Throwable $e) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw $e; }
    }
    public function increment(string $table, string $key, int $window): int
    {
        if (!in_array($table, ['limits','auth_attempts'], true)) throw new \LogicException('Invalid counter');
        $column = $table === 'limits' ? 'owner' : 'key';
        return $this->transaction(function () use ($table,$column,$key,$window) {
            $this->query("INSERT INTO `$table` (`$column`,`window`,`count`) VALUES(?,?,1) ON DUPLICATE KEY UPDATE `count`=IF(`window`=?,`count`+1,1),`window`=?", [$key,$window,$window,$window]);
            return (int)$this->row("SELECT `count` FROM `$table` WHERE `$column`=? FOR UPDATE", [$key])['count'];
        });
    }
}
