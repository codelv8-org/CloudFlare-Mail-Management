<?php
declare(strict_types=1);
require dirname(__DIR__).'/src/bootstrap.php';
use Relaydesk\Config;
use Relaydesk\Repositories\Database;

if(PHP_SAPI!=='cli') exit(1);
$command=$argv[1]??'help';
try {
    if($command==='key') { echo base64_encode(random_bytes(32)).PHP_EOL; exit; }
    if($command==='password') {
        if(!in_array('argon2id',password_algos(),true)) throw new RuntimeException('Argon2id is unavailable');
        fwrite(STDERR,"Password (12–256 characters): ");
        // Unix hides input; Windows prompts through PowerShell SecureString without echoing the password.
        if(PHP_OS_FAMILY==='Windows') {
            $code='$p = Read-Host -AsSecureString; $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($p); try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }';
            $proc=proc_open(['powershell.exe','-NoProfile','-Command',$code],[0=>STDIN,1=>['pipe','w'],2=>STDERR],$pipes);
            if(!is_resource($proc)) throw new RuntimeException('Cannot open secure password prompt'); $password=stream_get_contents($pipes[1]); fclose($pipes[1]); if(proc_close($proc)!==0) throw new RuntimeException('Password prompt failed');
        } else {
            $mode=trim((string)shell_exec('stty -g')); if(!$mode) throw new RuntimeException('Run in an interactive terminal');
            shell_exec('stty -echo'); try { $password=rtrim((string)fgets(STDIN),"\r\n"); } finally { shell_exec('stty '.escapeshellarg($mode)); fwrite(STDERR,PHP_EOL); }
        }
        if(mb_strlen($password)<12||mb_strlen($password)>256) throw new RuntimeException('Use a password of 12–256 characters');
        echo password_hash($password,PASSWORD_ARGON2ID).PHP_EOL; unset($password); exit;
    }
    if(!in_array($command,['check','migrate','migrate-dry-run'],true)) { echo "Usage: php scripts/setup.php check|key|password|migrate-dry-run|migrate\n"; exit($command==='help'?0:1); }
    foreach(['pdo_mysql','curl','openssl','mbstring'] as $ext) if(!extension_loaded($ext)) throw new RuntimeException('Missing extension: '.$ext);
    if(version_compare(PHP_VERSION,'8.3','<')) throw new RuntimeException('PHP 8.3+ required');
    $config=new Config(); $config->validate(); $db=new Database($config);
    $sql=file_get_contents(dirname(__DIR__).'/database/001_initial.sql'); $checksum=hash('sha256',$sql);
    if($command==='check') { $db->query('SELECT 1'); echo "PHP configuration and MySQL connection OK\n"; exit; }
    if($command==='migrate-dry-run') {
        $tables=$db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        echo 'Target database: '.$config->get('DB_NAME').PHP_EOL.'Schema checksum: '.$checksum.PHP_EOL;
        if($tables) { if(!in_array('schema_migrations',$tables,true)) throw new RuntimeException('Database is not empty; migration refused'); $row=$db->row('SELECT checksum FROM schema_migrations WHERE version=?',['001']); if(($row['checksum']??null)!==$checksum) throw new RuntimeException('Schema checksum mismatch or incomplete migration'); echo "Schema already applied; no changes\n"; }
        else echo "Empty database; 7 application tables and migration ledger will be created\n";
        exit;
    }
    // MySQL DDL is not transactional. Refuse mixed/partially initialized databases rather than guessing recovery.
    $lock=$db->row('SELECT GET_LOCK(?,10) AS acquired',['relaydesk-schema-'.$config->get('DB_NAME')]); if((int)$lock['acquired']!==1) throw new RuntimeException('Migration lock unavailable');
    try {
        $tables=$db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        if($tables) { if(!in_array('schema_migrations',$tables,true)) throw new RuntimeException('Database is not empty; migration refused'); $row=$db->row('SELECT checksum FROM schema_migrations WHERE version=?',['001']); if(($row['checksum']??null)!==$checksum) throw new RuntimeException('Schema checksum mismatch or incomplete migration'); echo "Schema already applied\n"; }
        else {
            $db->query('CREATE TABLE schema_migrations(version VARCHAR(20) CHARACTER SET ascii PRIMARY KEY,checksum CHAR(64) CHARACTER SET ascii NOT NULL, applied_at DATETIME NOT NULL) ENGINE=InnoDB');
            foreach(explode(';',$sql) as $statement) if(trim($statement)!=='') $db->pdo->exec($statement);
            $db->query('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,UTC_TIMESTAMP())',['001',$checksum]); echo "Schema 001 applied\n";
        }
    } finally { $db->query('SELECT RELEASE_LOCK(?)',['relaydesk-schema-'.$config->get('DB_NAME')]); }
} catch(Throwable $e) { fwrite(STDERR,'Setup failed: '.($e instanceof PDOException?'MySQL operation failed; verify connection, permissions and schema state':$e->getMessage()).PHP_EOL); exit(1); }
