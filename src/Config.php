<?php
declare(strict_types=1);
namespace Relaydesk;

final class Config
{
    private array $values;
    public function __construct(?array $values = null)
    {
        $file = dirname(__DIR__) . '/.env';
        $loaded = [];
        if ($values === null && is_file($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES) as $line) {
                if (preg_match('/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/', $line, $match)) {
                    $value = $match[2];
                    if (strlen($value) >= 2 && in_array($value[0], ["'", '"'], true) && $value[0] === substr($value, -1)) $value = substr($value, 1, -1);
                    $loaded[$match[1]] = $value;
                }
            }
        }
        $keys = ['APP_ENV','APP_URL','ADMIN_EMAIL','ADMIN_PASSWORD_HASH','SESSION_SECRET','TOKEN_ENCRYPTION_KEY','DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD'];
        $this->values = $values ?? [];
        if ($values === null) foreach ($keys as $key) $this->values[$key] = getenv($key) !== false ? getenv($key) : ($loaded[$key] ?? '');
    }
    public function get(string $key, string $default = ''): string { return (string) ($this->values[$key] ?? $default); }
    public function validate(): void
    {
        if (!in_array($this->get('APP_ENV'), ['production','development','test'], true)) throw new \RuntimeException('Invalid APP_ENV');
        $url = parse_url($this->get('APP_URL'));
        $local = in_array($url['host'] ?? '', ['localhost','127.0.0.1','[::1]'], true);
        if (!$url || isset($url['user']) || isset($url['pass']) || isset($url['query']) || isset($url['fragment']) || !in_array($url['path'] ?? '', ['', '/'], true) || !isset($url['host']) || (($url['scheme'] ?? '') !== 'https' && !($this->get('APP_ENV') !== 'production' && $local && ($url['scheme'] ?? '') === 'http'))) throw new \RuntimeException('Invalid APP_URL');
        if (!filter_var($this->get('ADMIN_EMAIL'), FILTER_VALIDATE_EMAIL)) throw new \RuntimeException('Invalid ADMIN_EMAIL');
        if ((password_get_info($this->get('ADMIN_PASSWORD_HASH'))['algoName'] ?? '') !== 'argon2id') throw new \RuntimeException('ADMIN_PASSWORD_HASH must use Argon2id');
        foreach (['SESSION_SECRET','TOKEN_ENCRYPTION_KEY'] as $key) if (strlen(base64_decode($this->get($key), true) ?: '') !== 32) throw new \RuntimeException('Invalid ' . $key);
        if (!preg_match('/^[A-Za-z0-9_]{1,64}$/D', $this->get('DB_NAME')) || $this->get('DB_USER') === '' || !ctype_digit($this->get('DB_PORT', '3306')) || (int)$this->get('DB_PORT', '3306') < 1 || (int)$this->get('DB_PORT', '3306') > 65535) throw new \RuntimeException('Invalid database configuration');
        if (!preg_match('/^[A-Za-z0-9.:-]+$/D', $this->get('DB_HOST', '127.0.0.1'))) throw new \RuntimeException('Invalid DB_HOST');
    }
    public function origin(): string { return rtrim($this->get('APP_URL'), '/'); }
    public function owner(): string { return 'admin_' . hash('sha256', strtolower(trim($this->get('ADMIN_EMAIL')))); }
}
