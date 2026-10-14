<?php
declare(strict_types=1);
namespace Relaydesk\Http;
final class Response
{
    public static function headers(): void
    {
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        // no-referrer makes browser form POST Origin null and breaks strict same-origin login.
        header('Referrer-Policy: same-origin');
        header('X-Frame-Options: DENY');
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    }
    public static function json(mixed $value, int $status = 200): never { self::headers(); http_response_code($status); header('Content-Type: application/json; charset=utf-8'); echo json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR); exit; }
    public static function redirect(string $location, int $status = 303): never { self::headers(); header('Location: ' . $location, true, $status); exit; }
    public static function sameOrigin(string $origin): void { if (($_SERVER['HTTP_ORIGIN'] ?? '') !== $origin) throw new AppError(403, 'ไม่อนุญาตคำขอข้ามเว็บไซต์'); }
    public static function body(int $limit = 300000): array
    {
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) throw new AppError(415, 'ต้องส่งข้อมูล JSON');
        if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) throw new AppError(413, 'ข้อมูลใหญ่เกินไป');
        $raw = file_get_contents('php://input', false, null, 0, $limit + 1);
        if (strlen($raw) > $limit) throw new AppError(413, 'ข้อมูลใหญ่เกินไป');
        try { $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); } catch (\JsonException) { throw new AppError(400, 'JSON ไม่ถูกต้อง'); }
        if (!is_array($body) || array_is_list($body) && $body !== []) throw new AppError(422, 'ข้อมูลต้องเป็น JSON object');
        return $body;
    }
}
